"use client";

import { RefreshCcw, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

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
  review_enabled: boolean;
  anomalies: Array<{
    expense_id: string;
    type: "duplicate" | "category_outlier" | "unauthorized_category" | "large_equipment";
    reason: string;
    amount: number;
    category: string;
    technician_name: string | null;
    project_name: string | null;
    date: string;
    review_status: "unreviewed" | "verified";
    reviewed_at: string | null;
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
  const [savingExpenseId, setSavingExpenseId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const anomalies = [...(data?.anomalies ?? [])].sort((left, right) => {
    if (left.review_status !== right.review_status) {
      return left.review_status === "unreviewed" ? -1 : 1;
    }

    return new Date(right.date).getTime() - new Date(left.date).getTime();
  });
  const groupedMap = new Map<string, NonNullable<AnomaliesData["anomalies"]>>();
  for (const anomaly of anomalies) {
    const current = groupedMap.get(anomaly.type) ?? [];
    current.push(anomaly);
    groupedMap.set(anomaly.type, current);
  }
  const grouped = [...groupedMap.entries()];
  const unreviewedCount = anomalies.filter((anomaly) => anomaly.review_status === "unreviewed").length;
  const verifiedCount = anomalies.length - unreviewedCount;

  async function updateReviewStatus(expenseId: string, reviewStatus: "unreviewed" | "verified") {
    setSavingExpenseId(expenseId);
    setSaveError(null);

    try {
      const response = await fetch("/api/anomalies/review", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ expenseId, reviewStatus })
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? "Failed saving anomaly review.");
      }

      router.refresh();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Failed saving anomaly review.");
    } finally {
      setSavingExpenseId(null);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full max-w-xl">
        <SheetHeader>
          <SheetTitle className="text-xl font-semibold text-slate-900">Flagged anomalies</SheetTitle>
          <SheetDescription className="mt-2 text-sm text-[var(--muted)]">
            Deterministic findings from the current scope. These are the same anomaly flags the AI sees, with a
            separate manual verification status layered on top.
          </SheetDescription>
        </SheetHeader>
        <ScrollArea className="h-[calc(100%-9.5rem)] px-6 py-5">
          {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
          {!error && data && !data.review_enabled ? (
            <p className="mb-4 text-sm text-[var(--warning)]">
              Verification controls are unavailable until the latest database migration is applied. The flagged rows
              below are still accurate.
            </p>
          ) : null}
          {!error && grouped.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">No flagged anomalies in this scope.</p>
          ) : null}
          {!error && grouped.length > 0 ? (
            <div className="mb-6 flex flex-wrap items-center gap-2 text-sm text-[var(--muted)]">
              <Badge tone={unreviewedCount > 0 ? "warning" : "accent"}>
                {unreviewedCount > 0 ? `${unreviewedCount} pending review` : "all reviewed"}
              </Badge>
              {verifiedCount > 0 ? <span>{verifiedCount} verified</span> : null}
            </div>
          ) : null}
          {!error && saveError ? <p className="mb-4 text-sm text-[var(--danger)]">{saveError}</p> : null}
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
                        <Badge tone={row.review_status === "verified" ? "accent" : "warning"}>
                          {row.review_status === "verified" ? "verified" : "needs review"}
                        </Badge>
                        {row.reviewed_at ? (
                          <span className="text-xs text-[var(--muted)]">
                            Saved {new Date(row.reviewed_at).toLocaleString("en-US")}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-3 text-sm leading-6 text-slate-700">{row.reason}</p>
                      {data?.review_enabled ? (
                        <div className="mt-4">
                          <Button
                            size="sm"
                            variant={row.review_status === "verified" ? "outline" : "default"}
                            disabled={savingExpenseId === row.expense_id}
                            onClick={() =>
                              void updateReviewStatus(
                                row.expense_id,
                                row.review_status === "verified" ? "unreviewed" : "verified"
                              )
                            }
                          >
                            {savingExpenseId === row.expense_id
                              ? "Saving..."
                              : row.review_status === "verified"
                                ? "Clear verification"
                                : "Mark verified"}
                          </Button>
                        </div>
                      ) : null}
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
