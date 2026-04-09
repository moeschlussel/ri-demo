import { z } from "zod";

import { roundNumber } from "@/lib/format";
import { getServerSupabaseClient } from "@/lib/supabase/serverClient";
import {
  coerceAnomalyType,
  subtractMonths,
  toNumber,
  toNullableString,
  toString,
  unwrapResponse,
  type GenericRow
} from "@/lib/tools/shared";

export const DetectAnomaliesInput = z.object({
  scopeType: z.enum(["global", "org", "project"]),
  scopeId: z.string().uuid().optional(),
  lookbackMonths: z.number().int().min(1).max(36).optional().default(12)
});

export const DetectAnomaliesOutput = z.object({
  anomalies: z.array(
    z.object({
      expense_id: z.string(),
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
  date: string;
};

export type DetectAnomaliesInputType = z.infer<typeof DetectAnomaliesInput>;
export type DetectAnomaliesOutputType = z.infer<typeof DetectAnomaliesOutput>;

export async function detectAnomalies(input: DetectAnomaliesInputType): Promise<DetectAnomaliesOutputType> {
  const supabase = getServerSupabaseClient();
  const cutoff = subtractMonths(new Date(), input.lookbackMonths);

  let query = supabase
    .from("expense_anomalies_v")
    .select("expense_id, project_id, org_id, technician_name, project_name, date, category, amount, anomaly_type, anomaly_reason")
    .eq("anomaly_flag", true)
    .gte("date", cutoff.toISOString())
    .order("date", { ascending: false });

  if (input.scopeType === "org") {
    query = query.eq("org_id", input.scopeId ?? "");
  }

  if (input.scopeType === "project") {
    query = query.eq("project_id", input.scopeId ?? "");
  }

  const rows = (await unwrapResponse(query, "Failed loading anomalies")) as AnomalyRow[];
  const anomalies = rows.map((row) => ({
    expense_id: toString(row.expense_id),
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
