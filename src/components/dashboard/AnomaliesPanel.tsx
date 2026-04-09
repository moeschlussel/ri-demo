"use client";

import { RefreshCcw, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatCurrency } from "@/lib/format";

type AnomaliesData = {
  anomalies: Array<{
    expense_id: string;
    type: "duplicate" | "category_outlier" | "unauthorized_category" | "large_equipment";
    reason: string;
    amount: number;
    category: string;
    technician_name: string | null;
    project_name: string | null;
    date: string;
  }>;
};

export function AnomaliesPanel({
  open,
  onOpenChange,
  data,
  error
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data?: AnomaliesData;
  error?: string;
}) {
  const router = useRouter();
  const anomalies = [...(data?.anomalies ?? [])].sort(
    (left, right) => new Date(right.date).getTime() - new Date(left.date).getTime()
  );
  const groupedMap = new Map<string, NonNullable<AnomaliesData["anomalies"]>>();
  for (const anomaly of anomalies) {
    const current = groupedMap.get(anomaly.type) ?? [];
    current.push(anomaly);
    groupedMap.set(anomaly.type, current);
  }
  const grouped = [...groupedMap.entries()];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full max-w-xl">
        <SheetHeader>
          <SheetTitle className="text-xl font-semibold text-slate-900">Flagged anomalies</SheetTitle>
          <SheetDescription className="mt-2 text-sm text-[var(--muted)]">
            Deterministic findings from the current scope. These are the same anomaly flags the AI sees.
          </SheetDescription>
        </SheetHeader>
        <ScrollArea className="h-[calc(100%-9.5rem)] px-6 py-5">
          {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
          {!error && grouped.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">No flagged anomalies in this scope.</p>
          ) : null}
          {!error && grouped.length > 0 ? (
            <div className="mb-8 flex flex-wrap items-center gap-2 text-sm text-[var(--muted)]">
              <Badge tone="warning">{anomalies.length} pending review</Badge>
            </div>
          ) : null}
          <div className="space-y-6">
            {grouped.map(([type, rows]) => (
              <section key={type} className="space-y-3">
                <div className="flex items-center gap-2">
                  <Badge tone="danger">{type.replaceAll("_", " ")}</Badge>
                  <span className="text-sm text-[var(--muted)]">{rows.length} item(s)</span>
                </div>
                <div className="space-y-3">
                  {rows.map((row) => (
                    <div key={row.expense_id} className="rounded-2xl border border-[color:var(--border)] p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="space-y-1">
                          <p className="font-semibold text-slate-900">{row.project_name ?? "Unknown project"}</p>
                          <p className="text-sm text-[var(--muted)]">
                            {row.technician_name ?? "Unknown technician"} · {row.category}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold text-[var(--danger)]">{formatCurrency(row.amount)}</p>
                          <p className="text-xs text-[var(--muted)]">
                            {new Date(row.date).toLocaleDateString("en-US")}
                          </p>
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <Badge tone="warning">Needs review</Badge>
                      </div>
                      <p className="mt-3 text-sm leading-6 text-slate-700">{row.reason}</p>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </ScrollArea>
        <SheetFooter className="flex flex-col gap-3 sm:flex-row">
          <Button variant="outline" className="w-full sm:w-auto" onClick={() => router.refresh()}>
            <RefreshCcw className="mr-2 h-4 w-4" />
            Re-run audit
          </Button>
          <Button
            className="w-full sm:w-auto"
            onClick={() => {
              window.dispatchEvent(
                new CustomEvent("cfo-chat-prefill", {
                  detail: { message: "Explain the flagged anomalies in the current view." }
                })
              );
              onOpenChange(false);
            }}
          >
            <Sparkles className="mr-2 h-4 w-4" />
            Ask CFO about these
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
