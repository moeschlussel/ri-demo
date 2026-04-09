import { z } from "zod";

import { roundNumber } from "@/lib/format";
import { getServerSupabaseClient } from "@/lib/supabase/serverClient";
import {
  assertScopeId,
  coerceAnomalyType,
  createScopedToolInputSchema,
  formatDateOnly,
  normalizeExpenseCategories,
  normalizeOptionalDate,
  subtractMonths,
  toNumber,
  toNullableString,
  toString,
  unwrapResponse,
  type GenericRow
} from "@/lib/tools/shared";

export const DetectAnomaliesInput = createScopedToolInputSchema({
  technicianIds: z.array(z.string().uuid()).max(10).optional(),
  projectIds: z.array(z.string().uuid()).max(10).optional(),
  categories: z.array(z.string()).optional(),
  exactDate: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  lookbackMonths: z.number().int().min(1).max(36).optional().default(12)
});

export const DetectAnomaliesOutput = z.object({
  anomalies: z.array(
    z.object({
      expense_id: z.string(),
      project_id: z.string().nullable(),
      technician_id: z.string().nullable(),
      trip_date: z.string(),
      type: z.enum(["duplicate", "category_outlier", "unauthorized_category", "large_equipment"]),
      reason: z.string(),
      amount: z.number(),
      category: z.string(),
      technician_name: z.string().nullable(),
      project_name: z.string().nullable(),
      date: z.string()
    })
  ),
  count: z.number(),
  by_type: z.record(z.string(), z.number()),
  total_flagged_amount: z.number()
});

type AnomalyRow = GenericRow & {
  expense_id: string;
  project_id: string | null;
  user_id: string | null;
  date: string;
};

export type DetectAnomaliesInputType = z.infer<typeof DetectAnomaliesInput>;
export type DetectAnomaliesOutputType = z.infer<typeof DetectAnomaliesOutput>;

export async function detectAnomalies(input: DetectAnomaliesInputType): Promise<DetectAnomaliesOutputType> {
  const supabase = getServerSupabaseClient();
  const categories = normalizeExpenseCategories(input.categories ?? []);
  const exactDate = normalizeOptionalDate(input.exactDate);
  const startDate = normalizeOptionalDate(input.startDate);
  const endDate = normalizeOptionalDate(input.endDate);
  const hasExplicitDateFilter = Boolean(exactDate || startDate || endDate);
  const cutoff = hasExplicitDateFilter ? null : subtractMonths(new Date(), input.lookbackMonths);

  let query = supabase
    .from("expense_anomalies_v")
    .select("expense_id, project_id, org_id, user_id, technician_name, project_name, date, category, amount, anomaly_type, anomaly_reason")
    .eq("anomaly_flag", true)
    .order("date", { ascending: false });

  if (cutoff) {
    query = query.gte("date", cutoff.toISOString());
  }

  if (input.scopeType === "org") {
    query = query.eq("org_id", assertScopeId(input));
  }

  if (input.scopeType === "project") {
    query = query.eq("project_id", assertScopeId(input));
  }

  if (input.technicianIds?.length) {
    query = query.in("user_id", input.technicianIds);
  }

  if (input.projectIds?.length) {
    query = query.in("project_id", input.projectIds);
  }

  if (categories.length === 1) {
    query = query.eq("category", categories[0]);
  } else if (categories.length > 1) {
    query = query.in("category", categories);
  }

  if (exactDate) {
    query = query.gte("date", `${exactDate}T00:00:00.000Z`).lte("date", `${exactDate}T23:59:59.999Z`);
  } else {
    if (startDate) {
      query = query.gte("date", `${startDate}T00:00:00.000Z`);
    }

    if (endDate) {
      query = query.lte("date", `${endDate}T23:59:59.999Z`);
    }
  }

  const rows = (await unwrapResponse(query, "Failed loading anomalies")) as AnomalyRow[];
  const anomalies = rows.map((row) => ({
    expense_id: toString(row.expense_id),
    project_id: toNullableString(row.project_id),
    technician_id: toNullableString(row.user_id),
    trip_date: formatDateOnly(toString(row.date)),
    type: coerceAnomalyType(row.anomaly_type),
    reason: toString(row.anomaly_reason, "Flagged anomaly"),
    amount: roundNumber(toNumber(row.amount)),
    category: toString(row.category),
    technician_name: toNullableString(row.technician_name),
    project_name: toNullableString(row.project_name),
    date: toString(row.date)
  }));

  return DetectAnomaliesOutput.parse({
    anomalies,
    count: anomalies.length,
    by_type: anomalies.reduce<Record<string, number>>((accumulator, anomaly) => {
      accumulator[anomaly.type] = (accumulator[anomaly.type] ?? 0) + 1;
      return accumulator;
    }, {}),
    total_flagged_amount: roundNumber(anomalies.reduce((sum, anomaly) => sum + anomaly.amount, 0))
  });
}
