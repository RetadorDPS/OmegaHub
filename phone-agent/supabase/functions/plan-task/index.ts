// ============================================================================
// Phone Agent · Edge Function: plan-task
// Recibe el comando de voz + screenshot inicial, construye el system prompt
// dinámico (base + apps autorizadas + proyecto + autonomía), llama a Claude
// con visión y devuelve el PRIMER paso del plan. Crea la sesión en DB.
// Deploy: supabase functions deploy plan-task
// Secretos: ANTHROPIC_API_KEY (obligatorio). SUPABASE_* los inyecta la plataforma.
// ============================================================================
import { createClient } from "@supabase/supabase-js";

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

// Extrae el primer objeto JSON válido de la respuesta del LLM (tolera fences).
function extractJson(text: string): Record<string, unknown> {
  const clean = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  const start = clean.indexOf("{"), end = clean.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("El LLM no devolvió JSON: " + text.slice(0, 300));
  return JSON.parse(clean.slice(start, end + 1));
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Método no permitido, usa POST" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const AnthropicKey = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
  if (!supabaseUrl || !serviceKey) return json({ error: "Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en el servidor" }, 500);
  if (!AnthropicKey) return json({ error: "Falta el secreto ANTHROPIC_API_KEY. Ejecuta: supabase secrets set ANTHROPIC_API_KEY=sk-ant-..." }, 500);

  const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return json({ error: "Body inválido: se esperaba JSON" }, 400); }

  const userId = String(body.user_id ?? "");
  const voiceCommand = String(body.voice_command ?? "").trim();
  const screenshot = typeof body.screenshot_base64 === "string" ? body.screenshot_base64 : "";
  const currentApp = String(body.current_app ?? "desconocida");
  const projectId = body.project_id ? String(body.project_id) : null;
  const uiTree = typeof body.ui_tree === "string" ? body.ui_tree.slice(0, 6000) : "";
  if (!userId) return json({ error: "user_id es obligatorio (UUID de Supabase Auth del usuario)" }, 400);
  if (!voiceCommand) return json({ error: "voice_command es obligatorio" }, 400);

  const log = async (level: string, event_type: string, message: string, payload: Record<string, unknown> = {}, session_id: string | null = null) => {
    try { await db.from("event_log").insert({ user_id: userId, session_id, level, source: "plan-task", event_type, message, payload }); }
    catch (e) { console.error("[PhoneAgent].[plan-task] log falló", e); }
  };

  try {
    // -- El usuario debe existir (FK de agent_sessions). Se crea el perfil si
    //    el trigger de Auth no lo hizo (p. ej. usuario creado a mano).
    const { data: userRow } = await db.from("users").select("id").eq("id", userId).maybeSingle();
    if (!userRow) {
      await db.from("users").insert({ id: userId, metadata: { created_by: "plan-task" } });
      const { data: retry } = await db.from("users").select("id").eq("id", userId).maybeSingle();
      if (!retry) {
        return json({ error: "user_id no existe en auth.users. Crea el usuario en Supabase > Authentication > Users, copia su UUID y pégalo en la app (Ajustes > User ID de Supabase).", code: "USER_NOT_FOUND" }, 400);
      }
    }

    // -- Drivers AUTORIZADOS del usuario (o globales autorizados) + config.
    const { data: drivers, error: drvErr } = await db
      .from("app_drivers")
      .select("driver_key,display_name,package_name,is_dual_variant,base_driver_key,allowed_actions,ui_map,metadata")
      .eq("enabled", true).eq("authorized", true)
      .or(`user_id.eq.${userId},user_id.is.null`)
      .order("user_id", { ascending: false }); // los del usuario ganan al global
    if (drvErr) throw new Error("Error leyendo app_drivers: " + drvErr.message);
    if (!drivers || drivers.length === 0) {
      return json({ error: "No hay ninguna app autorizada. Abre Driver Manager en la app y autoriza al menos una (Claude, ChatGPT, WhatsApp…).", code: "NO_AUTHORIZED_APPS" }, 422);
    }
    // Deduplica por driver_key quedándonos con la fila del usuario si existe.
    const byKey = new Map<string, Record<string, unknown>>();
    for (const d of drivers) if (!byKey.has(String(d.driver_key))) byKey.set(String(d.driver_key), d as Record<string, unknown>);
    const authorized = [...byKey.values()];

    const { data: caps } = await db.from("capability_config")
      .select("capability_key,model,autonomy_level,settings")
      .in("capability_key", ["planner", "vision"])
      .or(`user_id.eq.${userId},user_id.is.null`);
    const planner = (caps ?? []).find((c) => c.capability_key === "planner");
    const model = String(planner?.model ?? Deno.env.get("PHONE_AGENT_MODEL") ?? DEFAULT_MODEL);
    const autonomy = String(body.autonomy_level ?? planner?.autonomy_level ?? "draft");
    const maxSteps = Number((planner?.settings as Record<string, unknown> | undefined)?.max_steps ?? 25);

    // -- Proyecto activo (para el BLOQUE PROYECTO del prompt).
    let project: Record<string, unknown> | null = null;
    if (projectId) {
      const { data } = await db.from("projects").select("id,name,phase,summary,pending_items").eq("id", projectId).eq("user_id", userId).maybeSingle();
      project = data as Record<string, unknown> | null;
    } else {
      const { data } = await db.from("projects").select("id,name,phase,summary,pending_items")
        .eq("user_id", userId).eq("is_active", true).order("updated_at", { ascending: false }).limit(1).maybeSingle();
      project = data as Record<string, unknown> | null;
    }

    // -- SYSTEM PROMPT DINÁMICO (Sección 5 de la especificación) --------------
    const appsList = authorized.map((d) => `${d.display_name} (driver: ${d.driver_key}, package: ${d.package_name}${d.is_dual_variant ? ", variante DUAL/clonada de " + d.base_driver_key : ""}, acciones permitidas: ${JSON.stringify(d.allowed_actions)}, mapa de UI conocido: ${JSON.stringify(d.ui_map)})`).join("\n- ");
    const autonomyBlock = autonomy === "read"
      ? "NIVEL DE AUTONOMÍA 'read': Solo lee y resume. No escribas ni envíes nada. Si la tarea requiere escribir, devuelve action.type='request_confirmation' explicándolo."
      : autonomy === "act"
        ? "NIVEL DE AUTONOMÍA 'act': Ejecuta todo lo permitido por los drivers, incluidos envíos, sin pedir confirmación salvo que la acción sea irreversible o ambigua."
        : "NIVEL DE AUTONOMÍA 'draft': Escribe el contenido pero marca cualquier ENVÍO (send) como requires_confirmation=true con action.type='request_confirmation' en el momento de enviar.";
    const projectBlock = project
      ? `\nBLOQUE PROYECTO:\nProyecto activo: ${project.name}. Fase: ${project.phase}. Último avance: ${project.summary || "sin resumen todavía"}. Pendientes: ${JSON.stringify(project.pending_items ?? [])}.`
      : "\nBLOQUE PROYECTO: no hay proyecto activo. Trabaja solo con el comando actual.";
    const system = `Eres Phone Agent. Controlas un teléfono Android por instrucciones de voz. Solo interactúas con apps autorizadas: ${authorized.map((d) => d.display_name).join(", ")}. Si ves una app no autorizada, NO la toques: devuelve action.type='verify' describiéndolo. Verifica cada acción antes de avanzar. Distingue entre lo que una app DICE y lo que puedes VERIFICAR en pantalla. Responde SIEMPRE con un único objeto JSON, sin texto fuera del JSON, con este formato exacto:
{"screen_analysis":"qué ves","current_app":"driver_key de la app identificada o 'desconocida'","action":{"type":"tap|swipe|type|scroll|wait|open_app|read|verify|back|home|long_press|clear_text|press_enter|request_confirmation|done","params":{},"expected_result":"qué debería cambiar"},"confidence":0.0,"requires_confirmation":false,"task_progress":"paso X de Y"}

BLOQUE APPS AUTORIZADAS (drivers instalados en el teléfono):
- ${appsList}

Reglas de params por tipo de acción:
- open_app: {"driver_key":"whatsapp"} (usa SIEMPRE driver_key, nunca un package inventado)
- tap: {"x":540,"y":1200} en píxeles sobre una pantalla de referencia 1080px de ancho, o {"target_text":"Chats"} para tocar por texto visible.
- type: {"text":"...","target_hint":"Message"} (target_hint = placeholder del campo si lo conoces por el ui_map)
- swipe: {"direction":"up|down|left|right"} · scroll: {"direction":"down"}
- long_press: {"target_text":"..."} o {"x":540,"y":1200} (menús contextuales, seleccionar texto)
- clear_text: {"target_hint":"..."} (vacía el campo antes de reescribir)
- press_enter: {} (acción del teclado: buscar/avanzar. OJO: en apps de mensajería ENVÍA el mensaje)
- back: {} para volver a la pantalla anterior · home: {} para ir al inicio del teléfono
- wait: {"ms":1500} · read/verify: {} · done: {"summary":"resultado final para contarle al usuario"}

Regla de recuperación: si tras una acción la pantalla no es la esperada, usa back (no repitas el mismo tap). Si te pierdes del todo, usa home y vuelve a empezar con open_app.
Planifica paso a paso: devuelve SOLO la siguiente acción. Máximo ${maxSteps} pasos en total.
${projectBlock}
BLOQUE AUTONOMÍA: ${autonomyBlock}`;

    const userContent: unknown[] = [];
    if (screenshot) userContent.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: screenshot } });
    userContent.push({ type: "text", text: `Comando de voz del usuario: "${voiceCommand}"\nApp en primer plano según Android: ${currentApp}\n${uiTree ? "Árbol de UI accesible (texto visible):\n" + uiTree + "\n" : ""}Analiza la pantalla y devuelve la PRIMERA acción del plan en el formato JSON indicado.` });

    // -- Llamada a Claude con visión -----------------------------------------
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 60_000);
    let llmText = "";
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST", signal: ctrl.signal,
        headers: { "x-api-key": AnthropicKey, "Anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({ model, max_tokens: 2048, system, messages: [{ role: "user", content: userContent }] }),
      });
      const raw = await res.text();
      if (!res.ok) throw new Error(`Claude API ${res.status}: ${raw.slice(0, 400)}`);
      const parsed = JSON.parse(raw) as { content?: Array<{ type: string; text?: string }> };
      llmText = (parsed.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join("\n");
    } catch (e) {
      await log("error", "llm_call_failed", String(e), { model });
      return json({ error: "El LLM no respondió: " + String(e), code: "LLM_ERROR" }, 502);
    } finally { clearTimeout(timer); }
    if (!llmText) return json({ error: "Claude devolvió una respuesta vacía", code: "LLM_EMPTY" }, 502);

    let plan: Record<string, unknown>;
    try { plan = extractJson(llmText); }
    catch (e) { await log("error", "llm_bad_json", String(e), { llmText: llmText.slice(0, 1000) }); return json({ error: String(e), code: "LLM_BAD_JSON", raw: llmText.slice(0, 1000) }, 502); }

    const action = (plan.action ?? {}) as Record<string, unknown>;
    if (!ALLOWED_ACTIONS.includes(String(action.type))) { action.type = "verify"; plan.action = action; }
    const confidence = Math.max(0, Math.min(1, Number(plan.confidence ?? 0.5)));
    plan.confidence = confidence;

    // -- Crear sesión + primer paso -------------------------------------------
    const { data: session, error: sesErr } = await db.from("agent_sessions").insert({
      user_id: userId, project_id: project?.id ?? projectId, voice_command: voiceCommand,
      status: "running", autonomy_level: autonomy, current_app: String(plan.current_app ?? currentApp),
      plan: { first_plan: plan, max_steps: maxSteps, model },
      metadata: { had_screenshot: screenshot.length > 0, source: "plan-task" },
    }).select("id").single();
    if (sesErr || !session) throw new Error("No se pudo crear la sesión: " + (sesErr?.message ?? "sin datos"));
    const sessionId = String(session.id);

    const { error: stepErr } = await db.from("session_steps").insert({
      session_id: sessionId, user_id: userId, step_number: 1,
      action_type: String(action.type), action_params: (action.params ?? {}) as Record<string, unknown>,
      expected_result: String(action.expected_result ?? ""), screen_analysis: String(plan.screen_analysis ?? ""),
      status: plan.requires_confirmation === true ? "needs_confirmation" : "pending",
      confidence, requires_confirmation: plan.requires_confirmation === true,
      metadata: { task_progress: plan.task_progress ?? "paso 1" },
    });
    if (stepErr) console.error("[PhoneAgent].[plan-task] paso inicial no guardado:", stepErr.message);
    await log("info", "session_planned", `Sesión creada para: ${voiceCommand}`, { model, autonomy, first_action: action.type }, sessionId);

    return json({
      session_id: sessionId,
      plan,
      authorized_apps: authorized.map((d) => ({ driver_key: d.driver_key, display_name: d.display_name, package_name: d.package_name, is_dual_variant: d.is_dual_variant })),
      autonomy_level: autonomy, model, max_steps: maxSteps,
      project: project ? { id: project.id, name: project.name } : null,
    });
  } catch (e) {
    console.error("[PhoneAgent].[plan-task]", e);
    await log("error", "plan_task_failed", String(e));
    return json({ error: String(e), code: "INTERNAL" }, 500);
  }
});
