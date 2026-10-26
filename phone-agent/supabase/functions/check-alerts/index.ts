// ============================================================================
// Phone Agent · Edge Function: check-alerts (skeleton FUNCIONAL — Fase 2)
// Ya detecta patrones reales sobre event_log / session_steps / agent_sessions
// y limpia screenshots >24h. En Fase 2 aquí se conectan los canales de aviso
// (push FCM, email, WhatsApp) leyendo capability_config 'alerts'.
// Invocar: POST {} o con { "user_id": "..." } para filtrar por usuario.
// Programar: Supabase Dashboard > Edge Functions > check-alerts > Schedule.
// Deploy: supabase functions deploy check-alerts
// ============================================================================
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedUserId } from "../_shared/auth.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}
interface Alert { type: string; severity: "info" | "warning" | "critical"; message: string; evidence: Record<string, unknown>; }

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Método no permitido, usa POST" }, 405);
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceKey) return json({ error: "Falta configuración del servidor Supabase." }, 500);
  const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const userId = await getAuthenticatedUserId(req, db);
  if (!userId) return json({ error: "Inicia sesión en la app para consultar avisos.", code: "UNAUTHORIZED" }, 401);
  try {
    const body = await req.json().catch(() => ({}));
    if (body?.user_id && String(body.user_id) !== userId) {
      return json({ error: "No puedes consultar avisos de otra cuenta.", code: "FORBIDDEN" }, 403);
    }

    const { data: cfgRows } = await db.from("capability_config").select("settings")
      .eq("capability_key", "alerts").eq("enabled", true)
      .or(userId ? `user_id.eq.${userId},user_id.is.null` : "user_id.is.null").limit(1);
    const s = (cfgRows?.[0]?.settings ?? {}) as Record<string, unknown>;
    const errorBurst = Number(s.error_burst_threshold ?? 3);
    const failedStepsThreshold = Number(s.failed_steps_threshold ?? 5);
    const stuckMinutes = Number(s.stuck_minutes ?? 15);

    const sinceIso = new Date(Date.now() - 60 * 60 * 1000).toISOString(); // última hora
    const alerts: Alert[] = [];

    // Patrón 1: ráfaga de errores recientes en event_log.
    let errQuery = db.from("event_log").select("id", { count: "exact", head: true })
      .eq("level", "error").gte("created_at", sinceIso);
    if (userId) errQuery = errQuery.eq("user_id", userId);
    const { count: errorCount } = await errQuery;
    if ((errorCount ?? 0) >= errorBurst) {
      alerts.push({ type: "error_burst", severity: "warning",
        message: `${errorCount} errores en la última hora (umbral: ${errorBurst}). Revisa event_log.`,
        evidence: { error_count_last_hour: errorCount ?? 0 } });
    }

    // Patrón 2: demasiados pasos fallidos recientes.
    let failQuery = db.from("session_steps").select("id", { count: "exact", head: true })
      .eq("status", "failed").gte("created_at", sinceIso);
    if (userId) failQuery = failQuery.eq("user_id", userId);
    const { count: failCount } = await failQuery;
    if ((failCount ?? 0) >= failedStepsThreshold) {
      alerts.push({ type: "failed_steps_burst", severity: "warning",
        message: `${failCount} pasos fallaron la verificación en la última hora. Posible cambio de UI en alguna app.`,
        evidence: { failed_steps_last_hour: failCount ?? 0 } });
    }

    // Patrón 3: sesiones atascadas en 'running' más de X minutos.
    const stuckBefore = new Date(Date.now() - stuckMinutes * 60 * 1000).toISOString();
    let stuckQuery = db.from("agent_sessions").select("id,voice_command,started_at")
      .eq("status", "running").lt("started_at", stuckBefore).limit(10);
    if (userId) stuckQuery = stuckQuery.eq("user_id", userId);
    const { data: stuck } = await stuckQuery;
    for (const sess of stuck ?? []) {
      alerts.push({ type: "stuck_session", severity: "critical",
        message: `La sesión "${sess.voice_command}" lleva más de ${stuckMinutes} min en estado running.`,
        evidence: { session_id: sess.id, started_at: sess.started_at } });
    }

    // Mantenimiento: auto-borrado de screenshots con más de 24 h (bucket).
    let screenshotsCleaned = 0;
    const { data: cleaned, error: cleanErr } = await db.rpc("delete_old_screenshots");
    if (!cleanErr && typeof cleaned === "number") screenshotsCleaned = cleaned;
    else if (cleanErr) console.error("[PhoneAgent].[check-alerts] limpieza falló:", cleanErr.message);

    // Registrar la ejecución y cada alerta (base para notificar en Fase 2).
    try {
      await db.from("event_log").insert({
        user_id: userId, level: alerts.length ? "warn" : "info", source: "check-alerts",
        event_type: "alerts_checked", message: `${alerts.length} alertas detectadas`,
        payload: { alerts: alerts.map((a) => a.type), screenshots_cleaned: screenshotsCleaned },
      });
      for (const a of alerts) {
        await db.from("event_log").insert({
          user_id: userId, level: a.severity === "critical" ? "error" : "warn", source: "check-alerts",
          event_type: "alert_detected", message: a.message, payload: a.evidence as Record<string, unknown>,
        });
      }
    } catch (e) { console.error("[PhoneAgent].[check-alerts] log falló", e); }

    return json({ alerts, checked_at: new Date().toISOString(), screenshots_cleaned: screenshotsCleaned,
      thresholds: { error_burst: errorBurst, failed_steps: failedStepsThreshold, stuck_minutes: stuckMinutes } });
  } catch (e) {
    console.error("[PhoneAgent].[check-alerts]", e);
    return json({ error: String(e), code: "INTERNAL" }, 500);
  }
});
