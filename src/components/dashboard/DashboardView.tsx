import { AlertCircle, Building2, FolderKanban } from "lucide-react";

import { Breadcrumbs } from "@/components/dashboard/Breadcrumbs";
import { ChildTable } from "@/components/dashboard/ChildTable";
import { ExpenseBreakdownTable } from "@/components/dashboard/ExpenseBreakdownTable";
import { NetProfitTrendChart } from "@/components/dashboard/NetProfitTrendChart";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { KpiCards } from "@/components/dashboard/KpiCards";
import { CfoChatSidebar } from "@/components/chat/CfoChatSidebar";
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency, formatPercent } from "@/lib/format";
import { getChildOrganizationRows, getChildProjectRows, getNavigationTree } from "@/lib/dashboard/queries";
import { toolRegistry } from "@/lib/tools/toolRegistry";
import type { ChildOrganizationRow, ChildProjectRow, Scope } from "@/lib/types";

function scopeToToolInput(scope: Scope): { scopeType: "global" | "org" | "project"; scopeId?: string } {
  if (scope.type === "global") {
    return { scopeType: "global" };
  }

  return {
    scopeType: scope.type,
    scopeId: scope.id
  };
}

function ErrorCard({ message }: { message: string }) {
  return (
    <Card>
      <CardContent className="flex items-start gap-3 p-5 text-sm text-[var(--danger)]">
        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
        <p>{message}</p>
      </CardContent>
    </Card>
  );
}

export async function DashboardView({ scope }: { scope: Scope }) {
  const toolInput = scopeToToolInput(scope);

  const [financialsResult, profitTrendResult, expenseBreakdownResult, anomaliesResult, childRowsResult, navigationResult] =
    await Promise.allSettled([
      toolRegistry.get_scope_financials.handler(toolInput),
      toolRegistry.get_profit_trend.handler({ ...toolInput, months: 24 }),
      toolRegistry.get_expense_breakdown.handler({ ...toolInput, limit: 200 }),
      toolRegistry.detect_anomalies.handler({ ...toolInput, lookbackMonths: 12 }),
      scope.type === "global"
        ? getChildOrganizationRows()
        : scope.type === "org"
          ? getChildProjectRows(scope.id)
          : Promise.resolve(null),
      getNavigationTree()
    ]);

  const scopeCopy =
    scope.type === "global"
      ? {
          eyebrow: "Enterprise Overview",
          title: "Robotic Imaging financial health",
          description: "Cross-account profitability, net profit momentum, and anomaly pressure across the full business."
        }
      : scope.type === "org"
        ? {
            eyebrow: "Organization View",
            title: scope.name,
            description: "Margin, net profit momentum, and anomaly pressure for this client organization."
          }
        : {
            eyebrow: "Project View",
            title: scope.name,
            description: `Project-level financial clarity for ${scope.orgName}.`
          };
  const childOrganizations =
    scope.type === "global" && childRowsResult.status === "fulfilled"
      ? (childRowsResult.value as ChildOrganizationRow[])
      : [];
  const childProjects =
    scope.type === "org" && childRowsResult.status === "fulfilled"
      ? (childRowsResult.value as ChildProjectRow[])
      : [];
  const navigationError =
    navigationResult.status === "rejected"
      ? navigationResult.reason instanceof Error
        ? navigationResult.reason.message
        : "Failed loading navigation."
      : undefined;

  const content = (
    <>
      {navigationError ? <ErrorCard message={navigationError} /> : null}

      <section className="rounded-[2rem] border border-[color:var(--border)] bg-[var(--surface)] px-6 py-6 shadow-[0_14px_40px_rgba(15,23,42,0.05)] backdrop-blur">
        <div className="flex flex-col gap-4">
          <div className="space-y-3">
            <Breadcrumbs scope={scope} />
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--accent)]">
                {scopeCopy.eyebrow}
              </p>
              <h1 className="text-3xl font-semibold tracking-tight text-slate-950">{scopeCopy.title}</h1>
              <p className="max-w-3xl text-base leading-7 text-[var(--muted)]">{scopeCopy.description}</p>
            </div>
          </div>
          {financialsResult.status === "fulfilled" ? (
            <div className="inline-grid grid-cols-3 gap-3 rounded-2xl bg-slate-950 p-4 text-white">
              <div className="space-y-1">
                <p className="text-xs uppercase tracking-[0.08em] text-slate-300">Profit</p>
                <p className="text-base font-semibold whitespace-nowrap">{formatCurrency(financialsResult.value.net_profit)}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs uppercase tracking-[0.08em] text-slate-300">Margin</p>
                <p className="text-base font-semibold whitespace-nowrap">{formatPercent(financialsResult.value.margin_pct)}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs uppercase tracking-[0.08em] text-slate-300">Travel</p>
                <p className="text-base font-semibold whitespace-nowrap">{formatCurrency(financialsResult.value.travel_spend)}</p>
              </div>
            </div>
          ) : null}
        </div>
      </section>

      {financialsResult.status === "fulfilled" ? (
        <KpiCards
          financials={financialsResult.value}
          anomalies={anomaliesResult.status === "fulfilled" ? anomaliesResult.value : undefined}
          anomaliesError={
            anomaliesResult.status === "rejected"
              ? anomaliesResult.reason instanceof Error
                ? anomaliesResult.reason.message
                : "Failed loading anomaly details."
              : undefined
          }
        />
      ) : (
        <ErrorCard message={financialsResult.reason instanceof Error ? financialsResult.reason.message : "Failed loading KPIs."} />
      )}

      <NetProfitTrendChart
        data={profitTrendResult.status === "fulfilled" ? profitTrendResult.value : undefined}
        error={profitTrendResult.status === "rejected" ? "Failed loading net profit trend data." : undefined}
      />

      {scope.type === "global" ? (
        <ChildTable scope={scope} organizations={childOrganizations} />
      ) : scope.type === "org" ? (
        <ChildTable scope={scope} projects={childProjects} />
      ) : (
        <Card>
          <CardContent className="flex items-center gap-4 p-5 text-sm text-[var(--muted)]">
            <FolderKanban className="h-5 w-5 text-[var(--accent)]" />
            Project scope hides the child table and prioritizes individual expense detail instead.
          </CardContent>
        </Card>
      )}

      <ExpenseBreakdownTable
        scope={scope}
        data={expenseBreakdownResult.status === "fulfilled" ? expenseBreakdownResult.value : undefined}
        error={expenseBreakdownResult.status === "rejected" ? "Failed loading expense breakdown." : undefined}
      />

      {scope.type === "global" ? (
        <Card>
          <CardContent className="flex items-center gap-3 p-5 text-sm text-[var(--muted)]">
            <Building2 className="h-5 w-5 text-[var(--accent)]" />
            The global view inherits scope into chat automatically. Ask about profitability, profit trends, or audit findings without naming the organization unless you want to override the current page.
          </CardContent>
        </Card>
      ) : null}
    </>
  );

  if (navigationResult.status === "fulfilled") {
    return (
      <DashboardShell scope={scope} navigation={navigationResult.value} chat={<CfoChatSidebar scope={scope} />}>
        {content}
      </DashboardShell>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--background)] px-4 py-6 lg:px-8">
      <div className="mx-auto grid max-w-[1680px] gap-6 xl:grid-cols-[minmax(0,1fr)_23rem]">
        <main className="min-w-0 space-y-6">{content}</main>
        <aside className="min-w-0">
          <CfoChatSidebar scope={scope} />
        </aside>
      </div>
    </div>
  );
}
