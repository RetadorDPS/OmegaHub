import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { deleteNotification, markAllAsRead, markAsRead } from "@/lib/notifications";
import { listNotifications } from "@/lib/dal";

/** Notificaciones del usuario autenticado. */
export async function GET() {
  const sesion = await auth();
  if (!sesion?.user?.id) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  return NextResponse.json({ items: await listNotifications(sesion.user.id, 30) });
}

/** Marca una notificación (o todas) como leídas. */
export async function PATCH(request: Request) {
  const sesion = await auth();
  if (!sesion?.user?.id) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const cuerpo = (await request.json()) as { id?: string; all?: boolean };
  if (cuerpo.all) {
    const resultado = await markAllAsRead(sesion.user.id);
    return NextResponse.json({ ok: true, actualizadas: resultado.count });
  }
  if (!cuerpo.id) return NextResponse.json({ error: "Falta el identificador" }, { status: 400 });
  await markAsRead(sesion.user.id, cuerpo.id);
  return NextResponse.json({ ok: true });
}

/** Elimina una notificación. */
export async function DELETE(request: Request) {
  const sesion = await auth();
  if (!sesion?.user?.id) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  const { id } = (await request.json()) as { id?: string };
  if (!id) return NextResponse.json({ error: "Falta el identificador" }, { status: 400 });
  await deleteNotification(sesion.user.id, id);
  return NextResponse.json({ ok: true });
}
