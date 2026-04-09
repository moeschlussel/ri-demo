import * as React from "react";

import { cn } from "@/lib/utils";

export function Badge({
  className,
  tone = "neutral",
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: "neutral" | "accent" | "danger" | "warning" }) {
  const toneClass =
    tone === "accent"
      ? "bg-[var(--accent-soft)] text-[var(--accent)]"
      : tone === "danger"
        ? "bg-[var(--danger-soft)] text-[var(--danger)]"
        : tone === "warning"
          ? "bg-[var(--warning-soft)] text-[var(--warning)]"
          : "bg-slate-100 text-slate-700";

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.08em]",
        toneClass,
        className
      )}
      {...props}
    />
  );
}

