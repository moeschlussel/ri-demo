import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { getServerSupabaseClient } from "../src/lib/supabase/serverClient";
import { toolRegistry } from "../src/lib/tools/toolRegistry";

function loadLocalEnv() {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!existsSync(envPath)) {
    return;
  }

  const contents = readFileSync(envPath, "utf8");
  for (const line of contents.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex);
    const value = trimmed.slice(separatorIndex + 1);
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

async function main() {
  loadLocalEnv();

  const supabase = getServerSupabaseClient();
  const { data: organizations, error } = await supabase
    .from("organizations")
    .select("id, name")
    .order("name", { ascending: true });

  if (error || !organizations || organizations.length === 0) {
    throw new Error(`Failed loading organizations: ${error?.message ?? "No rows returned"}`);
  }

  const homeDepot = organizations.find((organization) => organization.name.includes("Home Depot")) ?? organizations[0];
  const { data: projects, error: projectError } = await supabase
    .from("projects")
    .select("id, name")
    .eq("org_id", homeDepot.id)
    .order("name", { ascending: true });

  if (projectError || !projects || projects.length === 0) {
    throw new Error(`Failed loading projects: ${projectError?.message ?? "No rows returned"}`);
  }

  const project = projects[0];
  const globalFinancials = await toolRegistry.get_scope_financials.handler({ scopeType: "global" });
  const orgFinancials = await toolRegistry.get_scope_financials.handler({
    scopeType: "org",
    scopeId: homeDepot.id
  });
  const projectFinancials = await toolRegistry.get_scope_financials.handler({
    scopeType: "project",
    scopeId: project.id
  });
  const expenseBreakdown = await toolRegistry.get_expense_breakdown.handler({
    scopeType: "org",
    scopeId: homeDepot.id,
    limit: 20
  });
  const travelTrend = await toolRegistry.get_travel_trend.handler({
    scopeType: "global",
    months: 24
  });
  const anomalies = await toolRegistry.detect_anomalies.handler({
    scopeType: "global",
    lookbackMonths: 12
  });
  const forecast = await toolRegistry.forecast_expenses.handler({
    scopeType: "global",
    lookbackMonths: 3,
    horizonMonths: 3
  });

  console.log(
    JSON.stringify(
      {
        scopes: {
          global: globalFinancials.scope.name,
          org: orgFinancials.scope.name,
          project: projectFinancials.scope.name
        },
        headline: {
          globalRevenue: globalFinancials.revenue,
          orgMargin: orgFinancials.margin_pct,
          projectProfit: projectFinancials.net_profit
        },
        breakdownRows: expenseBreakdown.rows.length,
        travelMonths: travelTrend.months.length,
        anomalyCount: anomalies.count,
        anomalyTypes: anomalies.by_type,
        forecast
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
