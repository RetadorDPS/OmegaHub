import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { listSuppliers } from "@/lib/dal";

/** Proveedores con filtros por plataforma, categoría y valoración mínima. */
export async function GET(request: Request) {
  const sesion = await auth();
  if (!sesion?.user?.id) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const params = new URL(request.url).searchParams;
  const items = await listSuppliers({
    platform: params.get("platform") ?? undefined,
    category: params.get("category") ?? undefined,
    minRating: params.get("minRating") ? Number(params.get("minRating")) : undefined,
  });
  return NextResponse.json({ items, total: items.length });
}
