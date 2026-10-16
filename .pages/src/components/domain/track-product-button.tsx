"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, BellOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface TrackProductButtonProps {
  productId: string;
  tracked: boolean;
}

/** Activa o desactiva el seguimiento de un producto (notificaciones de tendencia). */
export function TrackProductButton({ productId, tracked }: TrackProductButtonProps) {
  const router = useRouter();
  const [siguiendo, setSiguiendo] = useState(tracked);
  const [cargando, setCargando] = useState(false);

  async function alternar() {
    setCargando(true);
    try {
      const respuesta = await fetch("/api/trackers/products", {
        method: siguiendo ? "DELETE" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ productId }),
      });
      if (respuesta.status === 402) {
        const datos = (await respuesta.json()) as { error?: string };
        toast.error(datos.error ?? "Has alcanzado el límite de tu plan");
        return;
      }
      if (!respuesta.ok) throw new Error("Error");
      setSiguiendo(!siguiendo);
      toast.success(siguiendo ? "Dejarás de seguir este producto" : "Te avisaremos de sus cambios");
      router.refresh();
    } catch {
      toast.error("No se pudo actualizar el seguimiento");
    } finally {
      setCargando(false);
    }
  }

  return (
    <Button variant={siguiendo ? "secondary" : "outline"} size="sm" loading={cargando} onClick={alternar} className="gap-1.5">
      {!cargando && (siguiendo ? <BellOff /> : <Bell />)}
      {siguiendo ? "Siguiendo" : "Seguir producto"}
    </Button>
  );
}
