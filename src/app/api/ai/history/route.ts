import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { listAiGenerations } from "@/lib/dal";

/** Historial de generaciones del AI Studio del usuario. */
export async function GET(request: Request) {
  const sesion = await auth();
  if (!sesion?.user?.id) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  const herramienta = new URL(request.url).searchParams.get("tool") ?? undefined;
  return NextResponse.json({ items: await listAiGenerations(sesion.user.id, herramienta) });
}
