import type { Queue, Worker } from "bullmq";

/**
 * ============================================================================
 *  COLA DE TAREAS (BullMQ + Redis)
 * ============================================================================
 *  Los trabajos pesados (scraping de tiendas, recálculo de tendencias,
 *  notificaciones) se ejecutan en segundo plano.
 *
 *  · Con `REDIS_URL` configurada → BullMQ real (workers en proceso aparte).
 *  · Sin Redis                 → ejecución en proceso (inline) con el mismo
 *    contrato, de modo que la plataforma funciona igual en local y en la demo.
 *
 *  Arranque de los workers reales:  npm run worker
 * ============================================================================
 */

export const QUEUE_NAMES = {
  storeScan: "store-scan",
  trendRecalc: "trend-recalc",
  notifications: "notifications",
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

/** ¿Está Redis disponible para BullMQ? */
export function redisConfigured(): boolean {
  return Boolean(process.env.REDIS_URL);
}

/** Conexión compartida a Redis (se crea de forma perezosa). */
async function getConnection() {
  const url = process.env.REDIS_URL;
  if (!url) throw new Error("REDIS_URL no está configurada.");
  const { default: IORedis } = await import("ioredis");
  return new IORedis(url, { maxRetriesPerRequest: null });
}

/** Devuelve la cola de BullMQ indicada (o null si no hay Redis). */
export async function getQueue(nombre: QueueName): Promise<Queue | null> {
  if (!redisConfigured()) return null;
  const { Queue: BullQueue } = await import("bullmq");
  return new BullQueue(nombre, { connection: await getConnection() });
}

/**
 * Añade un trabajo a la cola.
 *
 * @param nombre   Cola destino.
 * @param jobName  Nombre del trabajo (para el router del worker).
 * @param data     Datos del trabajo.
 * @param handler  Función inline: se ejecuta si no hay Redis configurado.
 */
export async function enqueueJob<T>(
  nombre: QueueName,
  jobName: string,
  data: Record<string, unknown>,
  handler: () => Promise<T>,
): Promise<{ mode: "queue" | "inline"; jobId?: string; result?: T }> {
  const cola = await getQueue(nombre);
  if (cola) {
    try {
      const trabajo = await cola.add(jobName, data, {
        attempts: 3,
        backoff: { type: "exponential", delay: 5_000 },
        removeOnComplete: 100,
        removeOnFail: 200,
      });
      return { mode: "queue", jobId: String(trabajo.id) };
    } catch (error) {
      console.warn(`[queue] No se pudo encolar en ${nombre}, se ejecuta inline:`, (error as Error).message);
    }
  }
  // Modo inline: misma semántica, sin infraestructura externa.
  const result = await handler();
  return { mode: "inline", result };
}

/** Crea un worker de BullMQ para una cola concreta. */
export async function createWorker(
  nombre: QueueName,
  processor: (job: { name: string; data: Record<string, unknown> }) => Promise<unknown>,
  concurrency = 2,
): Promise<Worker | null> {
  if (!redisConfigured()) return null;
  const { Worker: BullWorker } = await import("bullmq");
  return new BullWorker(nombre, async (job) => processor({ name: job.name, data: job.data as Record<string, unknown> }), {
    connection: await getConnection(),
    concurrency,
  });
}

/** Estado de los trabajos de una cola (para el panel de administración). */
export async function getQueueStats(nombre: QueueName) {
  const cola = await getQueue(nombre);
  if (!cola) {
    return { disponible: false, waiting: 0, active: 0, completed: 0, failed: 0 };
  }
  const [waiting, active, completed, failed] = await Promise.all([
    cola.getWaitingCount(),
    cola.getActiveCount(),
    cola.getCompletedCount(),
    cola.getFailedCount(),
  ]);
  return { disponible: true, waiting, active, completed, failed };
}
