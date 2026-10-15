import * as React from "react";
import { cn } from "@/lib/utils";

/** Campo de texto del sistema de diseño. */
const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      ref={ref}
      className={cn(
        "flex h-10 w-full rounded-lg border border-input bg-background/60 px-3 py-2 text-sm text-foreground",
        "placeholder:text-muted-foreground/70 transition-colors",
        "focus:border-indigo-500/60 focus:bg-background focus-visible:outline-none",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "file:border-0 file:bg-transparent file:text-sm file:font-medium",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";

export { Input };
