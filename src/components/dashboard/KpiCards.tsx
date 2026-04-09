"use client";

import { AlertTriangle, DollarSign, Plane, Wallet } from "lucide-react";
import { useState } from "react";

import { AnomaliesPanel } from "@/components/dashboard/AnomaliesPanel";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency, formatInteger, formatPercent } from "@/lib/format";

type Financials = {
  revenue: number;
  expenses: number;
  net_profit: number;
  margin_pct: number;
  travel_spend: number;
  anomaly_count: number;
  project_count?: number;
};

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

const cards = [
  { key: "revenue", label: "Revenue", icon: DollarSign },
  { key: "expenses", label: "Expenses", icon: Wallet },
  { key: "net_profit", label: "Net Profit", icon: DollarSign },
  { key: "margin_pct", label: "Margin %", icon: DollarSign },
  { key: "travel_spend", label: "Travel Spend", icon: Plane },
  { key: "anomaly_count", label: "Flagged Anomalies", icon: AlertTriangle }
] as const;

export function KpiCards({
  financials,
  anomalies,
  anomaliesError
}: {
  financials: Financials;
  anomalies?: AnomaliesData;
  anomaliesError?: string;
}) {
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const pendingReviewCount = anomalies?.anomalies.length ?? financials.anomaly_count;

  return (
    <>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {cards.map((card) => {
          const Icon = card.icon;
          const isAnomalyCard = card.key === "anomaly_count";
          const value =
            card.key === "margin_pct"
              ? formatPercent(financials.margin_pct)
              : card.key === "anomaly_count"
                ? formatInteger(financials.anomaly_count)
                : formatCurrency(financials[card.key]);

          const tone =
            card.key === "net_profit"
              ? financials.net_profit >= 0
                ? "accent"
                : "danger"
                : card.key === "margin_pct"
                  ? financials.margin_pct < 5
                    ? "danger"
                    : financials.margin_pct < 20
                      ? "warning"
                      : "accent"
                : card.key === "anomaly_count"
                  ? financials.anomaly_count > 0
                    ? "danger"
                    : "neutral"
                  : "neutral";

          return (
            <button
              type="button"
              key={card.key}
              onClick={isAnomalyCard ? () => setIsPanelOpen(true) : undefined}
              className={isAnomalyCard ? "text-left" : "cursor-default text-left"}
            >
              <Card className="h-full transition hover:-translate-y-0.5 hover:shadow-[0_14px_30px_rgba(15,23,42,0.08)]">
                <CardContent className="space-y-4 p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium text-[var(--muted)]">{card.label}</p>
                      <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">{value}</p>
                    </div>
                    <div className="rounded-2xl bg-slate-100 p-3">
                      <Icon className="h-5 w-5 text-slate-700" />
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <Badge tone={tone}>
                      {card.key === "anomaly_count"
                        ? financials.anomaly_count === 0
                          ? "clear"
                          : `${formatInteger(pendingReviewCount)} pending`
                        : card.key === "margin_pct"
                          ? "margin health"
                          : "current scope"}
                    </Badge>
                    {card.key === "revenue" && typeof financials.project_count === "number" ? (
                      <span className="text-xs text-[var(--muted)]">
                        {formatInteger(financials.project_count)} tracked projects
                      </span>
                    ) : null}
                    {isAnomalyCard ? <span className="text-xs text-[var(--muted)]">Click to inspect</span> : null}
                  </div>
                </CardContent>
              </Card>
            </button>
          );
        })}
      </div>
      <AnomaliesPanel open={isPanelOpen} onOpenChange={setIsPanelOpen} data={anomalies} error={anomaliesError} />
    </>
  );
}
