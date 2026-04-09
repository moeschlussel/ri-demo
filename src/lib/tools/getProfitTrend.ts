import { z } from "zod";

import { roundNumber } from "@/lib/format";
import { getServerSupabaseClient } from "@/lib/supabase/serverClient";
import {
  assertScopeId,
  createScopedToolInputSchema,
  formatMonthKey,
  toNumber,
  toString,
  unwrapResponse,
  type GenericRow
} from "@/lib/tools/shared";

export const GetProfitTrendInput = createScopedToolInputSchema({
  months: z.number().int().min(1).max(36).optional().default(24)
});

export const GetProfitTrendOutput = z.object({
  months: z.array(
    z.object({
      month: z.string(),
      total_revenue: z.number(),
      total_expenses: z.number(),
      net_profit: z.number()
    })
  ),
  summary: z.object({
    avg_monthly_profit: z.number(),
    first_month_profit: z.number(),
    last_month_profit: z.number(),
    pct_change: z.number()
  })
});

type RevenueRow = GenericRow & {
  amount: number;
  date: string;
};

type ExpenseRow = GenericRow & {
  amount: number;
  date: string;
};

type MonthlyProfitTrendRow = GenericRow & {
  month: string;
};

type ProjectIdRow = GenericRow & {
  id: string;
};

export type GetProfitTrendInputType = z.infer<typeof GetProfitTrendInput>;
export type GetProfitTrendOutputType = z.infer<typeof GetProfitTrendOutput>;

function emptyProfitTrend(): GetProfitTrendOutputType {
  return GetProfitTrendOutput.parse({
    months: [],
    summary: {
      avg_monthly_profit: 0,
      first_month_profit: 0,
      last_month_profit: 0,
      pct_change: 0
    }
  });
}

function buildProfitTrend(monthlyTotals: Map<string, { revenue: number; expenses: number }>, months: number): GetProfitTrendOutputType {
  const series = [...monthlyTotals.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .slice(-months)
    .map(([month, value]) => {
      const totalRevenue = roundNumber(value.revenue);
      const totalExpenses = roundNumber(value.expenses);
      return {
        month,
        total_revenue: totalRevenue,
        total_expenses: totalExpenses,
        net_profit: roundNumber(totalRevenue - totalExpenses)
      };
    });

  const firstMonthProfit = series[0]?.net_profit ?? 0;
  const lastMonthProfit = series.at(-1)?.net_profit ?? 0;
  const averageMonthlyProfit =
    series.length > 0 ? roundNumber(series.reduce((sum, row) => sum + row.net_profit, 0) / series.length) : 0;
  const pctChange =
    firstMonthProfit !== 0
      ? roundNumber(((lastMonthProfit - firstMonthProfit) / Math.abs(firstMonthProfit)) * 100)
      : 0;

  return GetProfitTrendOutput.parse({
    months: series,
    summary: {
      avg_monthly_profit: averageMonthlyProfit,
      first_month_profit: firstMonthProfit,
      last_month_profit: lastMonthProfit,
      pct_change: pctChange
    }
  });
}

function isMissingProfitTrendViewError(message: string): boolean {
  return (
    message.includes("monthly_profit_trends_v") &&
    (message.includes("does not exist") || message.includes("Could not find") || message.includes("schema cache"))
  );
}

async function getScopedProjectIds(input: GetProfitTrendInputType): Promise<string[] | null> {
  if (input.scopeType === "global") {
    return null;
  }

  if (input.scopeType === "project") {
    return [assertScopeId(input)];
  }

  const supabase = getServerSupabaseClient();
  const rows = await unwrapResponse(
    supabase.from("projects").select("id").eq("org_id", assertScopeId(input)),
    "Failed loading organization projects"
  );

  return (rows as ProjectIdRow[]).map((row) => toString(row.id)).filter(Boolean);
}

async function getProfitTrendFromView(input: GetProfitTrendInputType): Promise<GetProfitTrendOutputType> {
  const supabase = getServerSupabaseClient();
  let query = supabase
    .from("monthly_profit_trends_v")
    .select("month, org_id, project_id, total_revenue, total_expenses, net_profit")
    .order("month", { ascending: true });

  if (input.scopeType === "org") {
    query = query.eq("org_id", assertScopeId(input));
  }

  if (input.scopeType === "project") {
    query = query.eq("project_id", assertScopeId(input));
  }

  const rows = (await unwrapResponse(query, "Failed loading profit trend")) as MonthlyProfitTrendRow[];
  const monthlyTotals = new Map<string, { revenue: number; expenses: number }>();

  for (const row of rows) {
    const month = formatMonthKey(toString(row.month));
    const current = monthlyTotals.get(month) ?? { revenue: 0, expenses: 0 };
    current.revenue += toNumber(row.total_revenue);
    current.expenses += toNumber(row.total_expenses);
    monthlyTotals.set(month, current);
  }

  return buildProfitTrend(monthlyTotals, input.months);
}

async function getProfitTrendFromBaseTables(input: GetProfitTrendInputType): Promise<GetProfitTrendOutputType> {
  const supabase = getServerSupabaseClient();
  const projectIds = await getScopedProjectIds(input);

  if (projectIds?.length === 0) {
    return emptyProfitTrend();
  }

  let revenueQuery = supabase.from("revenue").select("date, amount, project_id").order("date", { ascending: true });
  let expenseQuery = supabase.from("expenses").select("date, amount, project_id").order("date", { ascending: true });

  if (projectIds) {
    revenueQuery = revenueQuery.in("project_id", projectIds);
    expenseQuery = expenseQuery.in("project_id", projectIds);
  }

  const [revenueRows, expenseRows] = await Promise.all([
    unwrapResponse(revenueQuery, "Failed loading profit trend revenue"),
    unwrapResponse(expenseQuery, "Failed loading profit trend expenses")
  ]);

  const monthlyTotals = new Map<string, { revenue: number; expenses: number }>();

  for (const row of revenueRows as RevenueRow[]) {
    const month = formatMonthKey(toString(row.date));
    const current = monthlyTotals.get(month) ?? { revenue: 0, expenses: 0 };
    current.revenue += toNumber(row.amount);
    monthlyTotals.set(month, current);
  }

  for (const row of expenseRows as ExpenseRow[]) {
    const month = formatMonthKey(toString(row.date));
    const current = monthlyTotals.get(month) ?? { revenue: 0, expenses: 0 };
    current.expenses += toNumber(row.amount);
    monthlyTotals.set(month, current);
  }

  return buildProfitTrend(monthlyTotals, input.months);
}

export async function getProfitTrend(input: GetProfitTrendInputType): Promise<GetProfitTrendOutputType> {
  try {
    return await getProfitTrendFromView(input);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed loading profit trend";
    if (!isMissingProfitTrendViewError(message)) {
      throw error;
    }

    return getProfitTrendFromBaseTables(input);
  }
}
