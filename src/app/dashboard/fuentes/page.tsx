import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  Bug,
  CheckCircle2,
  Clock,
  Database,
  Globe2,
  KeyRound,
  ShieldCheck,
  Store,
  Timer,
  TrendingUp,
} from "lucide-react";
import { auth } from "@/auth";
import { getEstadoIngesta, listCambiosIngesta, listTendenciasDelDia, listTiendasEnVivo } from "@/lib/dal";
import { DIAS_FRESCURA, resumenSaludDelDato } from "@/lib/mantenimientoConfianza";
import { PageHeading } from "@/components/domain/page-heading";
import { StatCard } from "@/components/domain/stat-card";
import { FuentesEnVivo } from "@/components/domain/fuentes-en-vivo";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { cn, formatNumber, formatRelativeTime } from "@/lib/utils";

export const metadata = {
  title: "Fuentes en vivo",
  description:
    "Lee catálogos reales de Shopify y las tendencias del día de Google Trends sin ninguna clave de API.",
};

/** Fuentes gratuitas y qué comprueba cada una (sin claves). */
const FUENTES_SIN_CLAVE = [
  {
    nombre: "Catálogo público de Shopify",
    detalle: "Productos, precios y disponibilidad de cualquier tienda Shopify (/products.json).",
    estado: "Activa",
  },
  {
    nombre: "Google Trends RSS",
    detalle: "Términos que más crecen hoy en España, publicados por Google.",
    estado: "Activa",
  },
  {
    nombre: "YouTube Data API",
    detalle: "Vistas reales de vídeos del nicho (necesita clave gratuita, 10.000 unidades/día).",
    estado: "Con clave",
  },
  {
    nombre: "Meta Ad Library",
    detalle: "Anuncios activos de Facebook e Instagram (necesita token gratuito).",
    estado: "Con clave",
  },
];

