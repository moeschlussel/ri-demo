import { z } from "zod";

import { roundNumber } from "@/lib/format";
import { getServerSupabaseClient } from "@/lib/supabase/serverClient";
import {
  TRAVEL_CATEGORIES,
  assertScopeId,
  createScopedToolInputSchema,
  formatMonthKey,
  toNumber,
  toString,
  unwrapResponse,
  type GenericRow
} from "@/lib/tools/shared";

export const ForecastExpensesInput = createScopedToolInputSchema({
  lookbackMonths: z.number().int().min(1).max(12).optional().default(3),
  horizonMonths: z.number().int().min(1).max(12).optional().default(3)
});

export const ForecastExpensesOutput = z.object({
  lookback_avg_monthly_expenses: z.number(),
  lookback_avg_monthly_travel: z.number(),
  projected_total_expenses: z.number(),
  projected_total_travel: z.number(),
  scenarios: z.object({
    base: z.number(),
    upside: z.number(),
    downside: z.number()
  }),
  methodology: z.string()
});

type ExpenseRow = GenericRow & {
  date: string;
  category: string;
};

export type ForecastExpensesInputType = z.infer<typeof ForecastExpensesInput>;
export type ForecastExpensesOutputType = z.infer<typeof ForecastExpensesOutput>;

export async function forecastExpenses(
  input: ForecastExpensesInputType
): Promise<ForecastExpensesOutputType> {
  const supabase = getServerSupabaseClient();

  let query = supabase
    .from("expense_anomalies_v")
    .select("project_id, org_id, date, category, amount")
    .order("date", { ascending: true });

  if (input.scopeType === "org") {
    query = query.eq("org_id", assertScopeId(input));
  }

  if (input.scopeType === "project") {
    query = query.eq("project_id", assertScopeId(input));
  }

  const rows = (await unwrapResponse(query, "Failed loading expense history")) as ExpenseRow[];
  const months = [...new Set(rows.map((row) => formatMonthKey(toString(row.date))))].sort();
  const selectedMonths = months.slice(-input.lookbackMonths);
  const selectedMonthSet = new Set(selectedMonths);

  const monthlyTotals = new Map<string, { expenses: number; travel: number }>();
  for (const month of selectedMonths) {
    monthlyTotals.set(month, { expenses: 0, travel: 0 });
  }

  for (const row of rows) {
    const month = formatMonthKey(toString(row.date));
    if (!selectedMonthSet.has(month)) {
      continue;
    }

    const current = monthlyTotals.get(month);
    if (!current) {
      continue;
    }

    const amount = toNumber(row.amount);
    current.expenses += amount;
    if (TRAVEL_CATEGORIES.includes(toString(row.category) as (typeof TRAVEL_CATEGORIES)[number])) {
      current.travel += amount;
    }
  }

  const values = [...monthlyTotals.values()];
  const averageMonthlyExpenses =
    values.length > 0 ? roundNumber(values.reduce((sum, value) => sum + value.expenses, 0) / values.length) : 0;
  const averageMonthlyTravel =
    values.length > 0 ? roundNumber(values.reduce((sum, value) => sum + value.travel, 0) / values.length) : 0;

  const projectedTotalExpenses = roundNumber(averageMonthlyExpenses * input.horizonMonths);
  const projectedTotalTravel = roundNumber(averageMonthlyTravel * input.horizonMonths);

  return ForecastExpensesOutput.parse({
    lookback_avg_monthly_expenses: averageMonthlyExpenses,
    lookback_avg_monthly_travel: averageMonthlyTravel,
    projected_total_expenses: projectedTotalExpenses,
    projected_total_travel: projectedTotalTravel,
    scenarios: {
      base: projectedTotalExpenses,
      upside: roundNumber(projectedTotalExpenses * 1.1),
      downside: roundNumber(projectedTotalExpenses * 0.9)
    },
    methodology: `Trailing ${input.lookbackMonths}-month average × ${input.horizonMonths} month horizon`
  });
}
