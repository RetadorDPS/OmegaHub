"use client";

import { useState } from "react";
import Image from "next/image";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface ProductGalleryProps {
  images: string[];
  title: string;
  /** Etiqueta de la esquina superior (por ejemplo "Galería"). */
  badge?: string;
}

/** Galería de imágenes del producto con miniaturas seleccionables. */
export function ProductGallery({ images, title, badge = "Galería del producto" }: ProductGalleryProps) {
  const [activa, setActiva] = useState(0);
  const lista = images.length > 0 ? images : ["/images/products/p01-1.jpg"];

  return (
    <Card className="overflow-hidden">
      <div className="relative aspect-square bg-slate-900">
        <Image
          src={lista[activa]}
          alt={`${title} — imagen ${activa + 1}`}
          fill
          sizes="(max-width: 1024px) 100vw, 360px"
          className="object-cover"
          priority
        />
        <Badge variant="secondary" className="absolute left-3 top-3 bg-slate-950/70 backdrop-blur">
          {badge}
        </Badge>
      </div>
      {lista.length > 1 && (
        <div className="flex gap-2 p-3">
          {lista.map((imagen, indice) => (
            <button
              key={imagen}
              type="button"
              onClick={() => setActiva(indice)}
              aria-label={`Ver imagen ${indice + 1}`}
              className={cn(
                "relative size-16 shrink-0 overflow-hidden rounded-lg border-2 transition-all",
                activa === indice ? "border-indigo-500" : "border-transparent opacity-60 hover:opacity-100",
              )}
            >
              <Image src={imagen} alt="" fill sizes="64px" className="object-cover" />
            </button>
          ))}
        </div>
      )}
    </Card>
  );
}
