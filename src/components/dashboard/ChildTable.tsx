import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency, formatPercent } from "@/lib/format";
import type { ChildOrganizationRow, ChildProjectRow, Scope } from "@/lib/types";

export function ChildTable({
  scope,
  organizations,
  projects
}: {
  scope: Scope;
  organizations?: ChildOrganizationRow[];
  projects?: ChildProjectRow[];
}) {
  if (scope.type === "project") {
    return null;
  }

  const rows = scope.type === "global" ? organizations ?? [] : projects ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>{scope.type === "global" ? "Organization Snapshot" : "Project Snapshot"}</CardTitle>
        <CardDescription>
          {scope.type === "global"
            ? "Click an organization to drill into its live margin and anomaly profile."
            : "Project-level financials within the current organization."}
        </CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{scope.type === "global" ? "Organization" : "Project"}</TableHead>
              {scope.type === "org" ? <TableHead>Status</TableHead> : null}
              {scope.type === "org" ? <TableHead>Budget</TableHead> : null}
              <TableHead>Revenue</TableHead>
              <TableHead>Expenses</TableHead>
              <TableHead>Net Profit</TableHead>
              <TableHead>Margin</TableHead>
              <TableHead>Travel</TableHead>
              <TableHead>Anomalies</TableHead>
              {scope.type === "global" ? <TableHead>Projects</TableHead> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={scope.type === "global" ? 8 : 9} className="py-8 text-center text-[var(--muted)]">
                  No child records available for this scope.
                </TableCell>
              </TableRow>
            ) : null}
            {scope.type === "global"
              ? (rows as ChildOrganizationRow[]).map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-semibold">
                      <Link href={`/org/${row.id}`} className="transition hover:text-[var(--accent)]">
                        {row.name}
                      </Link>
                    </TableCell>
                    <TableCell>{formatCurrency(row.totalRevenue)}</TableCell>
                    <TableCell>{formatCurrency(row.totalExpenses)}</TableCell>
                    <TableCell>{formatCurrency(row.netProfit)}</TableCell>
                    <TableCell>{formatPercent(row.marginPct)}</TableCell>
                    <TableCell>{formatCurrency(row.travelSpend)}</TableCell>
                    <TableCell>
                      <Badge tone={row.anomalyCount > 0 ? "danger" : "neutral"}>{row.anomalyCount}</Badge>
                    </TableCell>
                    <TableCell>{row.projectCount}</TableCell>
                  </TableRow>
                ))
              : (rows as ChildProjectRow[]).map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-semibold">
                      <Link href={`/project/${row.id}`} className="transition hover:text-[var(--accent)]">
                        {row.name}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge tone={row.status === "on_hold" ? "warning" : "accent"}>{row.status}</Badge>
                    </TableCell>
                    <TableCell>{formatCurrency(row.budget)}</TableCell>
                    <TableCell>{formatCurrency(row.totalRevenue)}</TableCell>
                    <TableCell>{formatCurrency(row.totalExpenses)}</TableCell>
                    <TableCell>{formatCurrency(row.netProfit)}</TableCell>
                    <TableCell>{formatPercent(row.marginPct)}</TableCell>
                    <TableCell>{formatCurrency(row.travelSpend)}</TableCell>
                    <TableCell>
                      <Badge tone={row.anomalyCount > 0 ? "danger" : "neutral"}>{row.anomalyCount}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

