import OpenAI from "openai";
import { GoogleGenAI } from "@google/genai";
import { PROMPT_TEMPLATES, construirContextoProducto, generarContenidoLocal } from "@/lib/aiTemplates";
import type {
  AdCopyVariant,
  AiProvider,
  BuyerPersona,
  ProductDTO,
  StoreNameIdea,
  VideoScript,
} from "@/types";

/**
 * ============================================================================
 *  MOTOR DE IA DEL AI STUDIO
 * ============================================================================
 *  Tres modos de funcionamiento, elegidos automáticamente:
 *
 *   1. OPENAI     → si existe OPENAI_API_KEY (modelo configurable).
 *   2. GEMINI     → si existe GEMINI_API_KEY / GOOGLE_API_KEY.
 *   3. SIMULATED  → motor de plantillas interno, sin red.
 *
 *  El modo simulado no es un "placeholder": genera contenido real y específico
 *  a partir de los datos del producto (ángulos, hooks, guiones con timecodes,
 *  buyer personas con objeciones…). Así la plataforma es 100% funcional en
 *  local y en la demo, y mejora automáticamente al conectar una API de IA.
 * ============================================================================
 */

/** Proveedor de IA activo según las variables de entorno. */
export function getActiveProvider(): AiProvider {
  const preferido = (process.env.AI_PROVIDER ?? "").toLowerCase();
  if (preferido === "openai" && process.env.OPENAI_API_KEY) return "OPENAI";
  if (preferido === "gemini" && (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY)) return "GEMINI";
  if (process.env.OPENAI_API_KEY) return "OPENAI";
  if (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY) return "GEMINI";
  return "SIMULATED";
}

/** Modelo por defecto de cada proveedor. */
export function getActiveModel(): string {
  switch (getActiveProvider()) {
    case "OPENAI":
      return process.env.OPENAI_MODEL ?? "gpt-4o-mini";
    case "GEMINI":
      return process.env.GEMINI_MODEL ?? "gemini-2.5-flash";
    default:
      return "plantilla-interna-v1";
  }
}

/** Resultado de una generación con metadatos de auditoría. */
export interface AiResult<T> {
  data: T;
  provider: AiProvider;
  model: string;
  promptUsed: string;
  tokensUsed: number;
  latencyMs: number;
}

/** Convierte el texto de respuesta del modelo en JSON estructurado. */
function extraerJson<T>(texto: string): T {
  // Se acepta JSON puro o envuelto en bloques ```json ... ```
  const limpio = texto.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const inicio = limpio.search(/[[{]/);
  const fin = Math.max(limpio.lastIndexOf("}"), limpio.lastIndexOf("]"));
  const recortado = inicio >= 0 && fin > inicio ? limpio.slice(inicio, fin + 1) : limpio;
  return JSON.parse(recortado) as T;
}

/** Llama al modelo (OpenAI o Gemini) y devuelve el texto generado. */
async function llamarModelo(prompt: string, sistema: string): Promise<{ texto: string; tokens: number }> {
  const proveedor = getActiveProvider();

  if (proveedor === "OPENAI") {
    const cliente = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const respuesta = await cliente.chat.completions.create({
      model: getActiveModel(),
      messages: [
        { role: "system", content: sistema },
        { role: "user", content: prompt },
      ],
      temperature: 0.85,
      response_format: { type: "json_object" },
    });
    return {
      texto: respuesta.choices[0]?.message?.content ?? "",
      tokens: respuesta.usage?.total_tokens ?? 0,
    };
  }

  const cliente = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY });
  const respuesta = await cliente.models.generateContent({
    model: getActiveModel(),
    contents: `${sistema}\n\n${prompt}`,
    config: { temperature: 0.85, responseMimeType: "application/json" },
  });
  return {
    texto: respuesta.text ?? "",
    tokens: respuesta.usageMetadata?.totalTokenCount ?? 0,
  };
}

/**
 * Ejecuta una generación completa: intenta el modelo real y, si no hay
 * credenciales o falla la llamada, cae al motor de plantillas local.
 */
