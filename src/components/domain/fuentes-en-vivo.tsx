"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, Store, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Resumen que devuelve `/api/ingesta/manual` al leer una tienda. */
interface ResultadoTienda {
  ok: boolean;
  dominio: string;
  nombre: string | null;
  urlConsultada: string;
  productosLeidos: number;
  nuevos: number;
  actualizados: number;
  cambiosDePrecio: number;
  agotados: number;
  emparejados: number;
  cambios: Array<{ tipo: string; titulo: string; precioAntes?: number; precioAhora?: number }>;
  error: string | null;
  motivo: string | null;
  duracionMs?: number;
}

/** Resumen de la lectura de tendencias. */
interface ResultadoTendencias {
  ok: boolean;
  terminos: number;
  nuevos: number;
  coincidencias: Array<{ titulo: string; termino: string; volumen: string }>;
  error: string | null;
}

/** Motivos de fallo explicados en lenguaje humano. */
const MOTIVOS: Record<string, string> = {
  "dominio-invalido": "El dominio no parece válido.",
  bloqueado: "La tienda tiene contraseña o protección anti-bots.",
  "no-shopify": "Esa tienda no expone el catálogo público de Shopify.",
  formato: "El catálogo llegó en un formato que no se puede leer.",
  red: "No se ha podido conectar con la tienda.",
};

/**
 * Panel de ingesta: leer una tienda real, actualizar las tendencias del día o
 * lanzar todo. Cada acción escribe en la base y refresca la página.
 */
