/**
 * ============================================================================
 *  LIMITES DE RITMO (rate limiting) EN MEMORIA
 * ============================================================================
 *  Ventana deslizante por usuario y acción. Protege los
 *  endpoints pesados (análisis de tienda, importación) de
 *  ráfagas accidentales o abusivas.
 *
 *  Con Redis (despliegue escalado) se comparte entre
 *  procesos; en un solo contenedor la memoria basta.
 * ============================================================================
 */

interface Marcador {
  cuenta: number;
  reinicio: number;
}

const ventanas = new Map<string, Marcador>();

/**
 * ¿Puede el usuario realizar la acción ahora?
 *
 * @param clave    Ej. `usuarioId:analisis-tienda`
 * @param maximo   Peticiones permitidas en la ventana
 * @param ventanaMs Duración de la ventana
 */
export function permitido(
  clave: string,
  maximo = 5,
  ventanaMs = 60_000,
): boolean {
  const ahora = Date.now();
  const actual = ventanas.get(clave);

  if (!actual || actual.reinicio < ahora) {
    ventanas.set(clave, { cuenta: 1, reinicio: ahora + ventanaMs });
    return true;
  }

  if (actual.cuenta >= maximo) return false;
  actual.cuenta += 1;
  return true;
}

/** Peticiones consumidas en la ventana vigente (0 si ya caducó). */
export function consumidas(clave: string): number {
  const actual = ventanas.get(clave);
  if (!actual || actual.reinicio < Date.now()) return 0;
  return actual.cuenta;
}

/** Segundos que faltan para que la ventana se reinicie. */
export function segundosParaReinicio(clave: string): number {
  const actual = ventanas.get(clave);
  if (!actual) return 0;
  return Math.max(1, Math.ceil((actual.reinicio - Date.now()) / 1000));
}

/**
 * Clave de límite por IP del visitante y acción.
 *
 * Se usa en las rutas públicas (alta, recuperar contraseña) donde todavía no
 * hay usuario: así una misma máquina no puede probar miles de correos.
 * Detrás de un proxy, `x-forwarded-for` trae la IP real en la primera posición.
 */
export function claveDeIp(request: Request, accion: string): string {
  const cabecera =
    request.headers.get("x-forwarded-for") ??
    request.headers.get("x-real-ip") ??
    "";
  const ip = cabecera.split(",")[0]?.trim() || "desconocida";
  return `ip:${ip}:${accion}`;
}
