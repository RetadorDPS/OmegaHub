import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowUpRight, Braces, Gauge, KeyRound, ShieldCheck, Sparkles } from "lucide-react";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { API_PLAN_LIMITS, CLAVES_POR_PLAN, planConApi } from "@/lib/apiKeys";
import { PLANS } from "@/lib/constants";
import { PageHeading } from "@/components/domain/page-heading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ApiKeysPanel } from "./api-keys-panel";

/**
 * Panel de la API pública (plan Business o superior).
 *
 * · Gestión de claves (crear, copiar, revocar) en `/api/api-keys`.
 * · Documentación viva de los endpoints, autenticación, cuotas y errores.
 * · Enlace a OpenAPI para generar clientes o importar en Postman.
 */
export const metadata = {
  title: "API pública",
  description: "Claves, documentación y cuotas de la API v1 de TrendHunter Pro.",
};

/** Endpoints documentados (se mantienen junto a las rutas reales). */
const ENDPOINTS = [
  { metodo: "GET", ruta: "/api/v1/productos", descripcion: "Catálogo con filtros, orden y paginación.", ejemplo: "?categoria=Belleza&minScore=70&orden=margen" },
  { metodo: "GET", ruta: "/api/v1/productos/{id}", descripcion: "Ficha: métricas con procedencia, anuncios y tiendas.", ejemplo: "" },
  { metodo: "GET", ruta: "/api/v1/tiendas", descripcion: "Tiendas analizadas por facturación estimada.", ejemplo: "?limite=20" },
  { metodo: "GET", ruta: "/api/v1/tiendas/{id}", descripcion: "Tienda con productos y timeline de cambios.", ejemplo: "" },
  { metodo: "GET", ruta: "/api/v1/tendencias", descripcion: "Serie diaria agregada del catálogo.", ejemplo: "?dias=30" },
  { metodo: "GET", ruta: "/api/v1/tendencias/del-dia", descripcion: "Términos del día (Google Trends RSS).", ejemplo: "?geo=ES" },
  { metodo: "GET", ruta: "/api/v1/estadisticas", descripcion: "KPIs agregados del catálogo.", ejemplo: "" },
  { metodo: "GET", ruta: "/api/v1/openapi", descripcion: "Especificación OpenAPI 3.1 (pública).", ejemplo: "" },
];

/** Códigos de error estables del contrato. */
const ERRORES = [
  { codigo: "SIN_CLAVE", estado: "401", descripcion: "No se envió la cabecera de autenticación." },
  { codigo: "CLAVE_INVALIDA", estado: "401", descripcion: "La clave no existe o tiene un formato incorrecto." },
  { codigo: "CLAVE_REVOCADA", estado: "401", descripcion: "La clave fue revocada desde el panel." },
  { codigo: "PLAN_INSUFICIENTE", estado: "403", descripcion: "El plan del propietario no incluye la API." },
  { codigo: "LIMITE_RITMO", estado: "429", descripcion: "Superado el límite por minuto (cabecera Retry-After)." },
  { codigo: "CUOTA_DIARIA", estado: "429", descripcion: "Cuota diaria agotada; se reinicia a medianoche UTC." },
  { codigo: "PARAMETRO_INVALIDO", estado: "400", descripcion: "Un filtro o parámetro no es válido." },
  { codigo: "NO_ENCONTRADO", estado: "404", descripcion: "El recurso solicitado no existe." },
];

