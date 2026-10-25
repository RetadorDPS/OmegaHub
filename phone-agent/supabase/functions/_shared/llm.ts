export type LlmProvider = "gemini" | "anthropic";

export interface LlmConfig {
  provider: LlmProvider;
  apiKey: string;
}

export interface LlmRequest {
  config: LlmConfig;
  model: string;
  system: string;
  userText: string;
  imageBase64?: string;
  maxOutputTokens: number;
  signal: AbortSignal;
}

/** Selecciona un proveedor cuyas claves solo existen en el servidor. */
export function resolveLlmConfig(): LlmConfig {
  const requested = (Deno.env.get("AI_PROVIDER") ?? "auto").trim().toLowerCase();
  const geminiKey = Deno.env.get("GEMINI_API_KEY")?.trim() ?? "";
  const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY")?.trim() ?? "";

  if (requested === "gemini") {
    if (!geminiKey) throw new Error("Falta el secreto GEMINI_API_KEY en Supabase.");
    return { provider: "gemini", apiKey: geminiKey };
  }
  if (requested === "anthropic") {
    if (!anthropicKey) throw new Error("Falta el secreto ANTHROPIC_API_KEY en Supabase.");
    return { provider: "anthropic", apiKey: anthropicKey };
  }
  if (requested !== "auto") {
    throw new Error("AI_PROVIDER debe ser gemini, anthropic o auto.");
  }

  // Para el prototipo sin presupuesto, se prefiere Gemini cuando su clave existe.
  if (geminiKey) return { provider: "gemini", apiKey: geminiKey };
  if (anthropicKey) return { provider: "anthropic", apiKey: anthropicKey };
  throw new Error("Configura GEMINI_API_KEY (opción recomendada para probar sin coste) o ANTHROPIC_API_KEY en los secretos de Supabase.");
}

/** Respeta el modelo configurado solo si corresponde al proveedor seleccionado. */
export function resolveLlmModel(provider: LlmProvider, configured = ""): string {
  const requested = configured.trim();
  if (provider === "gemini") {
    if (requested.startsWith("gemini-")) return requested;
    return Deno.env.get("GEMINI_MODEL")?.trim() || "gemini-3.1-flash-lite";
  }
  if (requested.startsWith("claude-")) return requested;
  return Deno.env.get("ANTHROPIC_MODEL")?.trim() || "claude-sonnet-4-20250514";
}

/** Envía texto e imagen al proveedor configurado sin exponer su clave al teléfono. */
export async function generateText(request: LlmRequest): Promise<string> {
  return request.config.provider === "gemini"
    ? generateGeminiText(request)
    : generateAnthropicText(request);
}

async function generateGeminiText(request: LlmRequest): Promise<string> {
  const parts: Record<string, unknown>[] = [];
  if (request.imageBase64?.trim()) {
    parts.push({ inlineData: { mimeType: "image/jpeg", data: request.imageBase64 } });
  }
  parts.push({ text: request.userText });

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(request.model)}:generateContent`,
    {
      method: "POST",
      signal: request.signal,
      headers: { "x-goog-api-key": request.config.apiKey, "content-type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: request.system }] },
        contents: [{ role: "user", parts }],
        generationConfig: { maxOutputTokens: request.maxOutputTokens, responseMimeType: "application/json" },
      }),
    },
  );
  const raw = await response.text();
  if (!response.ok) throw new Error(`Gemini API ${response.status}: ${raw.slice(0, 400)}`);
  const parsed = JSON.parse(raw) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }>;
    promptFeedback?: { blockReason?: string };
  };
  const text = (parsed.candidates?.[0]?.content?.parts ?? [])
    .map((part) => part.text ?? "")
    .join("\n").trim();
  if (!text) {
    const reason = parsed.promptFeedback?.blockReason ?? parsed.candidates?.[0]?.finishReason ?? "respuesta vacía";
    throw new Error(`Gemini no devolvió texto: ${reason}`);
  }
  return text;
}

async function generateAnthropicText(request: LlmRequest): Promise<string> {
  const content: Record<string, unknown>[] = [];
  if (request.imageBase64?.trim()) {
    content.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: request.imageBase64 } });
  }
  content.push({ type: "text", text: request.userText });
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    signal: request.signal,
    headers: {
      "x-api-key": request.config.apiKey,
      "Anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: request.model,
      max_tokens: request.maxOutputTokens,
      system: request.system,
      messages: [{ role: "user", content }],
    }),
  });
  const raw = await response.text();
  if (!response.ok) throw new Error(`Anthropic API ${response.status}: ${raw.slice(0, 400)}`);
  const parsed = JSON.parse(raw) as { content?: Array<{ type: string; text?: string }> };
  return (parsed.content ?? []).filter((part) => part.type === "text")
    .map((part) => part.text ?? "").join("\n").trim();
}
