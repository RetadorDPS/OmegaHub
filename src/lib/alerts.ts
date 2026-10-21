import "server-only";

import prisma from "@/lib/prisma";
import { toJsonInput } from "@/lib/json";
import { createNotification } from "@/lib/notifications";
import { entregarAlerta, estadoCanales, type ResultadoEntrega } from "@/lib/canales";
import { enviarAWebhooks, type EventoWebhook } from "@/lib/webhooks";

/**
 * ============================================================================
 *  MOTOR DE ALERTAS
 * ============================================================================
 *  Evalúa los seguimientos y AVISA de verdad: crea la notificación
 *  en la campana del panel y la entrega por los canales
 *  configurados (correo, Telegram y webhook). Se ejecuta desde
 *  `/api/cron/alertas` o desde el worker de BullMQ.
 *
 *  Tipos de alerta:
 *    · SCORE_THRESHOLD  → el producto seguido alcanzó el score objetivo.
 *    · PRICE_CHANGE     → una tienda seguida cambió el precio.
 *    · NEW_PRODUCT      → una tienda seguida publicó productos nuevos.
 *    · SATURATION_ALERT → el mercado del producto seguido se saturó.
 *    · TREND_REVERSAL   → un producto seguido dejó de subir.
 * ============================================================================
 */

export interface ResultadoAlertas {
  evaluados: { productos: number; tiendas: number };
  creadas: number;
  entregadas: { email: number; telegram: number; webhook: number; push: number };
  detalle: Array<{
    tipo: string;
    titulo: string;
    usuario: string;
    entregado: ResultadoEntrega;
  }>;
  canales: Array<{ id: string; nombre: string; configurado: boolean }>;
  duracionMs: number;
}

/** Umbral de caída de velocidad que dispara el aviso de salida. */
const CAIDA_AVISO = 25;

/**
 * Traduce el tipo de aviso al evento al que se puede suscribir un webhook.
 * Así quien solo quiere precios no recibe también los avisos de score.
 */
function eventoDeAviso(tipo: string): EventoWebhook {
  switch (tipo) {
    case "NEW_PRODUCT":
      return "producto";
    case "PRICE_CHANGE":
      return "precio";
    case "SOLD_OUT":
      return "agotado";
    default:
      return "alerta";
  }
}

/**
 * Evalúa los seguimientos y genera las alertas pendientes.
 *
 * Es idempotente por día: cada condición se avisa como máximo
 * una vez al día para el mismo elemento.
 */
