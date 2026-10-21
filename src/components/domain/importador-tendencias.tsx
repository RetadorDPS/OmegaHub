"use client";

import { useRef, useState } from "react";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Importador de tendencias (CSV/JSON).
 *
 * Acepta exportaciones de Google Trends y ficheros
 * propios. Formatos de fecha y número europeos
 * (1.234,56 y dd/mm/aaaa). Cada punto importado
 * queda marcado como IMPORTADO con su fecha.
 */

export function ImportadorTendencias({ productoId }: { productoId: string }) {
  const archivoRef = useRef<HTMLInputElement>(null);
  const [ocupado, setOcupado] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function procesar(archivo: File) {
    setOcupado(true);
    setError(null);
    setMensaje(null);
    try {
      const texto = await archivo.text();
      const formato = archivo.name.toLowerCase().endsWith(".json") ? "json" : "csv";
      const respuesta = await fetch(`/api/productos/${productoId}/importar-tendencias`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ formato, contenido: texto }),
      });
      const datos = (await respuesta.json()) as {
        importados?: number;
        error?: string;
      };
      if (!respuesta.ok) throw new Error(datos.error ?? `HTTP ${respuesta.status}`);
      setMensaje(`${datos.importados} puntos importados con procedencia real.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo importar.");
    } finally {
      setOcupado(false);
      if (archivoRef.current) archivoRef.current.value = "";
    }
  }

  return (
    <div className="rounded-xl border border-dashed border-border/70 p-4">
      <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold">
        <Upload className="size-4 text-indigo-400" />
        Importar tus datos
      </h3>
      <p className="mb-3 text-xs text-muted-foreground">
        CSV o JSON con columnas date/fecha, google, tiktok, youtube, meta, tiendas.
        Decimales europeos (1.234,56).
      </p>
      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          size="sm"
          disabled={ocupado}
          onClick={() => archivoRef.current?.click()}
        >
          {ocupado ? "Importando…" : "Elegir fichero"}
        </Button>
        <input
          ref={archivoRef}
          type="file"
          accept=".csv,.json,text/csv,application/json"
          className="hidden"
          onChange={(evento) => {
            const archivo = evento.target.files?.[0];
            if (archivo) void procesar(archivo);
          }}
        />
        {mensaje && <span className="text-xs text-emerald-300">{mensaje}</span>}
        {error && <span className="text-xs text-rose-300">{error}</span>}
      </div>
    </div>
  );
}