async function generar<T>(
  clave: keyof typeof PROMPT_TEMPLATES,
  producto: ProductDTO | null,
  opciones: Record<string, unknown>,
  fallback: () => T,
): Promise<AiResult<T>> {
  const inicio = Date.now();
  const prompt = PROMPT_TEMPLATES[clave]({ producto, ...opciones });
  const proveedor = getActiveProvider();

  if (proveedor === "SIMULATED") {
    const datos = fallback();
    return {
      data: datos,
      provider: "SIMULATED",
      model: getActiveModel(),
      promptUsed: prompt,
      tokensUsed: Math.round(prompt.length / 4) + 220,
      latencyMs: Date.now() - inicio + 180,
    };
  }

  try {
    const { texto, tokens } = await llamarModelo(prompt, PROMPT_TEMPLATES.sistema());
    const datos = extraerJson<T>(texto);
    return {
      data: datos,
      provider: proveedor,
      model: getActiveModel(),
      promptUsed: prompt,
      tokensUsed: tokens,
      latencyMs: Date.now() - inicio,
    };
  } catch (error) {
    // Degradación elegante: la plataforma nunca se queda sin respuesta.
    console.warn(`[ai] Fallo del proveedor ${proveedor}, se usa el motor local:`, (error as Error).message);
    const datos = fallback();
    return {
      data: datos,
      provider: "SIMULATED",
      model: "plantilla-interna-v1",
      promptUsed: prompt,
      tokensUsed: Math.round(prompt.length / 4) + 220,
      latencyMs: Date.now() - inicio,
    };
  }
}

// ---------------------------------------------------------------------------
//  Herramientas del AI Studio
// ---------------------------------------------------------------------------

/** Genera 5 variantes de copy publicitario con ángulos distintos. */
export async function generateAdCopies(
  producto: ProductDTO,
  opciones: { plataforma?: string; tono?: string; publico?: string; cantidad?: number } = {},
): Promise<AiResult<AdCopyVariant[]>> {
  const contexto = construirContextoProducto(producto);
  const cantidad = opciones.cantidad ?? 5;
  return generar<AdCopyVariant[]>(
    "adCopy",
    producto,
    { ...opciones, cantidad },
    () => generarContenidoLocal("AD_COPY", { producto, contexto }, opciones).copies as AdCopyVariant[],
  );
}

/** Genera un guion de vídeo con escenas cronometradas (15/30/60 s). */
export async function generateVideoScript(
  producto: ProductDTO,
  opciones: { duracion?: 15 | 30 | 60; plataforma?: string; estilo?: string } = {},
): Promise<AiResult<VideoScript>> {
  const duracion = opciones.duracion ?? 30;
  return generar<VideoScript>(
    "videoScript",
    producto,
    { ...opciones, duracion },
    () =>
      generarContenidoLocal("VIDEO_SCRIPT", { producto }, { ...opciones, duracion }).script as VideoScript,
  );
}

/** Genera un buyer persona detallado con objeciones y detonantes de compra. */
export async function generateBuyerPersona(
  producto: ProductDTO,
  opciones: { pais?: string; rangoEdad?: string; genero?: string } = {},
): Promise<AiResult<BuyerPersona>> {
  return generar<BuyerPersona>(
    "buyerPersona",
    producto,
    opciones,
    () => generarContenidoLocal("BUYER_PERSONA", { producto }, opciones).persona as BuyerPersona,
  );
}

/** Propone nombres de tienda con dominio y justificación de marca. */
export async function generateStoreNames(
  opciones: { nicho: string; estilo?: string; idioma?: string; cantidad?: number },
  producto?: ProductDTO | null,
): Promise<AiResult<StoreNameIdea[]>> {
  const cantidad = opciones.cantidad ?? 8;
  return generar<StoreNameIdea[]>(
    "storeNames",
    producto ?? null,
    { ...opciones, cantidad },
    () => generarContenidoLocal("STORE_NAMES", { nicho: opciones.nicho }, { ...opciones, cantidad }).names as StoreNameIdea[],
  );
}

/** Analiza un producto (fortalezas, riesgos y recomendación de entrada). */
export async function analyzeProduct(producto: ProductDTO): Promise<AiResult<Record<string, unknown>>> {
  return generar<Record<string, unknown>>(
    "productAnalysis",
    producto,
    {},
    () => generarContenidoLocal("PRODUCT_ANALYSIS", { producto }, {}).analysis as Record<string, unknown>,
  );
}
