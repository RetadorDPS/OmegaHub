"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { ArrowDownWideNarrow } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PRODUCT_SORT_OPTIONS } from "@/lib/constants";
import type { ProductSortOption } from "@/types";

interface ProductSortSelectProps {
  valor: ProductSortOption;
  className?: string;
}

/** Selector de ordenación del catálogo (escribe en la URL). */
export function ProductSortSelect({ valor, className }: ProductSortSelectProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function cambiar(nuevo: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("sort", nuevo);
    params.delete("page");
    router.push(`/dashboard/winning-products?${params.toString()}`);
  }

  return (
    <div className={className}>
      <Select value={valor} onValueChange={cambiar}>
        <SelectTrigger className="h-9 w-56 text-xs" aria-label="Ordenar resultados">
          <span className="flex items-center gap-2 text-muted-foreground">
            <ArrowDownWideNarrow className="size-3.5" />
            <SelectValue />
          </span>
        </SelectTrigger>
        <SelectContent>
          {PRODUCT_SORT_OPTIONS.map((opcion) => (
            <SelectItem key={opcion.value} value={opcion.value}>
              {opcion.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
