"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bookmark } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface SaveProductButtonProps {
  productId: string;
  saved: boolean;
}

/** Botón de favoritos con estado optimista y confirmación por toast. */
export function SaveProductButton({ productId, saved }: SaveProductButtonProps) {
  const router = useRouter();
  const [guardado, setGuardado] = useState(saved);
  const [cargando, setCargando] = useState(false);

  async function alternar() {
    setCargando(true);
    try {
      const respuesta = await fetch("/api/saved-products", {
        method: guardado ? "DELETE" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ productId }),
      });
      if (respuesta.status === 402) {
        const datos = (await respuesta.json()) as { error?: string };
        toast.error(datos.error ?? "Has alcanzado el límite de tu plan");
        return;
      }
      if (!respuesta.ok) throw new Error("Error al guardar");
      setGuardado(!guardado);
      toast.success(guardado ? "Eliminado de favoritos" : "Guardado en favoritos");
      router.refresh();
    } catch {
      toast.error("No se pudo actualizar el favorito");
    } finally {
      setCargando(false);
    }
  }

  return (
    <Button variant={guardado ? "secondary" : "outline"} size="sm" loading={cargando} onClick={alternar} className="gap-1.5">
      {!cargando && <Bookmark className={guardado ? "fill-amber-400 text-amber-400" : ""} />}
      {guardado ? "Guardado" : "Guardar"}
    </Button>
  );
}
