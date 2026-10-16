import { cn } from "@/lib/utils";

interface PageHeadingProps {
  title: string;
  description?: string;
  /** Acciones alineadas a la derecha (botones, filtros…). */
  actions?: React.ReactNode;
  className?: string;
}

/** Cabecera estándar de cada sección del dashboard. */
export function PageHeading({ title, description, actions, className }: PageHeadingProps) {
  return (
    <div className={cn("mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">{title}</h1>
        {description && <p className="max-w-2xl text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
