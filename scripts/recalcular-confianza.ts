/**
 * Recalcula el nivel de confianza de todos los productos.
 *
 *   npm run confianza:recalcular
 *
 * Útil después de importar datos nuevos o de actualizar la regla de cálculo:
 * no toca las mediciones, solo vuelve a puntuar con la procedencia guardada.
 */
import { recalcularTodasLasConfianzas } from "@/lib/confianzaProducto";

const resultados = await recalcularTodasLasConfianzas();
const porNivel = resultados.reduce<Record<string, number>>((acumulado, fila) => {
  acumulado[fila.nivel] = (acumulado[fila.nivel] ?? 0) + 1;
  return acumulado;
}, {});

console.log(`[confianza] ${resultados.length} productos recalculados`);
for (const [nivel, cantidad] of Object.entries(porNivel)) {
  console.log(`  · ${nivel}: ${cantidad}`);
}
process.exit(0);
