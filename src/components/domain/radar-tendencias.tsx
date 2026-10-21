"use client";

import { useEffect, useState } from "react";
import { Radar, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Radar de tendencias del día (Google Trends RSS).
 * Muestra los términos reales que suben hoy en el país
 * elegido: una señal gratuita y medida para encontrar
 * nichos antes que la competencia.
 */

interface Tendencia {
  titulo: string;
  busquedas: string;
  fuente: string;
  url: string;
  publicado: string;
}

export function RadarTendencias({ geo = "ES" }: { geo?: string }) {
  const [items, setItems] = useState<Tendencia[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** Aviso cuando se muestran tendencias guardadas de una lectura anterior. */
  const [aviso, setAviso] = useState<string | null>(null);

  async function cargar() {
    setCargando(true);
    setError(null);
    setAviso(null);
    try {
      const respuesta = await fetch(`/api/tendencias/del-dia?geo=${geo}`);
      if (!respuesta.ok) {
        throw new Error(`HTTP ${respuesta.status}`);
      }
      const datos = (await respuesta.json()) as { items?: Tendencia[]; guardado?: boolean; actualizado?: string };
      setItems(datos.items ?? []);
      if (datos.guardado && datos.actualizado) {
        setAviso(`Guardadas de la última lectura (${new Date(datos.actualizado).toLocaleDateString("es-ES")}).`);
      }
    } catch {
      setError("Sin conexión con Google Trends ahora mismo.");
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    void cargar();
  }, [geo]);

  return (
    <div className="rounded-xl border border-border/70 bg-surface/40 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Radar className="size-4 text-indigo-400" />
          Tendencias del día · {geo}
        </h3>
        <Button variant="ghost" size="icon-sm" onClick={() => void cargar()} aria-label="Recargar">
          <RefreshCw className={cargando ? "animate-spin" : ""} />
        </Button>
      </div>

      {cargando && (
        <p className="py-4 text-center text-xs text-muted-foreground">Cargando tendencias…</p>
      )}
      {error && <p className="py-4 text-center text-xs text-amber-300">{error}</p>}

      {!cargando && !error && items.length === 0 && (
        <p className="py-4 text-center text-xs text-muted-foreground">
          No hay tendencias disponibles para este país.
        </p>
      )}

      {aviso && <p className="mb-2 text-[11px] text-muted-foreground">{aviso}</p>}

      {items.length > 0 && (
        <ul className="space-y-1.5">
          {items.slice(0, 8).map((item) => (
            <li key={item.url + item.titulo}>
              <a
                href={item.url}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-xs transition-colors hover:bg-surface"
              >
                <span className="min-w-0 flex-1 truncate">{item.titulo}</span>
                <span className="shrink-0 font-semibold text-indigo-300 tabular-nums">
                  {item.busquedas}
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-3 text-[10px] text-muted-foreground">
        Fuente: RSS oficial de Google Trends · dato medido, sin clave.
      </p>
    </div>
  );
}
