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
  const resolvedChildren = await toolRegistry.resolve_scope_entities.handler({
    scopeType: "org",
    scopeId: homeDepot.id,
    queries: [
      "how was the miami project and was there anything i should look at from the trip",
      "compare seattle to miami"
    ],
    entityTypes: ["project"],
    limitPerQuery: 5
  });
  const resolvedTechnicianAndCategory = await toolRegistry.resolve_scope_entities.handler({
    scopeType: "org",
    scopeId: homeDepot.id,
    queries: ["what did aisha spend on flights"],
    entityTypes: ["technician", "category"],
    limitPerQuery: 5
  });
  const miamiProjectMatch = resolvedChildren.results[0]?.matches.find((match) => match.entityType === "project");
  const aishaMatch = resolvedTechnicianAndCategory.results[0]?.matches.find((match) => match.entityType === "technician");
  const flightMatch = resolvedTechnicianAndCategory.results[0]?.matches.find((match) => match.entityType === "category");
  const filteredExpenses =
    aishaMatch && flightMatch
      ? await toolRegistry.get_expense_breakdown.handler({
          scopeType: "org",
          scopeId: homeDepot.id,
          technicianIds: aishaMatch.id ? [aishaMatch.id] : undefined,
          categories: [flightMatch.canonicalValue],
          limit: 10
        })
      : null;
  const tripSummary = miamiProjectMatch
      ? await toolRegistry.get_trip_summary.handler({
          scopeType: "org",
          scopeId: homeDepot.id,
          projectIds: miamiProjectMatch.id ? [miamiProjectMatch.id] : undefined,
          includeExpenses: false,
          limitTrips: 3
        })
    : null;
  const filteredAnomalies =
    miamiProjectMatch && aishaMatch
      ? await toolRegistry.detect_anomalies.handler({
          scopeType: "org",
          scopeId: homeDepot.id,
          projectIds: miamiProjectMatch.id ? [miamiProjectMatch.id] : undefined,
          technicianIds: aishaMatch.id ? [aishaMatch.id] : undefined,
          lookbackMonths: 24
        })
      : null;
  const latestMiamiTrip = tripSummary?.trips[0];
  const latestMiamiTripDetails =
    latestMiamiTrip?.technician_id && latestMiamiTrip.project_id
      ? await toolRegistry.get_trip_summary.handler({
          scopeType: "org",
          scopeId: homeDepot.id,
          projectIds: [latestMiamiTrip.project_id],
          technicianIds: [latestMiamiTrip.technician_id],
          exactDate: latestMiamiTrip.trip_date,
          includeExpenses: true,
          limitTrips: 1
        })
      : null;
  const tripScopedAnomalies =
    latestMiamiTrip?.technician_id && latestMiamiTrip.project_id
      ? await toolRegistry.detect_anomalies.handler({
          scopeType: "org",
          scopeId: homeDepot.id,
          projectIds: [latestMiamiTrip.project_id],
          technicianIds: [latestMiamiTrip.technician_id],
          exactDate: latestMiamiTrip.trip_date,
          lookbackMonths: 24
        })
      : null;
  const travelOnlyExpenses =
    latestMiamiTrip?.technician_id && latestMiamiTrip.project_id
      ? await toolRegistry.get_expense_breakdown.handler({
          scopeType: "org",
          scopeId: homeDepot.id,
          projectIds: [latestMiamiTrip.project_id],
          technicianIds: [latestMiamiTrip.technician_id],
          exactDate: latestMiamiTrip.trip_date,
          categories: ["flights", "hotel", "food"],
          limit: 20
        })
      : null;
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
        resolvedChildren: resolvedChildren.results.map((result) => ({
          query: result.query,
          matches: result.matches.map((match) => ({
            entityType: match.entityType,
            name: match.name,
            canonicalValue: match.canonicalValue,
            relationship: match.relationship
          }))
        })),
        resolvedTechnicianAndCategory: resolvedTechnicianAndCategory.results.map((result) => ({
          query: result.query,
          matches: result.matches.map((match) => ({
            entityType: match.entityType,
            name: match.name,
            canonicalValue: match.canonicalValue
          }))
        })),
        filteredExpenseCount: filteredExpenses?.total_count ?? 0,
        filteredAnomalyCount: filteredAnomalies?.count ?? 0,
        tripSummary: tripSummary?.trips.map((trip) => ({
          tripDate: trip.trip_date,
          projectName: trip.project_name,
          technicianName: trip.technician_name,
          totalAmount: trip.total_amount,
          anomalyCount: trip.anomaly_count
        })),
        latestMiamiTripDetails: latestMiamiTripDetails?.trips[0]
          ? {
              tripDate: latestMiamiTripDetails.trips[0].trip_date,
              technicianName: latestMiamiTripDetails.trips[0].technician_name,
              expenseCount: latestMiamiTripDetails.trips[0].expense_count,
              categories: latestMiamiTripDetails.trips[0].categories
            }
          : null,
        tripScopedAnomalyCount: tripScopedAnomalies?.count ?? 0,
        travelOnlyExpenseCount: travelOnlyExpenses?.total_count ?? 0,
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
