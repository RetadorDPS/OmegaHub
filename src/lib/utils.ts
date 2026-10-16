import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Combina clases de Tailwind resolviendo conflictos (usado por los componentes UI). */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

// ---------------------------------------------------------------------------
//  Formateadores (locale español, moneda USD por defecto en e-commerce)
// ---------------------------------------------------------------------------

const currencyFormatter = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const currencyFormatterPrecise = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Formatea importes sin decimales: 12345 → "12.345 US$". */
export function formatCurrency(value: number): string {
  return currencyFormatter.format(value ?? 0);
}

/** Formatea importes con dos decimales: 19.9 → "19,90 US$". */
export function formatCurrencyPrecise(value: number): string {
  return currencyFormatterPrecise.format(value ?? 0);
}

/** Formatea números grandes de forma compacta: 1250000 → "1,3 M". */
export function formatCompactNumber(value: number): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "0";
  if (Math.abs(value) < 1000) return new Intl.NumberFormat("es-ES").format(value);
  return new Intl.NumberFormat("es-ES", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

/** Formatea números con separadores de miles. */
export function formatNumber(value: number): string {
  return new Intl.NumberFormat("es-ES").format(value ?? 0);
}

/** Formatea un porcentaje: 34.5 → "34,5 %". */
export function formatPercent(value: number, decimals = 1): string {
  return `${new Intl.NumberFormat("es-ES", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value ?? 0)} %`;
}

/** Convierte un texto en slug URL-safe. */
export function slugify(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

/** Recorta un texto añadiendo puntos suspensivos. */
export function truncate(text: string, maxLength = 120): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).trimEnd()}…`;
}

/** Convierte una fecha a formato largo en español. */
export function formatDate(value: Date | string, options?: Intl.DateTimeFormatOptions): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("es-ES", options ?? { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

/** Formatea fecha y hora. */
export function formatDateTime(value: Date | string): string {
  return formatDate(value, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Texto relativo tipo "hace 3 horas". */
export function formatRelativeTime(value: Date | string): string {
  const date = typeof value === "string" ? new Date(value) : value;
  const seconds = Math.round((Date.now() - date.getTime()) / 1000);
  const rtf = new Intl.RelativeTimeFormat("es-ES", { numeric: "auto" });
  const thresholds: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ["second", 60],
    ["minute", 60],
    ["hour", 24],
    ["day", 30],
    ["month", 12],
    ["year", Number.POSITIVE_INFINITY],
  ];
  let duration = seconds;
  for (const [unit, limit] of thresholds) {
    if (Math.abs(duration) < limit) return rtf.format(-Math.round(duration), unit);
    duration /= limit;
  }
  return formatDate(date);
}

/** Etiqueta corta de un día ("12 oct"). */
export function formatShortDay(value: Date | string): string {
  return formatDate(value, { day: "2-digit", month: "short" });
}

// ---------------------------------------------------------------------------
//  Helpers de datos y URL
// ---------------------------------------------------------------------------

/**
 * Lee una columna JSON almacenada como texto y devuelve siempre un array.
 * Necesario porque SQLite guarda `Json` como TEXT.
 */
export function parseJsonArray<T = string>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

/** Lee una columna JSON y devuelve un objeto (o `null`). */
export function parseJsonObject<T = Record<string, unknown>>(value: unknown): T | null {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as T;
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as T) : null;
  } catch {
    return null;
  }
}

/** Serializa un array a JSON para columnas de texto. */
export function serializeJsonArray(value: unknown[]): string {
  return JSON.stringify(value ?? []);
}

/** Construye una query string ignorando valores vacíos. */
export function buildQueryString(params: Record<string, string | number | boolean | undefined | null>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "" || value === "ALL") continue;
    search.set(key, String(value));
  }
  const result = search.toString();
  return result ? `?${result}` : "";
}

/** Clave de día (YYYY-MM-DD) usada por las cuotas de plan. */
export function getDayKey(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

/** Normaliza una URL de tienda introducida por el usuario. */
export function normalizeStoreUrl(input: string): string {
  let value = input.trim().toLowerCase();
  if (!value) return "";
  if (!/^https?:\/\//.test(value)) value = `https://${value}`;
  try {
    const url = new URL(value);
    return `${url.protocol}//${url.host}`.replace(/\/$/, "");
  } catch {
    return "";
  }
}

/** Extrae el dominio efectivo de una URL. */
export function extractDomain(input: string): string {
  const normalized = normalizeStoreUrl(input);
  if (!normalized) return "";
  try {
    return new URL(normalized).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/** Primera letra en mayúscula. */
export function capitalize(text: string): string {
  if (!text) return "";
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Limita un valor numérico a un rango. */
export function clampNumber(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Genera iniciales para el avatar a partir de un nombre o email. */
export function getInitials(name?: string | null, email?: string | null): string {
  const source = (name ?? email ?? "?").trim();
  const parts = source.split(/[\s@._-]+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

/** Pausa la ejecución (usado por los scrapers simulados). */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
