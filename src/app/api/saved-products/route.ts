import { NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { listSavedProducts } from "@/lib/dal";
import { PLAN_LIMITS } from "@/lib/constants";

/** Lista los productos guardados del usuario autenticado. */
export async function GET() {
  const sesion = await auth();
  if (!sesion?.user?.id) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  const guardados = await listSavedProducts(sesion.user.id);
  return NextResponse.json({ items: guardados });
}

/** Guarda un producto en favoritos (con control de límite por plan). */
export async function POST(request: Request) {
  const sesion = await auth();
  if (!sesion?.user?.id) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { productId, notes, folder } = (await request.json()) as {
    productId?: string;
    notes?: string;
    folder?: string;
  };
  if (!productId) return NextResponse.json({ error: "Falta el producto" }, { status: 400 });

  const usuario = await prisma.user.findUnique({ where: { id: sesion.user.id }, select: { planType: true } });
  const limite = PLAN_LIMITS[usuario?.planType ?? "FREE"].savedProducts;
  const total = await prisma.savedProduct.count({ where: { userId: sesion.user.id } });
  if (limite !== null && total >= limite) {
    return NextResponse.json(
      {
        error: `Tu plan ${usuario?.planType} permite ${limite} favoritos. Mejora a Pro para guardar hasta 200.`,
        code: "PLAN_LIMIT",
      },
      { status: 402 },
    );
  }

  const guardado = await prisma.savedProduct.upsert({
    where: { userId_productId: { userId: sesion.user.id, productId } },
    update: { notes: notes ?? undefined, folder: folder ?? undefined },
    create: { userId: sesion.user.id, productId, notes, folder: folder ?? "Favoritos" },
  });
  return NextResponse.json({ ok: true, id: guardado.id });
}

/** Quita un producto de favoritos. */
export async function DELETE(request: Request) {
  const sesion = await auth();
  if (!sesion?.user?.id) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { productId } = (await request.json()) as { productId?: string };
  if (!productId) return NextResponse.json({ error: "Falta el producto" }, { status: 400 });

  await prisma.savedProduct.deleteMany({ where: { userId: sesion.user.id, productId } });
  return NextResponse.json({ ok: true });
}
