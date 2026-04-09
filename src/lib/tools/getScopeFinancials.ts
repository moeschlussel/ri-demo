import { z } from "zod";

import { roundNumber } from "@/lib/format";
import { getServerSupabaseClient } from "@/lib/supabase/serverClient";
import {
  assertScopeId,
  createScopedToolInputSchema,
  toNumber,
  toString,
  unwrapResponse,
  type GenericRow
} from "@/lib/tools/shared";

export const GetScopeFinancialsInput = createScopedToolInputSchema({});

export const GetScopeFinancialsOutput = z.object({
  scope: z.object({
    type: z.enum(["global", "org", "project"]),
    id: z.string().nullable(),
    name: z.string()
  }),
  revenue: z.number(),
  expenses: z.number(),
  net_profit: z.number(),
  margin_pct: z.number(),
  travel_spend: z.number(),
  equipment_spend: z.number(),
  anomaly_count: z.number(),
  project_count: z.number().optional()
});

type OrgFinancialRow = GenericRow & {
  org_id: string;
  org_name: string;
};

type ProjectFinancialRow = GenericRow & {
  project_id: string;
  project_name: string;
};

export type GetScopeFinancialsInputType = z.infer<typeof GetScopeFinancialsInput>;
export type GetScopeFinancialsOutputType = z.infer<typeof GetScopeFinancialsOutput>;

export async function getScopeFinancials(
  input: GetScopeFinancialsInputType
): Promise<GetScopeFinancialsOutputType> {
  const supabase = getServerSupabaseClient();

  if (input.scopeType === "global") {
    const rows = await unwrapResponse(
      supabase
        .from("org_financials_v")
        .select(
          "org_id, org_name, project_count, total_revenue, total_expenses, net_profit, margin_pct, travel_spend, equipment_spend, anomaly_count"
        ),
      "Failed loading global financials"
    );

    const aggregated = (rows as OrgFinancialRow[]).reduce(
      (accumulator, row) => ({
        revenue: accumulator.revenue + toNumber(row.total_revenue),
        expenses: accumulator.expenses + toNumber(row.total_expenses),
        netProfit: accumulator.netProfit + toNumber(row.net_profit),
        travelSpend: accumulator.travelSpend + toNumber(row.travel_spend),
        equipmentSpend: accumulator.equipmentSpend + toNumber(row.equipment_spend),
        anomalyCount: accumulator.anomalyCount + toNumber(row.anomaly_count),
        projectCount: accumulator.projectCount + toNumber(row.project_count)
      }),
      {
        revenue: 0,
        expenses: 0,
        netProfit: 0,
        travelSpend: 0,
        equipmentSpend: 0,
        anomalyCount: 0,
        projectCount: 0
      }
    );

    return GetScopeFinancialsOutput.parse({
      scope: {
        type: "global",
        id: null,
        name: "All Organizations"
      },
      revenue: roundNumber(aggregated.revenue),
      expenses: roundNumber(aggregated.expenses),
      net_profit: roundNumber(aggregated.netProfit),
      margin_pct: aggregated.revenue > 0 ? roundNumber((aggregated.netProfit / aggregated.revenue) * 100) : 0,
      travel_spend: roundNumber(aggregated.travelSpend),
      equipment_spend: roundNumber(aggregated.equipmentSpend),
      anomaly_count: aggregated.anomalyCount,
      project_count: aggregated.projectCount
    });
  }

  if (input.scopeType === "org") {
    const row = await unwrapResponse(
      supabase
        .from("org_financials_v")
        .select(
          "org_id, org_name, project_count, total_revenue, total_expenses, net_profit, margin_pct, travel_spend, equipment_spend, anomaly_count"
        )
        .eq("org_id", assertScopeId(input))
        .single(),
      "Failed loading organization financials"
    );

    const orgRow = row as OrgFinancialRow;
    return GetScopeFinancialsOutput.parse({
      scope: {
        type: "org",
        id: orgRow.org_id,
        name: toString(orgRow.org_name, "Organization")
      },
      revenue: roundNumber(toNumber(orgRow.total_revenue)),
      expenses: roundNumber(toNumber(orgRow.total_expenses)),
      net_profit: roundNumber(toNumber(orgRow.net_profit)),
      margin_pct: roundNumber(toNumber(orgRow.margin_pct)),
      travel_spend: roundNumber(toNumber(orgRow.travel_spend)),
      equipment_spend: roundNumber(toNumber(orgRow.equipment_spend)),
      anomaly_count: toNumber(orgRow.anomaly_count),
      project_count: toNumber(orgRow.project_count)
    });
  }

  const row = await unwrapResponse(
    supabase
      .from("project_financials_v")
      .select(
        "project_id, project_name, total_revenue, total_expenses, net_profit, margin_pct, travel_spend, equipment_spend, anomaly_count"
      )
      .eq("project_id", assertScopeId(input))
      .single(),
    "Failed loading project financials"
  );

  const projectRow = row as ProjectFinancialRow;
  return GetScopeFinancialsOutput.parse({
    scope: {
      type: "project",
      id: projectRow.project_id,
      name: toString(projectRow.project_name, "Project")
    },
    revenue: roundNumber(toNumber(projectRow.total_revenue)),
    expenses: roundNumber(toNumber(projectRow.total_expenses)),
    net_profit: roundNumber(toNumber(projectRow.net_profit)),
    margin_pct: roundNumber(toNumber(projectRow.margin_pct)),
    travel_spend: roundNumber(toNumber(projectRow.travel_spend)),
    equipment_spend: roundNumber(toNumber(projectRow.equipment_spend)),
    anomaly_count: toNumber(projectRow.anomaly_count)
  });
}
