"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Radar, RadarIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

interface TrackStoreButtonProps {
  storeId: string;
  companyName: string;
  tracked: boolean;
  /** Tamaño compacto para usar dentro de tarjetas. */
  compact?: boolean;
}

/** Botón para empezar o dejar de rastrear una tienda (Store Tracker). */
export function TrackStoreButton({ storeId, companyName, tracked, compact = false }: TrackStoreButtonProps) {
  const router = useRouter();
  const [siguiendo, setSiguiendo] = useState(tracked);
  const [cargando, setCargando] = useState(false);

  async function alternar() {
    setCargando(true);
    try {
      const respuesta = await fetch("/api/trackers/stores", {
        method: siguiendo ? "DELETE" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ storeId }),
      });

      if (respuesta.status === 402) {
        const datos = (await respuesta.json()) as { error?: string };
        toast.error(datos.error ?? "Has alcanzado el límite de tiendas de tu plan");
        return;
      }
      if (!respuesta.ok) throw new Error("No se pudo actualizar el seguimiento");

      setSiguiendo(!siguiendo);
      toast.success(
        siguiendo ? `Has dejado de seguir ${companyName}` : `Siguiendo ${companyName}: recibirás alertas de cambios`,
      );
      router.refresh();
    } catch {
      toast.error("No se pudo actualizar el seguimiento");
    } finally {
      setCargando(false);
    }
  }

  return (
    <Button
      variant={siguiendo ? "secondary" : "default"}
      size={compact ? "sm" : "default"}
      loading={cargando}
      onClick={alternar}
      className="gap-2"
    >
      {!cargando &&
        (siguiendo ? <RadarIcon className="size-4 text-emerald-400" /> : <Radar className="size-4" />)}
      {siguiendo ? "Siguiendo" : "Rastrear esta tienda"}
    </Button>
  );
}
