"use client";

import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency } from "@/lib/format";
import type { Scope } from "@/lib/types";

type ExpenseBreakdownData = {
  rows: Array<{
    expense_id: string;
    technician_id: string | null;
    date: string;
    category: string;
    amount: number;
    technician_name: string | null;
    project_name: string | null;
    org_id: string | null;
    anomaly_flag: boolean;
    anomaly_type: string | null;
    anomaly_reason: string | null;
  }>;
  total_count: number;
  total_amount: number;
};

const UNKNOWN_TECHNICIAN_VALUE = "__unknown-technician__";

export function ExpenseBreakdownTable({
  scope,
  data,
  error
}: {
  scope: Scope;
  data?: ExpenseBreakdownData;
  error?: string;
}) {
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedTechnician, setSelectedTechnician] = useState<string>("all");
  const [onlyAnomalies, setOnlyAnomalies] = useState(false);

  const categories = Array.from(new Set(data?.rows.map((row) => row.category) ?? [])).sort();
  const technicianLabelCounts = new Map<string, number>();
  const technicianOptions = Array.from(
    new Map(
      (data?.rows ?? []).map((row) => [
        row.technician_id ?? UNKNOWN_TECHNICIAN_VALUE,
        row.technician_name?.trim() || "Unknown technician"
      ])
    ).entries()
  )
    .map(([value, label]) => {
      technicianLabelCounts.set(label, (technicianLabelCounts.get(label) ?? 0) + 1);

      return { value, label };
    })
    .sort((left, right) => left.label.localeCompare(right.label))
    .map(({ value, label }) => ({
      value,
      label:
        technicianLabelCounts.get(label)! > 1 && value !== UNKNOWN_TECHNICIAN_VALUE
          ? `${label} (${value.slice(0, 8)})`
          : label
    }));

  useEffect(() => {
    if (selectedCategory !== "all" && !categories.includes(selectedCategory)) {
      setSelectedCategory("all");
    }
  }, [categories, selectedCategory]);

  useEffect(() => {
    if (selectedTechnician !== "all" && !technicianOptions.some((option) => option.value === selectedTechnician)) {
      setSelectedTechnician("all");
    }
  }, [selectedTechnician, technicianOptions]);

  const filteredRows = (data?.rows ?? []).filter((row) => {
    if (selectedCategory !== "all" && row.category !== selectedCategory) {
      return false;
    }

    if ((row.technician_id ?? UNKNOWN_TECHNICIAN_VALUE) !== selectedTechnician && selectedTechnician !== "all") {
      return false;
    }

    if (onlyAnomalies && !row.anomaly_flag) {
      return false;
    }

    return true;
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <CardTitle>Expense Breakdown</CardTitle>
            <CardDescription>
              Detailed expense rows for the current scope, with anomaly flags and reasons.
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <span>Category</span>
              <select
                value={selectedCategory}
                onChange={(event) => setSelectedCategory(event.target.value)}
                className="h-10 rounded-xl border border-[color:var(--border)] bg-white px-3"
              >
                <option value="all">All categories</option>
                {categories.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <span>Technician</span>
              <select
                value={selectedTechnician}
                onChange={(event) => setSelectedTechnician(event.target.value)}
                className="h-10 rounded-xl border border-[color:var(--border)] bg-white px-3"
              >
                <option value="all">All technicians</option>
                {technicianOptions.map((technician) => (
                  <option key={technician.value} value={technician.value}>
                    {technician.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={onlyAnomalies}
                onChange={(event) => setOnlyAnomalies(event.target.checked)}
                className="h-4 w-4 rounded border-[color:var(--border)]"
              />
              <span>Anomalies only</span>
            </label>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 overflow-x-auto">
        {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
        {!error ? (
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-[var(--muted)]">
            <span>{filteredRows.length} visible rows</span>
            <span>
              Current total:{" "}
              {formatCurrency(filteredRows.reduce((sum, row) => sum + row.amount, 0))}
            </span>
          </div>
        ) : null}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Technician</TableHead>
              {scope.type !== "project" ? <TableHead>Project</TableHead> : null}
              <TableHead>Anomaly</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={scope.type === "project" ? 5 : 6} className="py-8 text-center text-[var(--muted)]">
                  No expense rows match the selected filters.
                </TableCell>
              </TableRow>
            ) : null}
            {filteredRows.map((row) => (
              <TableRow key={row.expense_id}>
                <TableCell>{new Date(row.date).toLocaleDateString("en-US")}</TableCell>
                <TableCell>{row.category}</TableCell>
                <TableCell>{formatCurrency(row.amount)}</TableCell>
                <TableCell>{row.technician_name ?? "Unknown"}</TableCell>
                {scope.type !== "project" ? <TableCell>{row.project_name ?? "Unknown"}</TableCell> : null}
                <TableCell>
                  {row.anomaly_flag ? (
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone="danger">{row.anomaly_type?.replaceAll("_", " ") ?? "flagged"}</Badge>
                        <Badge tone="warning">Needs review</Badge>
                      </div>
                      <p className="max-w-md text-xs leading-5 text-[var(--muted)]">{row.anomaly_reason}</p>
                    </div>
                  ) : (
                    <Badge tone="neutral">normal</Badge>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