export function FuentesEnVivo({ geoInicial = "ES" }: { geoInicial?: string }) {
  const router = useRouter();
  const [dominio, setDominio] = useState("");
  const [ocupado, setOcupado] = useState<"tienda" | "tendencias" | "todo" | null>(null);
  const [, iniciarTransicion] = useTransition();
  const [ultima, setUltima] = useState<ResultadoTienda | null>(null);
  const [ultimaTendencia, setUltimaTendencia] = useState<ResultadoTendencias | null>(null);

  /** Ejecuta una acción contra la API de ingesta. */
  async function ejecutar(accion: "tienda" | "tendencias" | "todo") {
    if (accion === "tienda" && !dominio.trim()) {
      toast.error("Escribe el dominio de una tienda. Ejemplo: mitienda.com");
      return;
    }
    setOcupado(accion);
    try {
      const respuesta = await fetch("/api/ingesta/manual", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ accion, dominio: dominio.trim(), geo: geoInicial }),
      });
      const datos = (await respuesta.json()) as ResultadoTienda &
        ResultadoTendencias & { error?: string; tiendas?: ResultadoTienda[] };

      if (!respuesta.ok) {
        if (accion === "tienda") setUltima({ ...(datos as ResultadoTienda), ok: false });
        toast.error(datos.error ?? "No se ha podido actualizar.");
        return;
      }

      if (accion === "tendencias") {
        setUltimaTendencia(datos as ResultadoTendencias);
        toast.success(`${datos.terminos} tendencias del día · ${datos.coincidencias?.length ?? 0} coincidencias`);
      } else if (accion === "tienda") {
        setUltima(datos as ResultadoTienda);
        toast.success(`${datos.productosLeidos} productos leídos · ${datos.nuevos} nuevos`);
        setDominio("");
      } else {
        const total = datos.tiendas?.reduce((suma, tienda) => suma + tienda.productosLeidos, 0) ?? 0;
        toast.success(`Ingesta completa: ${datos.tiendas?.length ?? 0} tiendas · ${total} productos`);
      }

      iniciarTransicion(() => router.refresh());
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setOcupado(null);
    }
  }

  const fallo = ultima && !ultima.ok;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Store className="size-4 text-indigo-400" />
            Leer una tienda real
          </CardTitle>
          <CardDescription>
            Pega el dominio de cualquier tienda Shopify. Se lee su catálogo público
            (<code className="rounded bg-surface px-1">/products.json</code>): productos, precios y
            disponibilidad reales, sin claves ni cuentas.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="dominio-tienda">Dominio de la tienda</Label>
            <div className="flex gap-2">
              <Input
                id="dominio-tienda"
                placeholder="mitienda.com"
                value={dominio}
                onChange={(evento) => setDominio(evento.target.value)}
                onKeyDown={(evento) => {
                  if (evento.key === "Enter") void ejecutar("tienda");
                }}
                autoComplete="off"
              />
              <Button onClick={() => void ejecutar("tienda")} disabled={ocupado !== null} className="shrink-0 gap-2">
                {ocupado === "tienda" ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
                Leer catálogo
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Ejemplos de tiendas Shopify con catálogo abierto: <code>allbirds.com</code>,{" "}
              <code>gymshark.com</code>, <code>bombas.com</code>.
            </p>
          </div>

          <div className="flex flex-wrap gap-2 border-t border-border/60 pt-3">
            <Button variant="outline" size="sm" onClick={() => void ejecutar("tendencias")} disabled={ocupado !== null} className="gap-2">
              {ocupado === "tendencias" ? <Loader2 className="size-4 animate-spin" /> : <TrendingUp className="size-4" />}
              Tendencias de hoy (Google Trends RSS)
            </Button>
            <Button variant="outline" size="sm" onClick={() => void ejecutar("todo")} disabled={ocupado !== null} className="gap-2">
              {ocupado === "todo" ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
              Actualizar todo
            </Button>
          </div>

          {ultima && (
            <div
              className={
                fallo
                  ? "rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm"
                  : "rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm"
              }
            >
              {fallo ? (
                <p className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-400" />
                  <span>
                    <strong>No se ha leído el catálogo.</strong>{" "}
                    {MOTIVOS[ultima.motivo ?? ""] ?? ultima.error ?? "Motivo desconocido."}
                    <br />
                    <span className="text-xs text-muted-foreground">
                      No se ha guardado nada: preferimos no tener el dato a inventarlo.
                    </span>
                  </span>
                </p>
              ) : (
                <div className="space-y-1">
                  <p className="flex items-center gap-2 font-medium">
                    <CheckCircle2 className="size-4 text-emerald-400" />
                    {ultima.nombre ?? ultima.dominio}: {ultima.productosLeidos} productos leídos
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {ultima.nuevos} nuevos · {ultima.actualizados} actualizados · {ultima.cambiosDePrecio} cambios de
                    precio · {ultima.agotados} agotados · {ultima.emparejados} cruzados con tu catálogo
                  </p>
                  {ultima.cambios.length > 0 && (
                    <ul className="mt-1 space-y-0.5 text-xs">
                      {ultima.cambios.slice(0, 5).map((cambio, indice) => (
                        <li key={`${cambio.titulo}-${indice}`} className="truncate">
                          · {cambio.tipo === "precio" ? "Precio" : cambio.tipo === "nuevo" ? "Nuevo" : "Agotado"}:{" "}
                          {cambio.titulo}
                          {cambio.tipo === "precio" && cambio.precioAntes !== undefined
                            ? ` (${cambio.precioAntes.toFixed(2)} € → ${(cambio.precioAhora ?? 0).toFixed(2)} €)`
                            : ""}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          )}

          {ultimaTendencia && (
            <div className="rounded-lg border border-border bg-surface p-3 text-sm">
              <p className="font-medium">
                {ultimaTendencia.ok
                  ? `${ultimaTendencia.terminos} tendencias del día (${ultimaTendencia.nuevos} nuevas)`
                  : "Google Trends no ha respondido"}
              </p>
              {ultimaTendencia.coincidencias.length > 0 ? (
                <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                  {ultimaTendencia.coincidencias.slice(0, 6).map((coincidencia) => (
                    <li key={coincidencia.titulo}>
                      · {coincidencia.titulo} → «{coincidencia.termino}» ({coincidencia.volumen})
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-xs text-muted-foreground">
                  {ultimaTendencia.error ?? "Ningún término de hoy coincide con tu catálogo."}
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
