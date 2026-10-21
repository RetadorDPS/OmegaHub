/**
 * ============================================================================
 *  LOGS ESTRUCTURADOS
 * ============================================================================
 *  Una línea JSON por evento: fácil de filtrar en Docker,
 *  Railway o cualquier agregador (jq, Datadog, Loki).
 *  Nunca registra secretos ni contenido de usuarios.
 * ============================================================================
 */

type Nivel = "info" | "aviso" | "error";

function linea(nivel: Nivel, suceso: string, datos: Record<string, unknown> = {}) {
  const entrada = {
    nivel,
    suceso,
    marca: new Date().toISOString(),
    ...datos,
  };
  const texto = JSON.stringify(entrada);
  if (nivel === "error") console.error(texto);
  else if (nivel === "aviso") console.warn(texto);
  else console.log(texto);
}

export const logger = {
  info: (suceso: string, datos?: Record<string, unknown>) => linea("info", suceso, datos),
  aviso: (suceso: string, datos?: Record<string, unknown>) => linea("aviso", suceso, datos),
  error: (suceso: string, datos?: Record<string, unknown>) => linea("error", suceso, datos),
};