export default async function ApiPage() {
  const sesion = await auth();
  if (!sesion?.user?.id) redirect("/login");

  const plan = sesion.user.planType;
  const conApi = planConApi(plan);
  const limites = conApi ? API_PLAN_LIMITS[plan] : null;
  const maximo = conApi ? CLAVES_POR_PLAN[plan] : 0;

  const claves = conApi
    ? await prisma.apiKey.findMany({
        where: { userId: sesion.user.id },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          nombre: true,
          prefijo: true,
          peticiones: true,
          peticionesHoy: true,
          ultimoUso: true,
          revocadaEn: true,
          createdAt: true,
        },
      })
    : [];

  const peticiones = claves.reduce((total, clave) => total + clave.peticiones, 0);
  const activas = claves.filter((clave) => !clave.revocadaEn).length;
  const definicion = PLANS.find((item) => item.id === plan);
  const base = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "https://tudominio.com";

  return (
    <>
      <PageHeading
        title="API pública"
        description="Conecta TrendHunter Pro con n8n, Make, Notion o tu propio backend. Datos del catálogo con procedencia y cuotas claras."
        actions={
          <Badge variant="violet" className="gap-1">
            <Braces className="size-3" />
            API v1 · solo lectura
          </Badge>
        }
      />

      {!conApi ? (
        <Card className="mb-6 border-indigo-500/30 bg-gradient-to-br from-indigo-950/40 to-slate-950">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="size-5 text-indigo-400" />
              La API está incluida en Business y Agency
            </CardTitle>
            <CardDescription>
              Tu plan actual es <strong>{definicion?.name ?? plan}</strong>. Con Business obtienes 60 peticiones por
              minuto y 5.000 al día; con Agency, 300 por minuto y 50.000 al día.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-3">
            <Button asChild>
              <Link href="/dashboard/settings/billing">
                Ver planes
                <ArrowUpRight className="size-4" />
              </Link>
            </Button>
            <span className="text-xs text-muted-foreground">
              Las claves se crean en segundos y puedes revocarlas cuando quieras.
            </span>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-2">
                  <KeyRound className="size-4" /> Claves activas
                </CardDescription>
                <CardTitle className="text-2xl">
                  {activas}
                  <span className="ml-1 text-sm font-normal text-muted-foreground">/ {maximo}</span>
                </CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-2">
                  <Gauge className="size-4" /> Peticiones históricas
                </CardDescription>
                <CardTitle className="text-2xl">{peticiones.toLocaleString("es-ES")}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-2">
                  <ShieldCheck className="size-4" /> Cuota diaria
                </CardDescription>
                <CardTitle className="text-2xl">{limites?.porDia.toLocaleString("es-ES")}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-2">
                  <Braces className="size-4" /> Plan
                </CardDescription>
                <CardTitle className="text-2xl">{definicion?.name ?? plan}</CardTitle>
              </CardHeader>
            </Card>
          </div>

          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Tus claves</CardTitle>
              <CardDescription>
                Solo se guarda el hash SHA-256: la clave completa se muestra una vez al crearla. Compártela por un
                gestor de secretos, nunca en el frontend.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ApiKeysPanel
                maximo={maximo}
                claves={claves.map((clave) => ({
                  id: clave.id,
                  nombre: clave.nombre,
                  prefijo: clave.prefijo,
                  peticiones: clave.peticiones,
                  peticionesHoy: clave.peticionesHoy,
                  ultimoUso: clave.ultimoUso?.toISOString() ?? null,
                  revocadaEn: clave.revocadaEn?.toISOString() ?? null,
                  creadaEn: clave.createdAt.toISOString(),
                }))}
              />
            </CardContent>
          </Card>
        </>
      )}

      {/* ---------------------------------------------------------------- docs */}
      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Empezar en 30 segundos</CardTitle>
            <CardDescription>
              Autentica con <code className="text-indigo-300">Authorization: Bearer</code> o con{" "}
              <code className="text-indigo-300">X-API-Key</code>.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <pre className="overflow-x-auto rounded-xl border border-border/70 bg-slate-950/80 p-4 text-xs leading-relaxed text-slate-300">
              <code>{`curl "${base}/api/v1/productos?categoria=Belleza&minScore=70" \\
  -H "Authorization: Bearer thp_live_TU_CLAVE"`}</code>
            </pre>
            <pre className="overflow-x-auto rounded-xl border border-border/70 bg-slate-950/80 p-4 text-xs leading-relaxed text-slate-300">
              <code>{`// JavaScript / TypeScript
const respuesta = await fetch("${base}/api/v1/productos?orden=margen", {
  headers: { Authorization: "Bearer thp_live_TU_CLAVE" },
});
const { data, meta } = await respuesta.json();`}</code>
            </pre>
            <div className="rounded-lg border border-border/60 bg-surface/50 p-3 text-xs text-muted-foreground">
              Todas las respuestas incluyen <code>data</code> y <code>meta</code>. Los errores siguen el formato{" "}
              <code>{`{ error: { codigo, mensaje } }`}</code>. La API admite CORS y expone{" "}
              <code>X-RateLimit-*</code> y <code>X-Quota-*</code>.
            </div>
            <Button asChild variant="outline" size="sm">
              <Link href="/api/v1/openapi" target="_blank">
                <Braces className="size-4" />
                Descargar OpenAPI 3.1
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Cuotas y buenas prácticas</CardTitle>
            <CardDescription>Límites por clave, no por usuario: separa integraciones.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <ul className="space-y-2">
              <li>
                · <strong className="text-foreground">Business:</strong> 60 peticiones/minuto · 5.000/día · 5 claves.
              </li>
              <li>
                · <strong className="text-foreground">Agency:</strong> 300 peticiones/minuto · 50.000/día · 20 claves.
              </li>
              <li>· Respeta <code>Retry-After</code> cuando recibas un 429.</li>
              <li>· Cachea las listas unos minutos: el catálogo se recalcula a diario.</li>
              <li>· Usa <code>porPagina</code> ≤ 50 y guarda el cursor por página.</li>
              <li>· Cada clave revocada deja de funcionar al instante.</li>
            </ul>
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200/90">
              La API es de solo lectura: no crea productos ni modifica seguimientos. Para eso están los endpoints
              internos del panel.
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Endpoints</CardTitle>
          <CardDescription>Rutas estables bajo /api/v1. La versión se indica en cada respuesta.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table className="min-w-[640px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Método</TableHead>
                  <TableHead>Ruta</TableHead>
                  <TableHead>Descripción</TableHead>
                  <TableHead>Ejemplo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ENDPOINTS.map((endpoint) => (
                  <TableRow key={endpoint.ruta}>
                    <TableCell>
                      <Badge variant="success">{endpoint.metodo}</Badge>
                    </TableCell>
                    <TableCell className="whitespace-nowrap font-mono text-xs text-indigo-300">
                      {endpoint.ruta}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{endpoint.descripcion}</TableCell>
                    <TableCell className="font-mono text-[11px] text-muted-foreground">
                      {endpoint.ejemplo || "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Códigos de error</CardTitle>
          <CardDescription>Estables: puedes programar contra ellos sin miedo a cambios de texto.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2 sm:grid-cols-2">
            {ERRORES.map((error) => (
              <div
                key={error.codigo}
                className="flex items-start gap-3 rounded-lg border border-border/60 bg-surface/40 px-3 py-2"
              >
                <Badge variant="outline" className="mt-0.5 shrink-0 font-mono">
                  {error.estado}
                </Badge>
                <div>
                  <p className="font-mono text-xs text-foreground">{error.codigo}</p>
                  <p className="text-xs text-muted-foreground">{error.descripcion}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </>
  );
}
