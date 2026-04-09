import { z } from "zod";

import { roundNumber } from "@/lib/format";
import { getServerSupabaseClient } from "@/lib/supabase/serverClient";
import {
  aggregateByMonth,
  formatMonthKey,
  toNumber,
  toString,
  unwrapResponse,
  type GenericRow
} from "@/lib/tools/shared";

export const GetTravelTrendInput = z.object({
  scopeType: z.enum(["global", "org", "project"]),
  scopeId: z.string().uuid().optional(),
  months: z.number().int().min(1).max(36).optional().default(24)
});

export const GetTravelTrendOutput = z.object({
  months: z.array(
    z.object({
      month: z.string(),
      total_travel_spend: z.number(),
      survey_count: z.number(),
      avg_travel_cost_per_survey: z.number()
    })
  ),
  summary: z.object({
    avg_of_avgs: z.number(),
    first_month_avg: z.number(),
    last_month_avg: z.number(),
    pct_change: z.number()
  })
});

type MonthlyTravelTrendRow = GenericRow & {
  month: string;
};

export type GetTravelTrendInputType = z.infer<typeof GetTravelTrendInput>;
export type GetTravelTrendOutputType = z.infer<typeof GetTravelTrendOutput>;

export async function getTravelTrend(input: GetTravelTrendInputType): Promise<GetTravelTrendOutputType> {
  const supabase = getServerSupabaseClient();

  let query = supabase
    .from("monthly_travel_trends_v")
    .select("month, org_id, project_id, survey_count, total_travel_spend, avg_travel_cost_per_survey")
    .order("month", { ascending: true });

  if (input.scopeType === "org") {
    query = query.eq("org_id", input.scopeId ?? "");
  }

  if (input.scopeType === "project") {
    query = query.eq("project_id", input.scopeId ?? "");
  }

  const rows = (await unwrapResponse(query, "Failed loading travel trend")) as MonthlyTravelTrendRow[];
  const aggregatedRows = aggregateByMonth(
    rows.map((row) => ({
      month: formatMonthKey(toString(row.month)),
      totalTravelSpend: toNumber(row.total_travel_spend),
      surveyCount: toNumber(row.survey_count)
    }))
  );

  const months = aggregatedRows.slice(-input.months);
  const firstMonthAverage = months[0]?.avgTravelCostPerSurvey ?? 0;
  const lastMonthAverage = months.at(-1)?.avgTravelCostPerSurvey ?? 0;
  const averageOfAverages =
    months.length > 0
      ? roundNumber(months.reduce((sum, row) => sum + row.avgTravelCostPerSurvey, 0) / months.length)
      : 0;

  return GetTravelTrendOutput.parse({
    months: months.map((row) => ({
      month: row.month,
      total_travel_spend: row.totalTravelSpend,
      survey_count: row.surveyCount,
      avg_travel_cost_per_survey: row.avgTravelCostPerSurvey
    })),
    summary: {
      avg_of_avgs: averageOfAverages,
      first_month_avg: firstMonthAverage,
      last_month_avg: lastMonthAverage,
      pct_change: firstMonthAverage > 0 ? roundNumber(((lastMonthAverage - firstMonthAverage) / firstMonthAverage) * 100) : 0
    }
  });
}
