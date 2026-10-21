import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { explicarModo } from "@/lib/modoCostes";
import { proveedoresRegistrados } from "@/lib/providers";
import { estadoCanales } from "@/lib/canales";

/**
 * Diagnóstico del despliegue.
 *
 *   GET /api/diagnostics?clave=<CRON_SECRET>
 *
 * Muestra el modo de costes, qué proveedores están
 * disponibles y qué canales de alerta están configurados.
 * Requiere la clave de cron (o sesión de admin).
 */
export async function GET(request: Request) {
  const secreto = process.env.CRON_SECRET ?? "";
  const clave = new URL(request.url).searchParams.get("clave") ?? "";

  // Dos vías de acceso: la clave de cron (monitorización externa) o una
  // sesión de administrador (consulta desde el panel).
  const porClave = Boolean(secreto) && clave === secreto;
  if (!porClave) {
    const sesion = await auth();
    if (sesion?.user?.role !== "ADMIN") {
      return NextResponse.json({ error: "Clave no válida." }, { status: 401 });
    }
  }

  const modo = explicarModo();

  return NextResponse.json({
    modoCostes: modo.modo,
    notaModo: modo.nota,
    proveedores: proveedoresRegistrados(),
    canales: estadoCanales(),
    servidor: {
      entorno: process.env.NODE_ENV ?? "development",
      hora: new Date().toISOString(),
    },
  });
}
