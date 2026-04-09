import * as React from "react";

import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      "flex h-11 w-full rounded-xl border border-[color:var(--border)] bg-white px-4 py-2 text-sm text-slate-900 outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]",
      className
    )}
    {...props}
  />
));

Input.displayName = "Input";

export { Input };