/** Módulo 9 · Ingesta real sin claves: tiendas, tendencias y qué se ha medido. */
export default async function FuentesPage() {
  const sesion = await auth();
  if (!sesion?.user?.id) return null;

  const [estado, tiendas, cambios, tendencias, salud] = await Promise.all([
    getEstadoIngesta(),
    listTiendasEnVivo(20),
    listCambiosIngesta(12),
    listTendenciasDelDia("ES", 20),
    resumenSaludDelDato(),
  ]);

  // Una sola línea: nada de otra pantalla para vigilar el dato.
  const conMedicion = salud.total - salud.sinDatos - salud.estimados;
  const saludPerfecta = salud.caducados.length === 0 && salud.contradictorios.length === 0;

  const conCoincidencia = tendencias.filter((tendencia) => tendencia.productos.length > 0);
  // «hace 8 segundos» no cabe en la tarjeta: se resume.
  const ultimaLectura = estado.ultimaMedicion
    ? Date.now() - new Date(estado.ultimaMedicion).getTime() < 60_000
      ? "ahora mismo"
      : formatRelativeTime(estado.ultimaMedicion)
    : "—";

  return (
    <>
      <PageHeading
        title="Fuentes en vivo"
        description="Todo lo que ves aquí se ha leído de una fuente pública real, con su fecha. Si una fuente no responde, se dice: nunca se rellena con estimaciones."
        actions={
          <Badge variant="outline" className="gap-1.5 border-emerald-500/40 text-emerald-300">
            <KeyRound className="size-3.5" />
            0 claves necesarias
          </Badge>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Tiendas leídas en vivo"
          value={formatNumber(estado.tiendas)}
          icon={Store}
          hint="Catálogo público de Shopify"
        />
        <StatCard
          label="Productos reales"
          value={formatNumber(estado.productosEnTienda)}
          icon={Database}
          accent="violet"
          hint={`${formatNumber(estado.emparejados)} cruzados con tu catálogo`}
        />
        <StatCard
          label="Términos en tendencia"
          value={formatNumber(estado.terminos)}
          icon={TrendingUp}
          accent="emerald"
          hint="Acumulados de Google Trends RSS"
        />
        <StatCard
          label="Última medición"
          value={ultimaLectura}
          icon={Timer}
          hint={estado.verificados > 0 ? `${estado.verificados} productos verificados` : "Sin verificados todavía"}
        />
      </div>

      {/* Línea de salud del dato: resume lo que hay que corregir y enlaza al
          formulario que ya existe. Sin menús ni páginas nuevas. */}
      <div
        className={cn(
          "mb-6 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border px-4 py-2.5 text-sm",
          saludPerfecta
            ? "border-emerald-500/30 bg-emerald-500/5"
            : "border-amber-500/30 bg-amber-500/5",
        )}
      >
        {saludPerfecta ? (
          <ShieldCheck className="size-4 shrink-0 text-emerald-400" />
        ) : (
          <AlertTriangle className="size-4 shrink-0 text-amber-400" />
        )}
        <span className="font-medium">
          {saludPerfecta ? "Datos al día" : "Hay datos que hay que refrescar"}
        </span>
        <span className="text-muted-foreground">
          {salud.verificados} de {salud.total} productos verificados · {conMedicion} con medición real
          {salud.caducados.length > 0 && ` · ${salud.caducados.length} con evidencia de más de ${DIAS_FRESCURA} días`}
          {salud.contradictorios.length > 0 && ` · ${salud.contradictorios.length} con fuentes que se contradicen`}
        </span>
        {!saludPerfecta && (
          <Link href="#actualizar" className="ml-auto text-xs font-medium text-indigo-300 hover:underline">
            Cómo se refresca
          </Link>
        )}
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <div id="actualizar" className="scroll-mt-24">
          <FuentesEnVivo geoInicial="ES" />
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Globe2 className="size-4 text-indigo-400" />
              Fuentes disponibles
            </CardTitle>
            <CardDescription>
              Las dos primeras funcionan ya, sin configurar nada. Las de clave son opcionales: sirven para
              añadir más evidencia, nunca para que el dato exista.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {FUENTES_SIN_CLAVE.map((fuente) => (
              <div key={fuente.nombre} className="flex items-start justify-between gap-3 rounded-lg border border-border/60 p-3">
                <div>
                  <p className="text-sm font-medium">{fuente.nombre}</p>
                  <p className="text-xs text-muted-foreground">{fuente.detalle}</p>
                </div>
                <Badge
                  variant="outline"
                  className={
                    fuente.estado === "Activa"
                      ? "shrink-0 border-emerald-500/40 text-emerald-300"
                      : "shrink-0 border-border text-muted-foreground"
                  }
                >
                  {fuente.estado}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Tiendas leídas */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Store className="size-4 text-indigo-400" />
              Tiendas en vivo
            </CardTitle>
            <CardDescription>Catálogos leídos de verdad, con la fecha de la última lectura.</CardDescription>
          </CardHeader>
          <CardContent>
            {tiendas.length === 0 ? (
              <EmptyState
                icon={Store}
                title="Todavía no has leído ninguna tienda"
                description="Escribe el dominio de una tienda Shopify arriba y pulsa «Leer catálogo». Se guardarán sus productos con precio y disponibilidad reales."
              />
            ) : (
              <ul className="divide-y divide-border/60">
                {tiendas.map((tienda) => (
                  <li key={tienda.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{tienda.nombre}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {tienda.dominio} · {tienda.pais} · {tienda.nicho}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-medium">{formatNumber(tienda.productos)} productos</p>
                      <p className="text-xs text-muted-foreground">
                        {tienda.disponibles} a la venta ·{" "}
                        {tienda.ultimaLectura ? formatRelativeTime(tienda.ultimaLectura) : "sin fecha"}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Tendencias del día */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="size-4 text-emerald-400" />
              Tendencias de hoy
              {conCoincidencia.length > 0 && (
                <Badge variant="outline" className="border-emerald-500/40 text-emerald-300">
                  {conCoincidencia.length} casan con tu catálogo
                </Badge>
              )}
            </CardTitle>
            <CardDescription>
              Lo que Google publica como tendencia del día en España. Solo se marca un producto cuando el término
              aparece de verdad en su título.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {tendencias.length === 0 ? (
              <EmptyState
                icon={TrendingUp}
                title="Sin tendencias guardadas"
                description="Pulsa «Tendencias de hoy» para leer el RSS oficial de Google Trends. No hace falta ninguna clave."
              />
            ) : (
              <ul className="max-h-[420px] divide-y divide-border/60 overflow-y-auto pr-1">
                {tendencias.map((tendencia) => (
                  <li key={tendencia.id} className="py-2">
                    <div className="flex items-center justify-between gap-2">
                      <a
                        href={tendencia.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="truncate text-sm font-medium hover:text-indigo-300"
                      >
                        {tendencia.termino}
                      </a>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {tendencia.volumen} · #{tendencia.posicion}
                      </span>
                    </div>
                    {tendencia.productos.length > 0 && (
                      <p className="mt-0.5 truncate text-xs text-emerald-300">
                        <CheckCircle2 className="mr-1 inline size-3" />
                        {tendencia.productos.map((producto) => producto.titulo).join(" · ")}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Timeline de la ingesta */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="size-4 text-amber-400" />
              Cambios detectados en tiendas reales
            </CardTitle>
            <CardDescription>
              Cada alta, cambio de precio o agotado sale de comparar el catálogo de ahora con el de la lectura
              anterior. Si no hay dos lecturas, no hay cambio que anunciar.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {cambios.length === 0 ? (
              <EmptyState
                icon={Clock}
                title="Sin cambios todavía"
                description="Hace falta leer la misma tienda dos veces para detectar altas, bajadas de precio o agotados."
              />
            ) : (
              <ul className="divide-y divide-border/60">
                {cambios.map((cambio) => (
                  <li key={cambio.id} className="flex items-start gap-3 py-2.5">
                    <Badge
                      variant="outline"
                      className={
                        cambio.type === "NEW_PRODUCT"
                          ? "border-emerald-500/40 text-emerald-300"
                          : cambio.type === "PRICE_CHANGE"
                            ? "border-sky-500/40 text-sky-300"
                            : "border-amber-500/40 text-amber-300"
                      }
                    >
                      {cambio.type === "NEW_PRODUCT" ? "Nuevo" : cambio.type === "PRICE_CHANGE" ? "Precio" : "Agotado"}
                    </Badge>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">{cambio.description}</p>
                      <p className="text-xs text-muted-foreground">
                        {cambio.storeName ?? "Tienda"} · {formatRelativeTime(cambio.detectedAt)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Bug className="size-4 text-muted-foreground" />
            Cómo comprobarlo tú mismo
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            · <strong>Productos de una tienda:</strong> abre{" "}
            <code className="rounded bg-surface px-1">https://mitienda.com/products.json?limit=5</code> en el
            navegador. Verás exactamente el mismo JSON que lee el sistema.
          </p>
          <p>
            · <strong>Términos del día:</strong>{" "}
            <Link href="https://trends.google.com/trending?geo=ES" target="_blank" className="text-indigo-300 hover:underline">
              trends.google.com/trending?geo=ES
            </Link>
            . Los títulos coinciden con los guardados.
          </p>
          <p>
            · <strong>Procedencia de cada cifra:</strong> en la ficha de cualquier producto, el sello de confianza
            indica la fuente, la fecha y si fue medida o estimada.
          </p>
        </CardContent>
      </Card>
    </>
  );
}
