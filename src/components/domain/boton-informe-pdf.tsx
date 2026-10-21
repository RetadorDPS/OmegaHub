"use client";

import { useState } from "react";
import { FileDown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface BotonInformePdfProps {
  /** Ruta de la API que genera el PDF. */
  origen: "producto" | "tienda";
  /** Id del producto o la tienda. */
  id: string;
}

/**
 * Botón «Informe PDF»: genera y descarga el informe
 * del producto o la tienda. Consume una cuota de
 * exportación del plan (FREE no puede exportar).
 */
export function BotonInformePdf({ origen, id }: BotonInformePdfProps) {
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function descargar() {
    setOcupado(true);
    setError(null);
    try {
      const respuesta = await fetch(
        origen === "producto"
          ? `/api/productos/${id}/informe`
          : `/api/tiendas/${id}/informe`,
        { method: "POST" },
      );

      if (respuesta.status === 402) {
        const datos = (await respuesta.json()) as { error?: string };
        throw new Error(datos.error ?? "Tu plan no permite exportar informes.");
      }
      if (!respuesta.ok) {
        throw new Error(`No se pudo generar el informe (${respuesta.status}).`);
      }

      const blob = await respuesta.blob();
      const url = URL.createObjectURL(blob);
      const enlace = document.createElement("a");
      enlace.href = url;
      enlace.download = `informe-trendhunter-${origen}-${id}.pdf`;
      enlace.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al generar el informe.");
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="inline-flex flex-col items-start gap-1">
      <Button variant="outline" size="sm" onClick={() => void descargar()} disabled={ocupado}>
        {ocupado ? <Loader2 className="size-4 animate-spin" /> : <FileDown className="size-4" />}
        Informe PDF
      </Button>
      {error && <span className="text-xs text-rose-300">{error}</span>}
    </div>
  );
}