export async function evaluarAlertas(
  opciones: { usuarioId?: string; enviarCanales?: boolean } = {},
): Promise<ResultadoAlertas> {
  const inicio = Date.now();
  const enviar = opciones.enviarCanales ?? true;
  const desde = new Date(Date.now() - 20 * 60 * 60 * 1000); // últimas 20 h

  const detalle: ResultadoAlertas["detalle"] = [];
  const conteoEntrega = { email: 0, telegram: 0, webhook: 0, push: 0 };

  // --- 1 · Productos seguidos ----------------------------------------------
  const seguimientos = await prisma.trackedProduct.findMany({
    where: opciones.usuarioId ? { userId: opciones.usuarioId } : {},
    include: {
      product: {
        select: {
          id: true, title: true, trendScore: true, velocityScore: true,
          saturationLevel: true, trendDirection: true,
        },
      },
      user: { select: { id: true, email: true, name: true } },
    },
  });

  for (const seguimiento of seguimientos) {
    const producto = seguimiento.product;
    const avisos: Array<{ tipo: string; titulo: string; mensaje: string; detalle: string }> = [];

    // Objetivo de score alcanzado.
    if (producto.trendScore >= seguimiento.targetTrendScore) {
      avisos.push({
        tipo: "SCORE_THRESHOLD",
        titulo: `${producto.title} alcanzó el score ${seguimiento.targetTrendScore}`,
        mensaje: `El producto que sigues está en ${producto.trendScore}/100, por encima de tu objetivo de ${seguimiento.targetTrendScore}.`,
        detalle: `Score actual: ${producto.trendScore} · Velocidad: ${Math.round(producto.velocityScore)}/100 · Saturación: ${producto.saturationLevel}`,
      });
    }

    // Mercado saturado.
    if (producto.saturationLevel === "HIGH") {
      avisos.push({
        tipo: "SATURATION_ALERT",
        titulo: `${producto.title} se ha saturado`,
        mensaje: "El número de tiendas vendiéndolo creció hasta el nivel alto: el margen empezará a comprimirse.",
        detalle: `Saturación: ${producto.saturationLevel} · Recomendación: diferenciar oferta o reducir presupuesto.`,
      });
    }

    // La tendencia dejó de subir.
    if (producto.trendDirection === "FALLING" || producto.velocityScore < CAIDA_AVISO) {
      avisos.push({
        tipo: "TREND_REVERSAL",
        titulo: `${producto.title} deja de subir`,
        mensaje: "La velocidad de la tendencia cayó: es el momento de revisar el gasto publicitario.",
        detalle: `Velocidad: ${Math.round(producto.velocityScore)}/100 · Dirección: ${producto.trendDirection}`,
      });
    }

    for (const aviso of avisos) {
      if (seguimiento.notificationEnabled === false) break;
      const yaAvisado = await prisma.alertNotification.findFirst({
        where: { userId: seguimiento.userId, entityId: producto.id, type: aviso.tipo as never, createdAt: { gte: desde } },
        select: { id: true },
      });
      if (yaAvisado) continue;

      const ruta = `/dashboard/winning-products/${producto.id}`;
      const notificacion = await createNotification({
        userId: seguimiento.userId,
        type: aviso.tipo as never,
        title: aviso.titulo,
        message: aviso.mensaje,
        entityType: "product",
        entityId: producto.id,
        actionUrl: ruta,
        metadata: { detalle: aviso.detalle },
      });

      const entrega = enviar
        ? await entregarAlerta({
            email: seguimiento.user.email ?? "",
            nombre: seguimiento.user.name ?? "usuario",
            titulo: aviso.titulo,
            mensaje: aviso.mensaje,
            ruta,
            detalle: aviso.detalle,
            usuarioId: seguimiento.userId,
            etiqueta: `thp-${producto.id}`,
            tipo: aviso.tipo,
          })
        : { email: false, telegram: false, webhook: false, push: false, motivos: ["Envío desactivado"] };

      // Webhooks propios del usuario (Slack, Discord, n8n…). Si uno falla, la
      // alerta ya está guardada: no se pierde nada.
      const webhooks = enviar
        ? await enviarAWebhooks(seguimiento.userId, eventoDeAviso(aviso.tipo), {
            titulo: aviso.titulo,
            mensaje: aviso.mensaje,
            detalle: aviso.detalle,
            ruta,
            tipo: aviso.tipo,
          })
        : [];
      if (webhooks.some((resultado) => resultado.ok)) entrega.webhook = true;

      await prisma.alertNotification.update({
        where: { id: notificacion.id },
        data: {
          metadata: toJsonInput({
            detalle: aviso.detalle,
            entrega: { email: entrega.email, telegram: entrega.telegram, webhook: entrega.webhook, push: entrega.push ?? false },
            motivos: entrega.motivos,
          }),
        },
      });

      if (entrega.email) conteoEntrega.email += 1;
      if (entrega.telegram) conteoEntrega.telegram += 1;
      if (entrega.webhook) conteoEntrega.webhook += 1;
      if (entrega.push) conteoEntrega.push += 1;
      detalle.push({ tipo: aviso.tipo, titulo: aviso.titulo, usuario: seguimiento.user.email, entregado: entrega });
    }
  }

  // --- 2 · Tiendas seguidas -------------------------------------------------
  const tiendas = await prisma.trackedStore.findMany({
    where: opciones.usuarioId ? { userId: opciones.usuarioId } : {},
    include: {
      store: { select: { id: true, name: true, domain: true } },
      user: { select: { id: true, email: true, name: true } },
    },
  });

  for (const seguimiento of tiendas) {
    if (seguimiento.notificationEnabled === false) continue;

    const cambios = await prisma.storeChange.findMany({
      where: { storeId: seguimiento.store.id, detectedAt: { gte: desde } },
      orderBy: { detectedAt: "desc" },
      take: 5,
    });
    if (cambios.length === 0) continue;

    const TITULOS: Record<string, (cantidad: number, tienda: string) => string> = {
      NEW_PRODUCT: (cantidad, tienda) =>
        `${tienda} publicó ${cantidad} producto${cantidad === 1 ? "" : "s"} nuevo${cantidad === 1 ? "" : "s"}`,
      PRICE_CHANGE: (cantidad, tienda) => `${tienda} cambió el precio de ${cantidad} producto${cantidad === 1 ? "" : "s"}`,
      SOLD_OUT: (cantidad, tienda) => `${tienda} agotó ${cantidad} producto${cantidad === 1 ? "" : "s"}`,
      THEME_CHANGE: (_cantidad, tienda) => `${tienda} cambió la plantilla de su tienda`,
      TRAFFIC_SPIKE: (cantidad, tienda) => `${tienda} registró ${cantidad} pico${cantidad === 1 ? "" : "s"} de tráfico`,
      REVENUE_MILESTONE: (cantidad, tienda) => `${tienda} alcanzó ${cantidad} hito${cantidad === 1 ? "" : "s"} de facturación`,
    };

    const PRIORIDAD = ["NEW_PRODUCT", "PRICE_CHANGE", "SOLD_OUT", "TRAFFIC_SPIKE", "REVENUE_MILESTONE", "THEME_CHANGE"];
    const dominante = PRIORIDAD.find((tipoCambio) => cambios.some((cambio) => cambio.type === tipoCambio)) ?? cambios[0].type;
    const delTipo = cambios.filter((cambio) => cambio.type === dominante);
    const titulo = (TITULOS[dominante] ?? ((cantidad: number, tienda: string) => `${tienda}: ${cantidad} cambio(s) detectado(s)`))(
      delTipo.length,
      seguimiento.store.name,
    );
    const tipo = dominante === "NEW_PRODUCT" || dominante === "PRICE_CHANGE" ? dominante : "STORE_CHANGE";

    const yaAvisado = await prisma.alertNotification.findFirst({
      where: { userId: seguimiento.userId, entityId: seguimiento.store.id, type: tipo as never, createdAt: { gte: desde } },
      select: { id: true },
    });
    if (yaAvisado) continue;

    const resumen = cambios.map((cambio) => cambio.description).slice(0, 3).join(" · ");
    const ruta = `/dashboard/store-tracker/${seguimiento.store.id}`;

    const notificacion = await createNotification({
      userId: seguimiento.userId,
      type: tipo as never,
      title: titulo,
      message: resumen,
      entityType: "store",
      entityId: seguimiento.store.id,
      actionUrl: ruta,
      metadata: { cambios: cambios.length },
    });

    const entrega = enviar
      ? await entregarAlerta({
          email: seguimiento.user.email ?? "",
          nombre: seguimiento.user.name ?? "usuario",
          titulo,
          mensaje: resumen,
          ruta,
          detalle: `Tienda: ${seguimiento.store.domain} · Cambios detectados: ${cambios.length}`,
          usuarioId: seguimiento.userId,
          etiqueta: `thp-${seguimiento.store.id}`,
          tipo,
        })
      : { email: false, telegram: false, webhook: false, push: false, motivos: ["Envío desactivado"] };

    const webhooks = enviar
      ? await enviarAWebhooks(seguimiento.userId, eventoDeAviso(tipo), {
          titulo,
          mensaje: resumen,
          detalle: `${seguimiento.store.domain} · ${cambios.length} cambio(s)`,
          ruta,
          tipo,
        })
      : [];
    if (webhooks.some((resultado) => resultado.ok)) entrega.webhook = true;

    await prisma.alertNotification.update({
      where: { id: notificacion.id },
      data: {
        metadata: toJsonInput({
          cambios: cambios.length,
          entrega: { email: entrega.email, telegram: entrega.telegram, webhook: entrega.webhook, push: entrega.push ?? false },
          motivos: entrega.motivos,
        }),
      },
    });

    if (entrega.email) conteoEntrega.email += 1;
    if (entrega.telegram) conteoEntrega.telegram += 1;
    if (entrega.webhook) conteoEntrega.webhook += 1;
    if (entrega.push) conteoEntrega.push += 1;
    detalle.push({ tipo, titulo, usuario: seguimiento.user.email, entregado: entrega });
  }

  return {
    evaluados: { productos: seguimientos.length, tiendas: tiendas.length },
    creadas: detalle.length,
    entregadas: conteoEntrega,
    detalle,
    canales: estadoCanales().map(({ id, nombre, configurado }) => ({ id, nombre, configurado })),
    duracionMs: Date.now() - inicio,
  };
}
