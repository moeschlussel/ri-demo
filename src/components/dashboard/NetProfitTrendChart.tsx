"use client";

import { Activity, TrendingDown, TrendingUp } from "lucide-react";
import { CartesianGrid, Line, LineChart, Tooltip, XAxis, YAxis } from "recharts";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency, formatMonthLabel } from "@/lib/format";

type NetProfitTrendData = {
  months: Array<{
    month: string;
    total_revenue: number;
    total_expenses: number;
    net_profit: number;
  }>;
  summary: {
    avg_monthly_profit: number;
    first_month_profit: number;
    last_month_profit: number;
    pct_change: number;
  };
};

function formatAxisCurrency(value: number): string {
  const absoluteValue = Math.abs(value);
  return `${value < 0 ? "-" : ""}$${absoluteValue.toFixed(0)}`;
}

export function NetProfitTrendChart({ data, error }: { data?: NetProfitTrendData; error?: string }) {
  const trendUp = (data?.summary.pct_change ?? 0) >= 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle>Net Profit Trend</CardTitle>
            <CardDescription>Monthly net profit across the trailing 24 reporting months.</CardDescription>
          </div>
          {data ? (
            <div className="flex items-center gap-2">
              <Badge tone={trendUp ? "accent" : "warning"}>
                {trendUp ? <TrendingUp className="mr-1 h-3 w-3" /> : <TrendingDown className="mr-1 h-3 w-3" />}
                {data.summary.pct_change >= 0 ? "+" : ""}
                {data.summary.pct_change.toFixed(1)}%
              </Badge>
              <Badge tone="neutral">
                <Activity className="mr-1 h-3 w-3" />
                Avg {formatCurrency(data.summary.avg_monthly_profit)}
              </Badge>
            </div>
          ) : null}
        </div>
      </CardHeader>
      <CardContent>
        {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
        {data && data.months.length > 0 ? (
          <div className="overflow-x-auto">
            <LineChart width={Math.max(720, data.months.length * 48)} height={288} data={data.months}>
              <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="rgba(15,23,42,0.08)" />
              <XAxis
                dataKey="month"
                tickFormatter={(value) => formatMonthLabel(String(value))}
                tick={{ fontSize: 12, fill: "#667085" }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tickFormatter={(value) => formatAxisCurrency(Number(value))}
                tick={{ fontSize: 12, fill: "#667085" }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                formatter={(value) => formatCurrency(typeof value === "number" ? value : Number(value ?? 0))}
                labelFormatter={(label) => formatMonthLabel(String(label))}
              />
              <Line type="monotone" dataKey="net_profit" stroke="var(--accent)" strokeWidth={3} dot={false} />
            </LineChart>
          </div>
        ) : !error && (!data || data.months.length === 0) ? (
          <p className="text-sm text-[var(--muted)]">No net profit trend data is available for this scope.</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
