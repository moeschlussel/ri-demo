"use client";

import { Activity, TrendingUp } from "lucide-react";
import { CartesianGrid, Line, LineChart, Tooltip, XAxis, YAxis } from "recharts";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency, formatMonthLabel } from "@/lib/format";

type TravelTrendData = {
  months: Array<{
    month: string;
    total_travel_spend: number;
    survey_count: number;
    avg_travel_cost_per_survey: number;
  }>;
  summary: {
    avg_of_avgs: number;
    first_month_avg: number;
    last_month_avg: number;
    pct_change: number;
  };
};

export function TravelTrendChart({ data, error }: { data?: TravelTrendData; error?: string }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle>Travel Trend</CardTitle>
            <CardDescription>Average travel cost per survey over the trailing 24 months.</CardDescription>
          </div>
          {data ? (
            <div className="flex items-center gap-2">
              <Badge tone={data.summary.pct_change >= 0 ? "warning" : "accent"}>
                <TrendingUp className="mr-1 h-3 w-3" />
                {data.summary.pct_change >= 0 ? "+" : ""}
                {data.summary.pct_change.toFixed(1)}%
              </Badge>
              <Badge tone="neutral">
                <Activity className="mr-1 h-3 w-3" />
                Avg {formatCurrency(data.summary.avg_of_avgs)}
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
                  tickFormatter={(value) => `$${Number(value).toFixed(0)}`}
                  tick={{ fontSize: 12, fill: "#667085" }}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  formatter={(value) => formatCurrency(typeof value === "number" ? value : Number(value ?? 0))}
                  labelFormatter={(label) => formatMonthLabel(String(label))}
                />
                <Line
                  type="monotone"
                  dataKey="avg_travel_cost_per_survey"
                  stroke="var(--accent)"
                  strokeWidth={3}
                  dot={false}
                />
              </LineChart>
          </div>
        ) : !error && (!data || data.months.length === 0) ? (
          <p className="text-sm text-[var(--muted)]">No travel trend data is available for this scope.</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
