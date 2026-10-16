import "server-only";

/**
 * Resuelve la URL pública de la aplicación (sin barra final).
 *
 * Orden de preferencia:
 *  1. `NEXT_PUBLIC_APP_URL`, cuando apunta a un dominio real. Es lo que se usa
 *     en producción detrás de un dominio propio.
 *  2. El origen de la petición, que es la fuente más fiable en desarrollo, en
 *     entornos de vista previa o cuando el valor configurado es `localhost`.
 *  3. `http://localhost:3000` como último recurso (tareas sin petición, como el
 *     envío de correos).
 */
export function urlApp(request?: { url: string }): string {
  const configurada = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (configurada && !esLocal(configurada)) return configurada;

  if (request) {
    try {
      const origen = new URL(request.url).origin;
      if (origen) return origen;
    } catch {
      // Si la petición no trae una URL válida se sigue con el respaldo.
    }
  }

  return configurada ?? "http://localhost:3000";
}

/** ¿La URL apunta a la máquina local? */
function esLocal(url: string): boolean {
  return /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:\d+)?$/i.test(url);
}
