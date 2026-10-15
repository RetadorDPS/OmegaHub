import { NextResponse } from "next/server";
import { auth } from "@/auth";

/**
 * Comprueba que la petición la realiza un administrador.
 * Devuelve la sesión o una respuesta 401/403 lista para retornar.
 */
export async function requireAdmin() {
  const sesion = await auth();
  if (!sesion?.user?.id) {
    return { sesion: null, respuesta: NextResponse.json({ error: "No autenticado" }, { status: 401 }) };
  }
  if (sesion.user.role !== "ADMIN") {
    return {
      sesion: null,
      respuesta: NextResponse.json({ error: "Se requieren permisos de administrador" }, { status: 403 }),
    };
  }
  return { sesion, respuesta: null };
}
