import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/** Insignia compacta para estados, etiquetas y niveles. */
const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors [&_svg]:size-3",
  {
    variants: {
      variant: {
        default: "border-indigo-500/30 bg-indigo-500/15 text-indigo-300",
        secondary: "border-border bg-secondary text-secondary-foreground",
        outline: "border-border text-muted-foreground",
        success: "border-emerald-500/30 bg-emerald-500/15 text-emerald-300",
        warning: "border-amber-500/30 bg-amber-500/15 text-amber-300",
        danger: "border-rose-500/30 bg-rose-500/15 text-rose-300",
        violet: "border-violet-500/30 bg-violet-500/15 text-violet-300",
        muted: "border-border/70 bg-muted/60 text-muted-foreground",
        gradient: "border-transparent bg-gradient-to-r from-indigo-600 to-violet-600 text-white",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

/** Insignia con variantes semánticas (éxito, aviso, peligro...). */
function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
