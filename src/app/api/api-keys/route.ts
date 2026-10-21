import { NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import {
  CLAVES_POR_PLAN,
  generarClave,
  planConApi,
} from "@/lib/apiKeys";

/**
 * ============================================================================
 *  GESTIÓN DE CLAVES (sesión de usuario, no clave de API)
 * ============================================================================
 *  GET  /api/api-keys   → claves del usuario
 *  POST /api/api-keys   → crear clave (devuelve el valor en claro UNA vez)
 *
 *  Requiere plan Business o Agency. Nunca devuelve el hash.
 * ============================================================================
 */

/** Respuesta de error homogénea. */
function fallo(estado: number, mensaje: string) {
  return NextResponse.json({ error: mensaje }, { status: estado });
}

export async function GET() {
  const sesion = await auth();
  if (!sesion?.user?.id) return fallo(401, "No autenticado");
  if (!planConApi(sesion.user.planType)) {
    return fallo(403, "La API pública requiere el plan Business o Agency.");
  }

  const claves = await prisma.apiKey.findMany({
    where: { userId: sesion.user.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      nombre: true,
      prefijo: true,
      peticiones: true,
      peticionesHoy: true,
      ultimoUso: true,
      revocadaEn: true,
      createdAt: true,
    },
  });

  return NextResponse.json({
    items: claves.map((clave) => ({
      id: clave.id,
      nombre: clave.nombre,
      prefijo: clave.prefijo,
      peticiones: clave.peticiones,
      peticionesHoy: clave.peticionesHoy,
      ultimoUso: clave.ultimoUso?.toISOString() ?? null,
      revocadaEn: clave.revocadaEn?.toISOString() ?? null,
      creadaEn: clave.createdAt.toISOString(),
    })),
    maximo: CLAVES_POR_PLAN[sesion.user.planType],
  });
}

export async function POST(request: Request) {
  const sesion = await auth();
  if (!sesion?.user?.id) return fallo(401, "No autenticado");
  if (!planConApi(sesion.user.planType)) {
    return fallo(403, "La API pública requiere el plan Business o Agency.");
  }

  const cuerpo = (await request.json().catch(() => ({}))) as { nombre?: string };
  const nombre = cuerpo.nombre?.trim();
  if (!nombre) return fallo(400, "El nombre de la clave es obligatorio.");
  if (nombre.length > 60) return fallo(400, "El nombre no puede superar los 60 caracteres.");

  const maximo = CLAVES_POR_PLAN[sesion.user.planType];
  const activas = await prisma.apiKey.count({
    where: { userId: sesion.user.id, revocadaEn: null },
  });
  if (activas >= maximo) {
    return fallo(
      409,
      `Tu plan permite ${maximo} claves activas. Revoca una antes de crear otra.`,
    );
  }

  const { clave, prefijo, hash } = generarClave();
  try {
    const creada = await prisma.apiKey.create({
      data: { userId: sesion.user.id, nombre, prefijo, hash },
      select: { id: true, nombre: true, prefijo: true, createdAt: true },
    });

    logger.info("api.clave.creada", {
      prefijo,
      usuario: sesion.user.email,
      plan: sesion.user.planType,
    });

    return NextResponse.json(
      {
        item: {
          id: creada.id,
          nombre: creada.nombre,
          prefijo: creada.prefijo,
          creadaEn: creada.createdAt.toISOString(),
        },
        // Única vez que se muestra la clave completa.
        clave,
        aviso: "Guarda esta clave ahora: no se volverá a mostrar.",
      },
      { status: 201 },
    );
  } catch (error) {
    logger.error("api.clave.error", {
      usuario: sesion.user.email,
      error: error instanceof Error ? error.message : String(error),
    });
    return fallo(500, "No se pudo crear la clave. Inténtalo de nuevo.");
  }
}
