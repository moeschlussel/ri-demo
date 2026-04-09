import { z } from "zod";

import { roundNumber } from "@/lib/format";
import { getServerSupabaseClient } from "@/lib/supabase/serverClient";
import {
  toBoolean,
  toNullableString,
  toNumber,
  toString,
  unwrapResponse,
  type GenericRow
} from "@/lib/tools/shared";

export const GetExpenseBreakdownInput = z.object({
  scopeType: z.enum(["global", "org", "project"]),
  scopeId: z.string().uuid().optional(),
  category: z.string().optional(),
  onlyAnomalies: z.boolean().optional(),
  limit: z.number().int().min(1).max(500).optional().default(200)
});

export const GetExpenseBreakdownOutput = z.object({
  rows: z.array(
    z.object({
      expense_id: z.string(),
      date: z.string(),
      category: z.string(),
      amount: z.number(),
      technician_name: z.string().nullable(),
      project_name: z.string().nullable(),
      org_id: z.string().nullable(),
      anomaly_flag: z.boolean(),
      anomaly_type: z.string().nullable(),
      anomaly_reason: z.string().nullable()
    })
  ),
  total_count: z.number(),
  total_amount: z.number()
});

type ExpenseAnomalyRow = GenericRow & {
  expense_id: string;
  org_id: string | null;
  date: string;
  category: string;
};

export type GetExpenseBreakdownInputType = z.infer<typeof GetExpenseBreakdownInput>;
export type GetExpenseBreakdownOutputType = z.infer<typeof GetExpenseBreakdownOutput>;

export async function getExpenseBreakdown(
  input: GetExpenseBreakdownInputType
): Promise<GetExpenseBreakdownOutputType> {
  const supabase = getServerSupabaseClient();

  let query = supabase
    .from("expense_anomalies_v")
    .select(
      "expense_id, project_id, org_id, technician_name, project_name, date, category, amount, anomaly_flag, anomaly_type, anomaly_reason"
    )
    .order("date", { ascending: false });

  if (input.scopeType === "org") {
    query = query.eq("org_id", input.scopeId ?? "");
  }

  if (input.scopeType === "project") {
    query = query.eq("project_id", input.scopeId ?? "");
  }

  if (input.category) {
    query = query.eq("category", input.category);
  }

  if (input.onlyAnomalies) {
    query = query.eq("anomaly_flag", true);
  }

  const rows = (await unwrapResponse(query, "Failed loading expense breakdown")) as ExpenseAnomalyRow[];
  const limitedRows = rows.slice(0, input.limit);

  return GetExpenseBreakdownOutput.parse({
    rows: limitedRows.map((row) => ({
      expense_id: toString(row.expense_id),
      date: toString(row.date),
      category: toString(row.category),
      amount: roundNumber(toNumber(row.amount)),
      technician_name: toNullableString(row.technician_name),
      project_name: toNullableString(row.project_name),
      org_id: toNullableString(row.org_id),
      anomaly_flag: toBoolean(row.anomaly_flag),
      anomaly_type: toNullableString(row.anomaly_type),
      anomaly_reason: toNullableString(row.anomaly_reason)
    })),
    total_count: rows.length,
    total_amount: roundNumber(rows.reduce((sum, row) => sum + toNumber(row.amount), 0))
  });
}
