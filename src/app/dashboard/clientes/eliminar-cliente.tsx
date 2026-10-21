"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/**
 * Borrado de un cliente con confirmación.
 *
 * Se hace con `fetch` + `DELETE` porque un formulario HTML solo envía GET/POST
 * y la ruta `/api/clientes/:id` expone DELETE (no un POST con `_method`).
 */
export function EliminarCliente({ id, nombre }: { id: string; nombre: string }) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);

  async function eliminar() {
    const confirmado = window.confirm(
      `¿Eliminar el cliente «${nombre}»? Los seguimientos asignados dejarán de estar vinculados.`,
    );
    if (!confirmado) return;

    setOcupado(true);
    try {
      const respuesta = await fetch(`/api/clientes/${id}`, { method: "DELETE" });
      if (!respuesta.ok) {
        const cuerpo = (await respuesta.json().catch(() => ({}))) as { error?: string };
        throw new Error(cuerpo.error ?? `No se pudo eliminar (HTTP ${respuesta.status}).`);
      }
      toast.success("Cliente eliminado.");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo eliminar el cliente.");
    } finally {
      setOcupado(false);
    }
  }

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={eliminar}
      loading={ocupado}
      aria-label={`Eliminar cliente ${nombre}`}
    >
      <Trash2 className="size-4" />
    </Button>
  );
}
