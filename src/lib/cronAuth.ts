import "server-only";

import { auth } from "@/auth";

/**
 * Autorización para tareas programadas (cron).
 *
 * Dos vías válidas:
 *  1 · Cabecera `x-cron-secret` con el CRON_SECRET
 *      (GitHub Actions, cron-job.org…).
 *  2 · Sesión de administrador (para pruebas manuales).
 *
 * Devuelve { autorizado, via, respuesta } — `respuesta`
 * solo se usa cuando NO está autorizado.
 */
export async function autorizarTarea(request: Request): Promise<{
  autorizado: boolean;
  via?: "cron" | "admin";
  respuesta?: Response;
}> {
 const secreto = process.env.CRON_SECRET ?? "";
  const cabecera = request.headers.get("x-cron-secret") ?? "";

  if (secreto && cabecera === secreto) {
    return { autorizado: true, via: "cron" };
  }

  const sesion = await auth();
  if (sesion?.user && (sesion.user as { role?: string }).role === "ADMIN") {
    return { autorizado: true, via: "admin" };
  }

  return {
    autorizado: false,
    respuesta: new Response(
      JSON.stringify({ error: "No autorizado: se requiere x-cron-secret o sesión de admin." }),
      { status: 401, headers: { "content-type": "application/json" } },
    ),
  };
}
