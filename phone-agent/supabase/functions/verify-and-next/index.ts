// ============================================================================
// Phone Agent · Edge Function: verify-and-next
// Tras ejecutar un paso, recibe el screenshot posterior y responde:
// ¿se ejecutó correctamente?, ¿cuál es el siguiente paso o la corrección?,
// ¿hay que parar? Actualiza session_steps y agent_sessions.
// Deploy: supabase functions deploy verify-and-next
// ============================================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const ALLOWED_ACTIONS = ["tap","swipe","type","scroll","wait","open_app","read","verify","back","home","long_press","clear_text","press_enter","request_confirmation","done"];
const DEFAULT_MODEL = "claude-sonnet-4-20250514";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status, headers: { ...CORS, "Content-Type": "application/json" },
  });
}
function extractJson(text: string): Record<string, unknown> {
  const clean = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  const start = clean.indexOf("{"), end = clean.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("El LLM no devolvió JSON: " + text.slice(0, 300));
  return JSON.parse(clean.slice(start, end + 1));
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Método no permitido, usa POST" }, 405);

  const AnthropicKey = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
  if (!AnthropicKey) return json({ error: "Falta el secreto ANTHROPIC_API_KEY (supabase secrets set ANTHROPIC_API_KEY=...)" }, 500);
  const db = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "Body inválido: se esperaba JSON" }, 400); }
  const sessionId = String(body.session_id ?? "");
  const stepNumber = Number(body.step_number ?? 0);
  const screenshot = typeof body.screenshot_base64 === "string" ? body.screenshot_base64 : "";
  const executedRaw = body.action_executed;
  const actionExecuted = typeof executedRaw === "string" ? executedRaw : JSON.stringify(executedRaw ?? {});
  const taskGoal = String(body.task_goal ?? ""); // comando original, lo reenvía Android si lo tiene
  const uiTree = typeof body.ui_tree === "string" ? body.ui_tree.slice(0, 6000) : "";
  if (!sessionId || stepNumber < 1) return json({ error: "session_id y step_number (>=1) son obligatorios" }, 400);

  const log = async (level: string, event_type: string, message: string, payload: Record<string, unknown> = {}) => {
    try { await db.from("event_log").insert({ session_id: sessionId, level, source: "verify-and-next", event_type, message, payload }); }
    catch (e) { console.error("[PhoneAgent].[verify-and-next] log falló", e); }
  };

  try {
    const { data: session, error: sesErr } = await db.from("agent_sessions")
      .select("id,user_id,status,voice_command,autonomy_level,plan,project_id,current_app").eq("id", sessionId).maybeSingle();
    if (sesErr) throw new Error("Error leyendo la sesión: " + sesErr.message);
    if (!session) return json({ error: "Sesión no encontrada", code: "SESSION_NOT_FOUND" }, 404);
    if (session.status === "cancelled" || session.status === "completed") {
      return json({ verified: false, should_stop: true, reason: `La sesión ya está ${session.status}`, next_step: null, correction: null, message: "Sesión cerrada" });
    }

    const { data: step } = await db.from("session_steps")
      .select("id,action_type,action_params,expected_result").eq("session_id", sessionId).eq("step_number", stepNumber).maybeSingle();
    const goal = taskGoal || String(session.voice_command ?? "");
    const maxSteps = Number(((session.plan as Record<string, unknown> | null)?.max_steps) ?? 25);

    const { data: caps } = await db.from("capability_config").select("model")
      .eq("capability_key", "vision").or(`user_id.eq.${session.user_id},user_id.is.null`).limit(1);
    const model = String(caps?.[0]?.model ?? Deno.env.get("PHONE_AGENT_MODEL") ?? DEFAULT_MODEL);
    const autonomy = String(session.autonomy_level ?? "draft");
    const autonomyRule = autonomy === "read"
      ? "Autonomía 'read': nunca propongas escribir/enviar; si hace falta, next_action debe ser request_confirmation."
      : autonomy === "draft"
        ? "Autonomía 'draft': puedes proponer escribir, pero cualquier ENVÍO debe ir como request_confirmation con requires_confirmation=true."
        : "Autonomía 'act': ejecuta lo permitido sin confirmación salvo acciones irreversibles.";

    const system = `Eres el verificador de Phone Agent, un agente que controla un Android por voz. Tu trabajo: mirar el screenshot DESPUÉS de una acción, decidir si se cumplió el resultado esperado y proponer la siguiente acción de la tarea. Distingue entre lo que la app DICE y lo que se puede VERIFICAR en pantalla. Si la tarea ya terminó, dilo con should_stop=true y next_action tipo done. Responde SOLO un objeto JSON sin texto extra:
{"verified":true,"screen_analysis":"qué ves ahora","current_app":"driver_key o desconocida","confidence":0.0,"should_stop":false,"reason":"por qué","next_action":{"type":"tap|swipe|type|scroll|wait|open_app|read|verify|back|home|long_press|clear_text|press_enter|request_confirmation|done","params":{},"expected_result":"qué debería cambiar"}|null,"requires_confirmation":false,"task_progress":"paso X de Y"}
Reglas de params: open_app {"driver_key":"..."}; tap {"x":540,"y":1200} (referencia 1080px de ancho) o {"target_text":"..."}; type {"text":"...","target_hint":"..."}; swipe/scroll {"direction":"up|down|left|right"}; wait {"ms":1200}; done {"summary":"resultado final"}.
${autonomyRule} Paso actual: ${stepNumber} de un máximo de ${maxSteps}; si step_number >= máximo, should_stop debe ser true.`;

    const content: unknown[] = [];
    if (screenshot) content.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: screenshot } });
    content.push({ type: "text", text: `Tarea completa del usuario: "${goal}"\nAcción que se acaba de ejecutar (paso ${stepNumber}): ${actionExecuted}\nResultado esperado: ${step?.expected_result ?? "ver el cambio en pantalla"}\n${uiTree ? "Árbol de UI actual:\n" + uiTree + "\n" : ""}¿Se ejecutó correctamente? Devuelve el JSON de verificación con la siguiente acción o la corrección.` });

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 60_000);
    let llmText = "";
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST", signal: ctrl.signal,
        headers: { "x-api-key": AnthropicKey, "Anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({ model, max_tokens: 2048, system, messages: [{ role: "user", content }] }),
      });
      const raw = await res.text();
      if (!res.ok) throw new Error(`Claude API ${res.status}: ${raw.slice(0, 400)}`);
      const parsed = JSON.parse(raw) as { content?: Array<{ type: string; text?: string }> };
      llmText = (parsed.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join("\n");
    } catch (e) {
      await log("error", "llm_verify_failed", String(e), { stepNumber });
      return json({ error: "El LLM no respondió en la verificación: " + String(e), code: "LLM_ERROR" }, 502);
    } finally { clearTimeout(timer); }

    let v: Record<string, unknown>;
    try { v = extractJson(llmText); }
    catch (e) { await log("error", "llm_bad_json", String(e), { llmText: llmText.slice(0, 800) }); return json({ error: String(e), code: "LLM_BAD_JSON" }, 502); }

    const verified = v.verified === true;
    const shouldStop = v.should_stop === true || stepNumber >= maxSteps;
    let nextAction = (v.next_action ?? null) as Record<string, unknown> | null;
    if (nextAction && !ALLOWED_ACTIONS.includes(String(nextAction.type))) nextAction = { ...nextAction, type: "verify" };
    if (shouldStop && nextAction && String(nextAction.type) !== "done") nextAction = null;

    // Persistir verificación del paso ejecutado.
    if (step?.id) {
      await db.from("session_steps").update({
        status: verified ? "verified" : "failed",
        screen_analysis: String(v.screen_analysis ?? ""),
        confidence: Math.max(0, Math.min(1, Number(v.confidence ?? 0.5))),
        verification: { verified, reason: v.reason ?? "", should_stop: shouldStop, checked_at: new Date().toISOString(), screenshot_bytes: screenshot.length },
      }).eq("id", step.id);
    }

    // Persistir el siguiente paso (si lo hay) para trazabilidad completa.
    let nextStep: Record<string, unknown> | null = null;
    if (nextAction && !shouldStop) {
      const nextNumber = stepNumber + 1;
      const { data: inserted } = await db.from("session_steps").insert({
        session_id: sessionId, user_id: session.user_id, step_number: nextNumber,
        action_type: String(nextAction.type), action_params: (nextAction.params ?? {}) as Record<string, unknown>,
        expected_result: String(nextAction.expected_result ?? ""), screen_analysis: String(v.screen_analysis ?? ""),
        status: v.requires_confirmation === true ? "needs_confirmation" : "pending",
        confidence: Math.max(0, Math.min(1, Number(v.confidence ?? 0.5))),
        requires_confirmation: v.requires_confirmation === true,
        metadata: { task_progress: v.task_progress ?? `paso ${nextNumber}` },
      }).select("step_number,action_type,action_params,expected_result").single();
      nextStep = inserted
        ? { step_number: inserted.step_number, action: { type: inserted.action_type, params: inserted.action_params, expected_result: inserted.expected_result }, requires_confirmation: v.requires_confirmation === true }
        : { step_number: nextNumber, action: nextAction, requires_confirmation: v.requires_confirmation === true };
    }

    // Solo se refresca la app en primer plano: el estado final de la sesión lo
    // pone complete-session (completed/failed/cancelled).
    await db.from("agent_sessions").update({
      current_app: String(v.current_app ?? session.current_app ?? ""),
    }).eq("id", sessionId);
    await log(verified ? "info" : "warn", verified ? "step_verified" : "step_failed",
      String(v.reason ?? ""), { stepNumber, shouldStop });

    return json({
      verified,
      should_stop: shouldStop,
      reason: String(v.reason ?? ""),
      screen_analysis: String(v.screen_analysis ?? ""),
      current_app: String(v.current_app ?? ""),
      confidence: Math.max(0, Math.min(1, Number(v.confidence ?? 0.5))),
      next_step: nextStep,
      // Si no se verificó, next_step actúa como corrección: Android lo ejecuta igual.
      correction: verified ? null : nextStep,
      message: shouldStop
        ? String(((nextAction?.params as Record<string, unknown> | undefined)?.summary) ?? v.reason ?? "Tarea terminada")
        : String(v.reason ?? ""),
      task_progress: String(v.task_progress ?? `paso ${stepNumber}`),
    });
  } catch (e) {
    console.error("[PhoneAgent].[verify-and-next]", e);
    await log("error", "verify_failed", String(e));
    return json({ error: String(e), code: "INTERNAL" }, 500);
  }
});
