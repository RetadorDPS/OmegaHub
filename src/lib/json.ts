import type { Prisma } from "@/generated/prisma/client";

/**
 * Convierte valores arbitrarios de JavaScript en el tipo `InputJsonValue` que
 * espera Prisma en las columnas `Json`.
 *
 * Motivo: las columnas `Json` se almacenan como TEXT en SQLite, y Prisma exige
 * que el objeto sea estructuralmente serializable (sin `undefined`, funciones ni
 * clases). Esta función normaliza el valor por la vía segura (JSON) evitando
 * errores de tipos en tiempo de compilación.
 */
export function toJsonInput(
  valor: unknown,
): Prisma.InputJsonValue | undefined {
  if (valor === null || valor === undefined) return undefined;
  try {
    return JSON.parse(JSON.stringify(valor)) as Prisma.InputJsonValue;
  } catch {
    return undefined;
  }
}

/** Igual que `toJsonInput` pero devolviendo `null` en lugar de `undefined`. */
export function toJsonInputOrNull(valor: unknown): Prisma.InputJsonValue | null {
  return toJsonInput(valor) ?? null;
}
