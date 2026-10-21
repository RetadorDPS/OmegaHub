"use client";

import { useState } from "react";
import {
  Brain,
  Clapperboard,
  Copy,
  Check,
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
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import type {
  AdCopyVariant,
  BuyerPersona,
  ProductDTO,
  StoreNameIdea,
  VideoScript,
} from "@/types";

/** Análisis estratégico devuelto por la herramienta PRODUCT_ANALYSIS. */
interface AnalisisProducto {
  resumen: string;
  fortalezas: string[];
  riesgos: string[];
  recomendacion: string;
  precioOptimo: string;
  canalesRecomendados: string[];
}

/** Respuesta estándar de la API del AI Studio. */
interface RespuestaAi {
  data: unknown;
  provider: string;
  model: string;
  latencyMs: number;
  providerActivo?: string;
  modeloActivo?: string;
  error?: string;
}

interface ProductAiStudioProps {
  product: ProductDTO;
}

const PLATAFORMAS = [
  { valor: "TIKTOK", etiqueta: "TikTok" },
  { valor: "FACEBOOK", etiqueta: "Facebook" },
  { valor: "INSTAGRAM", etiqueta: "Instagram" },
  { valor: "YOUTUBE", etiqueta: "YouTube" },
  { valor: "PINTEREST", etiqueta: "Pinterest" },
];

const TONOS = [
  { valor: "directo", etiqueta: "Directo y honesto" },
  { valor: "emocional", etiqueta: "Emocional" },
  { valor: "humor", etiqueta: "Con humor" },
  { valor: "lujo", etiqueta: "Premium / lujo" },
  { valor: "urgencia", etiqueta: "Urgencia y oferta" },
];

/**
 * AI Studio incrustado en la ficha de producto.
 *
 * Agrupa las cinco herramientas de generación (copies, guion de vídeo, buyer
 * persona, nombres de tienda y análisis estratégico) sobre el producto abierto,
 * con control de parámetros y trazabilidad del proveedor utilizado.
 */
export function ProductAiStudio({ product }: ProductAiStudioProps) {
  const [plataforma, setPlataforma] = useState("TIKTOK");
  const [tono, setTono] = useState("directo");
  const [duracion, setDuracion] = useState<"15" | "30" | "60">("30");
  const [cargando, setCargando] = useState<string | null>(null);

  const [copies, setCopies] = useState<RespuestaAi | null>(null);
  const [guion, setGuion] = useState<RespuestaAi | null>(null);
  const [persona, setPersona] = useState<RespuestaAi | null>(null);
  const [nombres, setNombres] = useState<RespuestaAi | null>(null);
  const [analisis, setAnalisis] = useState<RespuestaAi | null>(null);

  /** Llama a la API del AI Studio y guarda el resultado en la pestaña indicada. */
  async function generar(herramienta: string) {
    setCargando(herramienta);
    try {
      const opciones: Record<string, unknown> = { plataforma };
      if (herramienta === "AD_COPY") {
        opciones.tono = tono;
        opciones.cantidad = 5;
      }
      if (herramienta === "VIDEO_SCRIPT") opciones.duracion = Number(duracion);
      if (herramienta === "BUYER_PERSONA") opciones.pais = product.countryAvailability[0] ?? "ES";

      const respuesta = await fetch("/api/ai", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tool: herramienta, productId: product.id, options: opciones }),
      });
      const datos = (await respuesta.json()) as RespuestaAi;

      if (respuesta.status === 402) {
        toast.error(datos.error ?? "Has agotado las generaciones de tu plan por hoy");
        return;
      }
      if (!respuesta.ok) throw new Error(datos.error ?? "La generación ha fallado");

      if (herramienta === "AD_COPY") setCopies(datos);
      if (herramienta === "VIDEO_SCRIPT") setGuion(datos);
      if (herramienta === "BUYER_PERSONA") setPersona(datos);
      if (herramienta === "STORE_NAMES") setNombres(datos);
      if (herramienta === "PRODUCT_ANALYSIS") setAnalisis(datos);
      toast.success(`Contenido generado con ${datos.provider === "SIMULATED" ? "el motor local" : datos.model}`);
    } catch (error) {
      toast.error((error as Error).message || "No se pudo generar el contenido");
    } finally {
      setCargando(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* Barra de parámetros comunes */}
      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Wand2 className="size-4 text-violet-400" />
              AI Studio · {product.title}
            </CardTitle>
            <CardDescription>
              Genera creatividades listas para publicar a partir de los datos reales del producto.
            </CardDescription>
          </div>
          <Badge variant="violet" className="w-fit gap-1">
            <Sparkles className="size-3" />
            Nicho {product.nicheTag}
          </Badge>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="ai-plataforma">Plataforma</Label>
            <Select value={plataforma} onValueChange={setPlataforma}>
              <SelectTrigger id="ai-plataforma">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PLATAFORMAS.map((opcion) => (
                  <SelectItem key={opcion.valor} value={opcion.valor}>
                    {opcion.etiqueta}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="ai-tono">Tono de comunicación</Label>
            <Select value={tono} onValueChange={setTono}>
              <SelectTrigger id="ai-tono">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TONOS.map((opcion) => (
                  <SelectItem key={opcion.valor} value={opcion.valor}>
                    {opcion.etiqueta}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="ai-duracion">Duración del vídeo</Label>
            <Select value={duracion} onValueChange={(valor) => setDuracion(valor as "15" | "30" | "60")}>
              <SelectTrigger id="ai-duracion">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="15">15 segundos (Reels / Shorts)</SelectItem>
                <SelectItem value="30">30 segundos (recomendado)</SelectItem>
                <SelectItem value="60">60 segundos (narrado)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="copies">
        <TabsList className="flex-wrap">
          <TabsTrigger value="copies" className="gap-1.5">
            <MessagesSquare className="size-3.5" />
            Copies
          </TabsTrigger>
          <TabsTrigger value="guion" className="gap-1.5">
            <Clapperboard className="size-3.5" />
            Guion de vídeo
          </TabsTrigger>
          <TabsTrigger value="persona" className="gap-1.5">
            <UserRound className="size-3.5" />
            Buyer persona
          </TabsTrigger>
          <TabsTrigger value="tiendas" className="gap-1.5">
            <Store className="size-3.5" />
            Nombres de tienda
          </TabsTrigger>
          <TabsTrigger value="analisis" className="gap-1.5">
            <Brain className="size-3.5" />
            Análisis estratégico
          </TabsTrigger>
        </TabsList>

        {/* --- Copies publicitarios --- */}
        <TabsContent value="copies" className="space-y-4">
          <BotonGenerar
            cargando={cargando === "AD_COPY"}
            etiqueta="Generar 5 variantes de copy"
            icono={<MessagesSquare className="size-4" />}
            onClick={() => generar("AD_COPY")}
          />
          {copies ? (
            <div className="grid gap-4 lg:grid-cols-2">
              {(copies.data as AdCopyVariant[]).map((variante) => (
                <TarjetaCopy key={variante.id} variante={variante} plataforma={plataforma} meta={copies} />
              ))}
            </div>
          ) : (
            <Placeholder texto="Genera copies con cinco ángulos distintos (dolor, prueba social, urgencia, novedad y ahorro) y su llamada a la acción." />
          )}
        </TabsContent>

        {/* --- Guion de vídeo --- */}
        <TabsContent value="guion" className="space-y-4">
          <BotonGenerar
            cargando={cargando === "VIDEO_SCRIPT"}
            etiqueta={`Generar guion de ${duracion} segundos`}
            icono={<Clapperboard className="size-4" />}
            onClick={() => generar("VIDEO_SCRIPT")}
          />
          {guion ? (
            <GuionVideo guion={guion.data as VideoScript} meta={guion} />
          ) : (
            <Placeholder texto="Guion escena por escena con planos, voz en off, texto en pantalla y música sugerida." />
          )}
        </TabsContent>

        {/* --- Buyer persona --- */}
        <TabsContent value="persona" className="space-y-4">
          <BotonGenerar
            cargando={cargando === "BUYER_PERSONA"}
            etiqueta="Generar buyer persona"
            icono={<UserRound className="size-4" />}
            onClick={() => generar("BUYER_PERSONA")}
          />
          {persona ? (
            <BuyerPersonaCard persona={persona.data as BuyerPersona} meta={persona} />
          ) : (
            <Placeholder texto="Perfil completo del comprador: dolores, deseos, objeciones, detonantes de compra y canales donde encontrarlo." />
          )}
        </TabsContent>

        {/* --- Nombres de tienda --- */}
        <TabsContent value="tiendas" className="space-y-4">
          <BotonGenerar
            cargando={cargando === "STORE_NAMES"}
            etiqueta="Proponer nombres y dominios"
            icono={<Store className="size-4" />}
            onClick={() => generar("STORE_NAMES")}
          />
          {nombres ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {(nombres.data as StoreNameIdea[]).map((idea) => (
                <Card key={idea.name}>
                  <CardContent className="flex items-start justify-between gap-3 p-4">
                    <div>
                      <p className="font-semibold text-slate-100">{idea.name}</p>
                      <p className="text-sm text-indigo-400">{idea.domain}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{idea.rationale}</p>
                    </div>
                    <Badge variant={idea.available ? "success" : "muted"}>
                      {idea.available ? "Disponible" : "Revisar"}
                    </Badge>
                  </CardContent>
                </Card>
              ))}
              <MetaGeneracion meta={nombres} />
            </div>
          ) : (
            <Placeholder texto="Ideas de marca con dominio sugerido para el nicho del producto." />
          )}
        </TabsContent>

        {/* --- Análisis estratégico --- */}
        <TabsContent value="analisis" className="space-y-4">
          <BotonGenerar
            cargando={cargando === "PRODUCT_ANALYSIS"}
            etiqueta="Analizar viabilidad del producto"
            icono={<Brain className="size-4" />}
            onClick={() => generar("PRODUCT_ANALYSIS")}
          />
          {analisis ? (
            <AnalisisCard analisis={analisis.data as AnalisisProducto} meta={analisis} />
          ) : (
            <Placeholder texto="Veredicto con fortalezas, riesgos, precio óptimo y presupuesto de entrada recomendado." />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ---------------------------------------------------------------------------
//  Piezas internas
// ---------------------------------------------------------------------------

/** Botón principal de generación con estado de carga. */
function BotonGenerar({
  cargando,
  etiqueta,
  icono,
  onClick,
}: {
  cargando: boolean;
  etiqueta: string;
  icono: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <Button onClick={onClick} loading={cargando} className="w-full sm:w-auto">
      {!cargando && icono}
      {etiqueta}
    </Button>
  );
}

/** Aviso mostrado antes de generar cada herramienta. */
function Placeholder({ texto }: { texto: string }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-dashed border-border/70 bg-surface/40 p-4 text-sm text-muted-foreground">
      <Lightbulb className="mt-0.5 size-4 shrink-0 text-amber-400" />
      <p>{texto}</p>
    </div>
  );
}

/** Pie con el proveedor, el modelo y la latencia de la generación. */
function MetaGeneracion({ meta }: { meta: RespuestaAi }) {
  return (
    <p className="col-span-full text-xs text-muted-foreground">
      Generado con {meta.provider === "SIMULATED" ? "el motor de plantillas local" : meta.model} ·{" "}
      {meta.latencyMs} ms
    </p>
  );
}

/** Tarjeta de una variante de copy con copiado al portapapeles. */
function TarjetaCopy({
  variante,
  plataforma,
  meta,
}: {
  variante: AdCopyVariant;
  plataforma: string;
  meta: RespuestaAi;
}) {
  const [copiado, setCopiado] = useState(false);

  async function copiar() {
    const texto = `${variante.hook}\n\n${variante.primaryText}\n\nTitular: ${variante.headline}\nCTA: ${variante.callToAction}`;
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      toast.success("Copy copiado al portapapeles");
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      toast.error("No se pudo copiar el texto");
    }
  }

  return (
    <Card className="flex flex-col">
      <CardHeader className="gap-2">
        <div className="flex items-center justify-between gap-2">
          <Badge variant="default">Ángulo: {variante.angle}</Badge>
          <Badge variant="outline">{plataforma}</Badge>
        </div>
        <CardTitle className="text-base leading-snug text-slate-100">{variante.hook}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-3 text-sm">
        <p className="text-muted-foreground">{variante.primaryText}</p>
        <Separator />
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Titular</p>
          <p className="text-slate-100">{variante.headline}</p>
          <p className="text-xs text-muted-foreground">{variante.description}</p>
        </div>
        <div className="mt-auto flex items-center justify-between gap-2">
          <Badge variant="success">{variante.callToAction}</Badge>
          <Button size="sm" variant="ghost" onClick={copiar} className="gap-1.5">
            {copiado ? <Check className="size-3.5 text-emerald-400" /> : <Copy className="size-3.5" />}
            {copiado ? "Copiado" : "Copiar"}
          </Button>
        </div>
      </CardContent>
      <div className="border-t border-border/60 px-6 py-3 text-xs text-muted-foreground">
        {meta.provider === "SIMULATED" ? "Motor local" : meta.model} · {meta.latencyMs} ms
      </div>
    </Card>
  );
}

/** Guion de vídeo con tabla de escenas y hashtags. */
function GuionVideo({ guion, meta }: { guion: VideoScript; meta: RespuestaAi }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="gradient">{guion.duration} s</Badge>
          <Badge variant="outline">{guion.platform}</Badge>
        </div>
        <CardTitle className="text-base">{guion.concept}</CardTitle>
        <CardDescription>{guion.hook}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="overflow-x-auto">
          <Table className="min-w-[680px]">
            <TableHeader>
              <TableRow>
                <TableHead className="w-24">Minuto</TableHead>
                <TableHead>Plano</TableHead>
                <TableHead>Voz en off</TableHead>
                <TableHead>Texto en pantalla</TableHead>
                <TableHead className="w-36">Sonido</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {guion.scenes.map((escena) => (
                <TableRow key={escena.timecode}>
                  <TableCell className="font-mono text-xs text-indigo-300">{escena.timecode}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{escena.visual}</TableCell>
                  <TableCell className="text-sm text-slate-100">{escena.voiceover}</TableCell>
                  <TableCell className="text-sm">{escena.onScreenText}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{escena.sound}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {guion.hashtags.map((etiqueta) => (
            <Badge key={etiqueta} variant="muted">
              {etiqueta}
            </Badge>
          ))}
        </div>
        <p className="rounded-lg border border-border/60 bg-surface/50 p-3 text-sm text-muted-foreground">
          <span className="font-medium text-slate-100">Llamada a la acción: </span>
          {guion.cta}
        </p>
        <MetaGeneracion meta={meta} />
      </CardContent>
    </Card>
  );
}

/** Ficha del buyer persona generado. */
function BuyerPersonaCard({ persona, meta }: { persona: BuyerPersona; meta: RespuestaAi }) {
  const bloques: Array<{ titulo: string; items: string[] }> = [
    { titulo: "Dolores", items: persona.painPoints },
    { titulo: "Deseos", items: persona.desires },
    { titulo: "Objeciones", items: persona.objections },
    { titulo: "Detonantes de compra", items: persona.buyingTriggers },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <UserRound className="size-4 text-indigo-400" />
          {persona.name}
        </CardTitle>
        <CardDescription>
          {persona.ageRange} años · {persona.gender} · {persona.location}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-3">
          <DatoPersona etiqueta="Renta" valor={persona.income} />
          <DatoPersona etiqueta="Ocupación" valor={persona.occupation} />
          <DatoPersona etiqueta="Canales" valor={persona.channels.join(" · ")} />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {bloques.map((bloque) => (
            <div key={bloque.titulo} className="rounded-xl border border-border/60 bg-surface/40 p-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-indigo-300">
                {bloque.titulo}
              </p>
              <ul className="space-y-1.5 text-sm text-muted-foreground">
                {bloque.items.map((item) => (
                  <li key={item} className="flex gap-2">
                    <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-violet-500" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <blockquote className="rounded-xl border-l-2 border-indigo-500 bg-indigo-500/5 p-4 text-sm italic text-slate-200">
          “{persona.quote}”
        </blockquote>

        <MetaGeneracion meta={meta} />
      </CardContent>
    </Card>
  );
}

/** Dato corto de la ficha de persona. */
function DatoPersona({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-surface/40 p-3">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{etiqueta}</p>
      <p className="mt-1 text-sm text-slate-100">{valor}</p>
    </div>
  );
}

/** Veredicto estratégico del producto. */
function AnalisisCard({ analisis, meta }: { analisis: AnalisisProducto; meta: RespuestaAi }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Brain className="size-4 text-violet-400" />
          Veredicto del analista IA
        </CardTitle>
        <CardDescription>{analisis.resumen}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-4 md:grid-cols-2">
          <ListaAnalisis titulo="Fortalezas" items={analisis.fortalezas} tono="positivo" />
          <ListaAnalisis titulo="Riesgos" items={analisis.riesgos} tono="negativo" />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <DatoPersona etiqueta="Precio óptimo" valor={analisis.precioOptimo} />
          <DatoPersona etiqueta="Canales recomendados" valor={analisis.canalesRecomendados.join(" · ")} />
        </div>

        <div className="rounded-xl border border-indigo-500/30 bg-indigo-500/5 p-4">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-indigo-300">Recomendación</p>
          <p className="text-sm text-slate-100">{analisis.recomendacion}</p>
        </div>

        <MetaGeneracion meta={meta} />
      </CardContent>
    </Card>
  );
}

/** Lista de puntos con color según su naturaleza. */
function ListaAnalisis({
  titulo,
  items,
  tono,
}: {
  titulo: string;
  items: string[];
  tono: "positivo" | "negativo";
}) {
  return (
    <div
      className={cn(
        "rounded-xl border p-4",
        tono === "positivo" ? "border-emerald-500/25 bg-emerald-500/5" : "border-rose-500/25 bg-rose-500/5",
      )}
    >
      <p
        className={cn(
          "mb-2 text-xs font-semibold uppercase tracking-wide",
          tono === "positivo" ? "text-emerald-300" : "text-rose-300",
        )}
      >
        {titulo}
      </p>
      <ul className="space-y-1.5 text-sm text-muted-foreground">
        {items.map((item) => (
          <li key={item} className="flex gap-2">
            <span
              className={cn(
                "mt-1.5 size-1.5 shrink-0 rounded-full",
                tono === "positivo" ? "bg-emerald-400" : "bg-rose-400",
              )}
            />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
