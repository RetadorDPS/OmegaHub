// ============================================================================
// Phone Agent · Edge Function: complete-session
// Cierra una sesión: resume con el LLM qué se hizo, actualiza el contexto del
// proyecto (memoria entre sesiones) y marca agent_sessions como completed.
// Deploy: supabase functions deploy complete-session
// ============================================================================
import { createClient } from "@supabase/supabase-js";
import { generateText, resolveLlmConfig, resolveLlmModel, type LlmConfig } from "../_shared/llm.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}
function extractJson(text: string): Record<string, unknown> {
  const clean = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  const s = clean.indexOf("{"), e = clean.lastIndexOf("}");
  if (s < 0 || e <= s) throw new Error("El LLM no devolvió JSON: " + text.slice(0, 300));
  return JSON.parse(clean.slice(s, e + 1));
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Método no permitido, usa POST" }, 405);
  let llmConfig: LlmConfig;
  try { llmConfig = resolveLlmConfig(); }
  catch (e) { return json({ error: String(e), code: "LLM_CONFIG_MISSING" }, 500); }
  const db = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "Body inválido: se esperaba JSON" }, 400); }
  const sessionId = String(body.session_id ?? "");
  const finalStatus = ["completed", "failed", "cancelled"].includes(String(body.final_status)) ? String(body.final_status) : "completed";
  const errorMessage = body.error_message ? String(body.error_message) : null;
  if (!sessionId) return json({ error: "session_id es obligatorio" }, 400);

  try {
    const { data: session, error } = await db.from("agent_sessions")
      .select("id,user_id,project_id,voice_command,status,current_app,started_at").eq("id", sessionId).maybeSingle();
    if (error) throw new Error("Error leyendo la sesión: " + error.message);
    if (!session) return json({ error: "Sesión no encontrada", code: "SESSION_NOT_FOUND" }, 404);

    const { data: steps } = await db.from("session_steps")
      .select("step_number,action_type,action_params,expected_result,status,screen_analysis,verification")
      .eq("session_id", sessionId).order("step_number", { ascending: true });
    const stepList = steps ?? [];
    const verifiedCount = stepList.filter((s) => s.status === "verified").length;

    const { data: caps } = await db.from("capability_config").select("model,settings")
      .eq("capability_key", "memory").or(`user_id.eq.${session.user_id},user_id.is.null`).limit(1);
    const model = resolveLlmModel(llmConfig.provider, String(caps?.[0]?.model ?? Deno.env.get("PHONE_AGENT_MODEL") ?? ""));
    const updateProject = ((caps?.[0]?.settings as Record<string, unknown> | undefined)?.update_project_on_complete) !== false;

    // Resumen con LLM a partir del historial real de pasos (sin screenshots:
    // ya fueron verificados paso a paso; aquí solo se sintetiza).
    const history = stepList.map((s) =>
      `#${s.step_number} ${s.action_type} ${JSON.stringify(s.action_params)} → estado=${s.status}; esperado: ${s.expected_result ?? ""}; pantalla: ${s.screen_analysis ?? ""}`
    ).join("\n") || "(sin pasos registrados)";
    const system = `Eres Phone Agent. Acaba de terminar una sesión de control de un teléfono Android. Resume para el usuario (que escucha por voz: frases cortas y claras, en español) qué se consiguió y qué quedó pendiente. Responde SOLO este JSON:
{"summary":"resumen hablado de máximo 3 frases","project_summary":"estado del proyecto en 1-2 frases para memoria futura","last_progress":"último avance concreto","pending_items":["pendiente 1","pendiente 2"]}`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 45_000);
    let summary = "", projectSummary = "", lastProgress = "";
    let pendingItems: string[] = [];
    try {
      const text = await generateText({ config: llmConfig, model, system,
        userText: `Comando original: "${session.voice_command}"\nEstado final: ${finalStatus}${errorMessage ? "\nError: " + errorMessage : ""}\nPasos ejecutados (${verifiedCount}/${stepList.length} verificados):\n${history}`,
        maxOutputTokens: 1024, signal: ctrl.signal });
      const out = extractJson(text);
      summary = String(out.summary ?? ""); projectSummary = String(out.project_summary ?? "");
      lastProgress = String(out.last_progress ?? "");
      pendingItems = Array.isArray(out.pending_items) ? out.pending_items.map(String) : [];
    } catch (e) {
      // El cierre NUNCA debe fallar por el LLM: resumen determinista de respaldo.
      console.error("[PhoneAgent].[complete-session] resumen LLM falló, uso respaldo:", e);
      summary = finalStatus === "completed"
        ? `Tarea terminada: "${session.voice_command}". Se verificaron ${verifiedCount} de ${stepList.length} pasos.`
        : `La tarea "${session.voice_command}" terminó con estado ${finalStatus}. Se verificaron ${verifiedCount} de ${stepList.length} pasos.`;
      projectSummary = summary; lastProgress = summary;
    } finally { clearTimeout(timer); }

    const nowIso = new Date().toISOString();
    await db.from("agent_sessions").update({
      status: finalStatus, result_summary: summary, error_message: errorMessage, finished_at: nowIso,
      metadata: { steps_total: stepList.length, steps_verified: verifiedCount, closed_by: "complete-session" },
    }).eq("id", sessionId);

    // Memoria: actualizar el proyecto con el nuevo estado.
    let projectUpdated = false;
    if (session.project_id && updateProject && finalStatus !== "cancelled") {
      const { data: project } = await db.from("projects").select("context,summary").eq("id", session.project_id).maybeSingle();
      const prevContext = (project?.context ?? {}) as Record<string, unknown>;
      const historyArr = Array.isArray(prevContext.session_history) ? prevContext.session_history as unknown[] : [];
      historyArr.push({ session_id: sessionId, at: nowIso, command: session.voice_command, progress: lastProgress });
      const { error: pErr } = await db.from("projects").update({
        summary: projectSummary || project?.summary || "",
        pending_items: pendingItems,
        context: { ...prevContext, last_session_id: sessionId, last_progress: lastProgress, session_history: historyArr.slice(-20) },
      }).eq("id", session.project_id);
      projectUpdated = !pErr;
      if (pErr) console.error("[PhoneAgent].[complete-session] proyecto no actualizado:", pErr.message);
    }

    try {
      await db.from("event_log").insert({
        user_id: session.user_id, session_id: sessionId,
        level: finalStatus === "completed" ? "info" : "warn", source: "complete-session",
        event_type: "session_completed", message: summary,
        payload: { final_status: finalStatus, steps_total: stepList.length, steps_verified: verifiedCount, project_updated: projectUpdated },
      });
    } catch (e) { console.error("[PhoneAgent].[complete-session] log falló", e); }

    return json({ session_id: sessionId, status: finalStatus, summary, project_summary: projectSummary,
      last_progress: lastProgress, pending_items: pendingItems, project_updated: projectUpdated,
      steps_total: stepList.length, steps_verified: verifiedCount });
  } catch (e) {
    console.error("[PhoneAgent].[complete-session]", e);
    return json({ error: String(e), code: "INTERNAL" }, 500);
  }
});
