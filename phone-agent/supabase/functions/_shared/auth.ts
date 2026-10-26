import type { SupabaseClient } from "@supabase/supabase-js";

/** Devuelve el UUID autenticado a partir del JWT de Supabase o null si no es válido. */
export async function getAuthenticatedUserId(req: Request, db: SupabaseClient): Promise<string | null> {
  const authorization = req.headers.get("authorization") ?? "";
  const token = /^Bearer\s+(.+)$/i.exec(authorization)?.[1]?.trim();
  if (!token) return null;

  const { data, error } = await db.auth.getUser(token);
  return error ? null : data.user?.id ?? null;
}
