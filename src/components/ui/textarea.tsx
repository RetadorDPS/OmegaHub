import * as React from "react";
import { cn } from "@/lib/utils";

/** Área de texto multilínea. */
const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        "flex min-h-20 w-full rounded-lg border border-input bg-background/60 px-3 py-2 text-sm",
        "placeholder:text-muted-foreground/70 transition-colors resize-y",
        "focus:border-indigo-500/60 focus:bg-background focus-visible:outline-none",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  ),
);
Textarea.displayName = "Textarea";

export { Textarea };
