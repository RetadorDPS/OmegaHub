import { cn } from "@/lib/utils";

/** Marcador de carga con animación de pulso. */
function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("animate-pulse rounded-md bg-muted/60", className)} {...props} />;
}

export { Skeleton };
