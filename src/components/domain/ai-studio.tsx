"use client";

import { useState } from "react";
import {
  Brain,
  Check,
  Clapperboard,
  Copy,
  History,
  Image as ImageIcon,
  Lightbulb,
  MessagesSquare,
  Sparkles,
  Store,
  UserRound,
  Wand2,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { AiToolType, ProductDTO } from "@/types";
import { RelativeTime } from "@/components/domain/relative-time";

/** Generación guardada en el historial del AI Studio. */
export interface GenerationHistoryItem {
  id: string;
  tool: AiToolType;
  provider: string;
  model: string;
  tokensUsed: number;
  latencyMs: number;
  createdAt: string;
  productTitle: string | null;
  preview: string;
}

interface AiStudioProps {
  productos: Array<Pick<ProductDTO, "id" | "title" | "category" | "nicheTag" | "suggestedSellPrice">>;
  historial: GenerationHistoryItem[];
  proveedor: { activo: string; modelo: string; configurado: boolean };
  uso: { usado: number; limite: number | null };
}

const HERRAMIENTAS: Array<{
  id: AiToolType;
  etiqueta: string;
  descripcion: string;
  icono: React.ComponentType<{ className?: string }>;
  requiereProducto: boolean;
}> = [
  {
    id: "AD_COPY",
    etiqueta: "Copies publicitarios",
    descripcion: "5 variantes con ángulos distintos, titular, texto principal y llamada a la acción.",
    icono: MessagesSquare,
    requiereProducto: true,
  },
  {
    id: "VIDEO_SCRIPT",
    etiqueta: "Guion de vídeo",
    descripcion: "Guion de 15, 30 o 60 segundos con escenas cronometradas, voz en off y música.",
    icono: Clapperboard,
    requiereProducto: true,
  },
  {
    id: "BUYER_PERSONA",
    etiqueta: "Buyer persona",
    descripcion: "Perfil del comprador ideal con dolores, objeciones y detonantes de compra.",
    icono: UserRound,
    requiereProducto: true,
  },
  {
    id: "STORE_NAMES",
    etiqueta: "Nombres de tienda",
    descripcion: "Ideas de marca con dominio disponible y justificación estratégica.",
    icono: Store,
    requiereProducto: false,
  },
  {
    id: "PRODUCT_ANALYSIS",
    etiqueta: "Análisis de producto",
    descripcion: "Veredicto con fortalezas, riesgos, precio óptimo y presupuesto de entrada.",
    icono: Brain,
    requiereProducto: true,
  },
];


/** Extrae la URL de la imagen generada (si el proveedor devolvió una). */
function extraerImagen(datos: unknown): string | null {
  const objeto = datos as Record<string, unknown>;
  const imagen = objeto.imageUrl ?? objeto.image ?? (objeto as { url?: string }).url;
  return typeof imagen === "string" && imagen.startsWith("http") ? imagen : null;
}

/**
 * AI Studio completo.
 *
 * Genera copies, guiones, buyer personas, nombres de tienda y análisis de
 * producto con el proveedor configurado (OpenAI o Gemini) y cae al motor de
 * plantillas local cuando no hay claves, de modo que la herramienta siempre
 * devuelve contenido real y guardado en el historial.
 */
export function AiStudio({ productos, historial, proveedor, uso }: AiStudioProps) {
  const [herramienta, setHerramienta] = useState<AiToolType>("AD_COPY");
  const [productoId, setProductoId] = useState(productos[0]?.id ?? "");
  const [nicho, setNicho] = useState(productos[0]?.nicheTag ?? "e-commerce de bienestar");
  const [plataforma, setPlataforma] = useState("TIKTOK");
  const [tono, setTono] = useState("directo");
  const [duracion, setDuracion] = useState<"15" | "30" | "60">("30");
  const [estilo, setEstilo] = useState("moderno");
  const [idioma, setIdioma] = useState("español");

  const [generando, setGenerando] = useState(false);
  const [resultado, setResultado] = useState<{ datos: unknown; proveedor: string; modelo: string; latencia: number } | null>(null);
  const [copiado, setCopiado] = useState(false);

  const definicion = HERRAMIENTAS.find((item) => item.id === herramienta)!;
  const productoSeleccionado = productos.find((producto) => producto.id === productoId) ?? null;

  /** Lanza la generación contra la API del AI Studio. */
  async function generar() {
    if (definicion.requiereProducto && !productoId) {
      toast.error("Selecciona un producto de referencia");
      return;
    }

    setGenerando(true);
    setResultado(null);
    setCopiado(false);
    try {
      const opciones: Record<string, unknown> = {};
      if (herramienta === "AD_COPY") {
        opciones.plataforma = plataforma;
        opciones.tono = tono;
        opciones.cantidad = 5;
      }
      if (herramienta === "VIDEO_SCRIPT") {
        opciones.duracion = Number(duracion);
        opciones.plataforma = plataforma;
        opciones.estilo = estilo;
      }
      if (herramienta === "STORE_NAMES") {
        opciones.nicho = nicho;
        opciones.estilo = estilo;
        opciones.idioma = idioma;
        opciones.cantidad = 8;
      }
      if (herramienta === "BUYER_PERSONA") {
        opciones.pais = "España";
        opciones.genero = "mixto";
      }

      const respuesta = await fetch("/api/ai", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tool: herramienta,
          productId: definicion.requiereProducto ? productoId : undefined,
          options: opciones,
        }),
      });
      const datos = (await respuesta.json()) as {
        data?: unknown;
        provider?: string;
        model?: string;
        latencyMs?: number;
        error?: string;
      };

      if (respuesta.status === 402) {
        toast.error(datos.error ?? "Has agotado las generaciones de IA de tu plan por hoy");
        return;
      }
      if (!respuesta.ok || datos.data === undefined) throw new Error(datos.error ?? "La generación ha fallado");

      setResultado({
        datos: datos.data,
        proveedor: datos.provider ?? "SIMULATED",
        modelo: datos.model ?? "plantilla-interna-v1",
        latencia: datos.latencyMs ?? 0,
      });
      toast.success(`Contenido generado con ${datos.provider === "SIMULATED" ? "el motor local" : datos.model}`);
    } catch (error) {
      toast.error((error as Error).message || "No se pudo generar el contenido");
    } finally {
      setGenerando(false);
    }
  }

  /** Copia el resultado completo en formato JSON legible. */
  async function copiarResultado() {
    if (!resultado) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(resultado.datos, null, 2));
      setCopiado(true);
      toast.success("Resultado copiado al portapapeles");
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      toast.error("No se pudo copiar el resultado");
    }
  }

  const imagenGenerada = resultado ? extraerImagen(resultado.datos) : null;

  return (
    <div className="grid gap-6 xl:grid-cols-3">
      {/* --- Panel de configuración --- */}
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Wand2 className="size-4 text-violet-400" />
              Configuración
            </CardTitle>
            <CardDescription>
              {proveedor.configurado
                ? `Proveedor activo: ${proveedor.activo} (${proveedor.modelo})`
                : "Sin claves de API: se usa el motor de plantillas local, 100 % funcional."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Herramienta */}
            <div className="space-y-2">
              <Label>Herramienta</Label>
              <div className="grid gap-2">
                {HERRAMIENTAS.map((item) => {
                  const Icono = item.icono;
                  const activo = herramienta === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setHerramienta(item.id)}
                      className={cn(
                        "flex items-start gap-3 rounded-xl border p-3 text-left transition-colors",
                        activo
                          ? "border-indigo-500/60 bg-indigo-500/10"
                          : "border-border/60 bg-surface/40 hover:border-indigo-500/40",
                      )}
                    >
                      <Icono className={cn("mt-0.5 size-4 shrink-0", activo ? "text-indigo-300" : "text-muted-foreground")} />
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-slate-100">{item.etiqueta}</span>
                        <span className="mt-0.5 block text-xs text-muted-foreground">{item.descripcion}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <Separator />

            {/* Producto de referencia */}
            {definicion.requiereProducto && (
              <div className="space-y-2">
                <Label>Producto de referencia</Label>
                <Select value={productoId} onValueChange={setProductoId}>
                  <SelectTrigger aria-label="Producto de referencia">
                    <SelectValue placeholder="Selecciona un producto" />
                  </SelectTrigger>
                  <SelectContent>
                    {productos.map((producto) => (
                      <SelectItem key={producto.id} value={producto.id}>
                        {producto.title.slice(0, 52)}
                        {producto.title.length > 52 ? "…" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {productoSeleccionado && (
                  <p className="text-xs text-muted-foreground">
                    {productoSeleccionado.category} · {productoSeleccionado.nicheTag}
                  </p>
                )}
              </div>
            )}

            {/* Nicho para nombres de tienda */}
            {herramienta === "STORE_NAMES" && (
              <div className="space-y-2">
                <Label htmlFor="nicho-ia">Nicho o temática</Label>
                <Input
                  id="nicho-ia"
                  value={nicho}
                  onChange={(evento) => setNicho(evento.target.value)}
                  placeholder="Ej. cuidado de mascotas, belleza natural…"
                />
              </div>
            )}

            {/* Parámetros por herramienta */}
            {herramienta === "AD_COPY" && (
              <>
                <div className="space-y-2">
                  <Label>Plataforma</Label>
                  <Select value={plataforma} onValueChange={setPlataforma}>
                    <SelectTrigger aria-label="Plataforma publicitaria">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="TIKTOK">TikTok</SelectItem>
                      <SelectItem value="FACEBOOK">Facebook</SelectItem>
                      <SelectItem value="INSTAGRAM">Instagram</SelectItem>
                      <SelectItem value="YOUTUBE">YouTube</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Tono</Label>
                  <Select value={tono} onValueChange={setTono}>
                    <SelectTrigger aria-label="Tono de comunicación">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="directo">Directo y honesto</SelectItem>
                      <SelectItem value="emocional">Emocional</SelectItem>
                      <SelectItem value="humor">Con humor</SelectItem>
                      <SelectItem value="lujo">Premium</SelectItem>
                      <SelectItem value="urgencia">Urgencia y oferta</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}

            {(herramienta === "VIDEO_SCRIPT" || herramienta === "AD_COPY") && (
              <div className="space-y-2">
                <Label>Estilo creativo</Label>
                <Select value={estilo} onValueChange={setEstilo}>
                  <SelectTrigger aria-label="Estilo creativo">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="moderno">Moderno y minimalista</SelectItem>
                    <SelectItem value="casero">Casero y cercano (UGC)</SelectItem>
                    <SelectItem value="cine">Cinemático y premium</SelectItem>
                    <SelectItem value="dinamico">Dinámico con texto en pantalla</SelectItem>
                    <SelectItem value="testimonial">Testimonial de clientes</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {herramienta === "VIDEO_SCRIPT" && (
              <div className="space-y-2">
                <Label>Duración</Label>
                <Select value={duracion} onValueChange={(valor) => setDuracion(valor as "15" | "30" | "60")}>
                  <SelectTrigger aria-label="Duración del vídeo">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="15">15 segundos (Reels / Shorts)</SelectItem>
                    <SelectItem value="30">30 segundos (recomendado)</SelectItem>
                    <SelectItem value="60">60 segundos (narrado)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {herramienta === "STORE_NAMES" && (
              <div className="space-y-2">
                <Label>Idioma de los nombres</Label>
                <Select value={idioma} onValueChange={setIdioma}>
                  <SelectTrigger aria-label="Idioma de los nombres">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="español">Español</SelectItem>
                    <SelectItem value="inglés">Inglés</SelectItem>
                    <SelectItem value="bilingüe">Bilingüe</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Uso del plan */}
            <div className="rounded-xl border border-border/60 bg-surface/40 p-3 text-xs text-muted-foreground">
              <p className="font-medium text-slate-200">Uso de hoy</p>
              <p className="mt-0.5">
                {uso.usado} de {uso.limite === null ? "ilimitadas" : uso.limite} generaciones
                {uso.limite !== null && ` · quedan ${Math.max(0, uso.limite - uso.usado)}`}
              </p>
            </div>

            <Button onClick={generar} loading={generando} className="w-full gap-2">
              {!generando && <Sparkles className="size-4" />}
              Generar con IA
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Lightbulb className="size-4 text-amber-400" />
              Cómo aprovechar el AI Studio
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-xs text-muted-foreground">
            <p>· Usa el copy ganador de un producto dorado como base y testea 3 ángulos distintos.</p>
            <p>· El guion de 30 s funciona mejor con TikTok y Reels; el de 60 s, con YouTube Shorts narrados.</p>
            <p>· Genera la buyer persona antes de escribir el copy: define el dolor que ataca el anuncio.</p>
          </CardContent>
        </Card>
      </div>

      {/* --- Resultado e historial --- */}
      <div className="space-y-6 xl:col-span-2">
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Wand2 className="size-4 text-indigo-400" />
                {definicion.etiqueta}
              </CardTitle>
              <CardDescription>
                {resultado
                  ? `Generado con ${resultado.proveedor === "SIMULATED" ? "el motor local" : resultado.modelo} en ${resultado.latencia} ms`
                  : definicion.descripcion}
              </CardDescription>
            </div>
            {resultado && (
              <Button variant="outline" size="sm" onClick={copiarResultado} className="gap-1.5">
                {copiado ? <Check className="size-3.5 text-emerald-400" /> : <Copy className="size-3.5" />}
                {copiado ? "Copiado" : "Copiar JSON"}
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {!resultado ? (
              <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border/70 p-10 text-center">
                <GitBranchPlaceholder />
                <p className="text-sm font-medium text-slate-100">Sin generaciones todavía</p>
                <p className="max-w-md text-xs text-muted-foreground">
                  Configura los parámetros de la izquierda y pulsa «Generar con IA». El resultado aparecerá aquí y
                  quedará guardado en tu historial.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {imagenGenerada && (
                  <div className="overflow-hidden rounded-xl border border-border/60">
                    {/* Imagen generada por el modelo (cuando el proveedor la devuelve) */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={imagenGenerada} alt="Recurso generado por IA" className="w-full object-cover" />
                    <p className="flex items-center gap-1.5 border-t border-border/60 p-2 text-[11px] text-muted-foreground">
                      <ImageIcon className="size-3" />
                      Recurso visual generado por el modelo
                    </p>
                  </div>
                )}
                <ResultadoView datos={resultado.datos} herramienta={herramienta} />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Historial de generaciones */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <History className="size-4 text-violet-400" />
              Historial de generaciones
            </CardTitle>
            <CardDescription>Últimas {historial.length} generaciones guardadas en tu cuenta</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {historial.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border/70 p-6 text-center text-sm text-muted-foreground">
                Tu historial está vacío. Cada generación queda registrada con su proveedor, modelo y consumo.
              </p>
            ) : (
              historial.map((generacion) => (
                <div
                  key={generacion.id}
                  className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-border/60 bg-surface/40 p-3"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="violet">
                        {HERRAMIENTAS.find((item) => item.id === generacion.tool)?.etiqueta ?? generacion.tool}
                      </Badge>
                      <Badge variant="muted">{generacion.provider === "SIMULATED" ? "Motor local" : generacion.model}</Badge>
                      <span className="text-[11px] text-muted-foreground">
                        <RelativeTime value={generacion.createdAt} />
                      </span>
                    </div>
                    <p className="mt-1.5 line-clamp-2 text-sm text-slate-100">{generacion.preview}</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {generacion.productTitle ? `Sobre ${generacion.productTitle} · ` : ""}
                      {generacion.tokensUsed} tokens · {generacion.latencyMs} ms
                    </p>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/** Marcador visual del panel de resultado vacío. */
function GitBranchPlaceholder() {
  return (
    <span className="flex size-12 items-center justify-center rounded-full bg-gradient-to-br from-indigo-600/30 to-violet-600/20">
      <Sparkles className="size-5 text-indigo-300" />
    </span>
  );
}

/** Vista de resultados según la herramienta (renderizado tipado). */
function ResultadoView({ datos, herramienta }: { datos: unknown; herramienta: AiToolType }) {
  if (herramienta === "AD_COPY" && Array.isArray(datos)) {
    return (
      <div className="space-y-3">
        {datos.map((variante, indice) => {
          const copia = variante as Record<string, string>;
          return (
            <div key={indice} className="rounded-xl border border-border/60 bg-surface/40 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="default">Ángulo: {copia.angle}</Badge>
                <Badge variant="success">{copia.callToAction}</Badge>
              </div>
              <p className="mt-2 text-sm font-semibold text-slate-100">{copia.hook}</p>
              <p className="mt-1 text-sm text-muted-foreground">{copia.primaryText}</p>
              <Separator className="my-3" />
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Titular</p>
              <p className="text-sm text-slate-100">{copia.headline}</p>
              <p className="text-xs text-muted-foreground">{copia.description}</p>
            </div>
          );
        })}
      </div>
    );
  }

  if (herramienta === "VIDEO_SCRIPT" && datos && typeof datos === "object") {
    const guion = datos as {
      duration: number;
      concept: string;
      hook: string;
      cta: string;
      hashtags: string[];
      scenes: Array<{ timecode: string; visual: string; voiceover: string; onScreenText: string; sound: string }>;
    };
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="gradient">{guion.duration} s</Badge>
          {guion.hashtags.map((etiqueta) => (
            <Badge key={etiqueta} variant="muted">
              {etiqueta}
            </Badge>
          ))}
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-100">{guion.concept}</p>
          <p className="text-xs text-muted-foreground">{guion.hook}</p>
        </div>
        <div className="space-y-2">
          {guion.scenes.map((escena) => (
            <div key={escena.timecode} className="rounded-xl border border-border/60 bg-surface/40 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-xs text-indigo-300">{escena.timecode}</span>
                <span className="text-[11px] text-muted-foreground">{escena.sound}</span>
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">{escena.visual}</p>
              <p className="mt-1.5 text-sm text-slate-100">🎙️ {escena.voiceover}</p>
              <p className="mt-1 text-xs font-medium text-violet-300">En pantalla: {escena.onScreenText}</p>
            </div>
          ))}
        </div>
        <p className="rounded-lg border border-indigo-500/25 bg-indigo-500/5 p-3 text-sm text-slate-100">
          <span className="font-medium">CTA: </span>
          {guion.cta}
        </p>
      </div>
    );
  }

  if (herramienta === "BUYER_PERSONA" && datos && typeof datos === "object") {
    const persona = datos as {
      name: string;
      ageRange: string;
      gender: string;
      location: string;
      income: string;
      occupation: string;
      painPoints: string[];
      desires: string[];
      objections: string[];
      buyingTriggers: string[];
      channels: string[];
      quote: string;
    };
    const bloques: Array<[string, string[]]> = [
      ["Dolores", persona.painPoints],
      ["Deseos", persona.desires],
      ["Objeciones", persona.objections],
      ["Detonantes", persona.buyingTriggers],
    ];
    return (
      <div className="space-y-4">
        <div>
          <p className="text-base font-semibold text-slate-100">{persona.name}</p>
          <p className="text-xs text-muted-foreground">
            {persona.ageRange} años · {persona.gender} · {persona.location} · {persona.income}
          </p>
          <p className="text-xs text-muted-foreground">{persona.occupation}</p>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {bloques.map(([titulo, items]) => (
            <div key={titulo} className="rounded-xl border border-border/60 bg-surface/40 p-3">
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-indigo-300">{titulo}</p>
              <ul className="space-y-1 text-sm text-muted-foreground">
                {items.map((item) => (
                  <li key={item}>· {item}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {persona.channels.map((canal) => (
            <Badge key={canal} variant="outline">
              {canal}
            </Badge>
          ))}
        </div>
        <blockquote className="rounded-xl border-l-2 border-indigo-500 bg-indigo-500/5 p-3 text-sm italic text-slate-200">
          “{persona.quote}”
        </blockquote>
      </div>
    );
  }

  if (herramienta === "STORE_NAMES" && Array.isArray(datos)) {
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        {datos.map((idea, indice) => {
          const nombre = idea as { name: string; domain: string; rationale: string; available?: boolean };
          return (
            <div key={indice} className="rounded-xl border border-border/60 bg-surface/40 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold text-slate-100">{nombre.name}</p>
                <Badge variant={nombre.available ? "success" : "muted"}>
                  {nombre.available ? "Disponible" : "Revisar"}
                </Badge>
              </div>
              <p className="text-sm text-indigo-400">{nombre.domain}</p>
              <p className="mt-1 text-xs text-muted-foreground">{nombre.rationale}</p>
            </div>
          );
        })}
      </div>
    );
  }

  if (herramienta === "PRODUCT_ANALYSIS" && datos && typeof datos === "object") {
    const analisis = datos as {
      resumen: string;
      fortalezas: string[];
      riesgos: string[];
      recomendacion: string;
      precioOptimo: string;
      canalesRecomendados: string[];
    };
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">{analisis.resumen}</p>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-3">
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-emerald-300">Fortalezas</p>
            <ul className="space-y-1 text-sm text-muted-foreground">
              {analisis.fortalezas.map((item) => (
                <li key={item}>· {item}</li>
              ))}
            </ul>
          </div>
          <div className="rounded-xl border border-rose-500/25 bg-rose-500/5 p-3">
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-rose-300">Riesgos</p>
            <ul className="space-y-1 text-sm text-muted-foreground">
              {analisis.riesgos.map((item) => (
                <li key={item}>· {item}</li>
              ))}
            </ul>
          </div>
        </div>
        <div className="rounded-xl border border-indigo-500/25 bg-indigo-500/5 p-3">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-indigo-300">Recomendación</p>
          <p className="text-sm text-slate-100">{analisis.recomendacion}</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-border/60 bg-surface/40 p-3">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Precio óptimo</p>
            <p className="text-sm text-slate-100">{analisis.precioOptimo}</p>
          </div>
          <div className="rounded-lg border border-border/60 bg-surface/40 p-3">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Canales</p>
            <p className="text-sm text-slate-100">{analisis.canalesRecomendados.join(" · ")}</p>
          </div>
        </div>
      </div>
    );
  }

  // Respaldo genérico: volcado legible del JSON (nunca una pantalla vacía).
  return (
    <Textarea
      readOnly
      value={typeof datos === "string" ? datos : JSON.stringify(datos, null, 2)}
      className="min-h-[280px] font-mono text-xs"
    />
  );
}
