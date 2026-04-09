import { z } from "zod";

import { roundNumber } from "@/lib/format";
import { getServerSupabaseClient } from "@/lib/supabase/serverClient";
import {
  coerceAnomalyType,
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

export const DetectAnomaliesInput = z.object({
  scopeType: z.enum(["global", "org", "project"]),
  scopeId: z.string().uuid().optional(),
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
      date: z.string(),
      review_status: z.enum(["unreviewed", "verified"]),
      reviewed_at: z.string().nullable()
    })
  ),
  review_enabled: z.boolean(),
  count: z.number(),
  by_type: z.record(z.string(), z.number()),
  total_flagged_amount: z.number()
});

type AnomalyRow = GenericRow & {
  expense_id: string;
  project_id: string | null;
  user_id: string | null;
  date: string;
  anomaly_review_status?: string | null;
  anomaly_reviewed_at?: string | null;
};

export type DetectAnomaliesInputType = z.infer<typeof DetectAnomaliesInput>;
export type DetectAnomaliesOutputType = z.infer<typeof DetectAnomaliesOutput>;

function isMissingReviewColumnsError(message: string): boolean {
  return message.includes("anomaly_review_status") || message.includes("anomaly_reviewed_at");
}

export async function detectAnomalies(input: DetectAnomaliesInputType): Promise<DetectAnomaliesOutputType> {
  const supabase = getServerSupabaseClient();
  const cutoff = subtractMonths(new Date(), input.lookbackMonths);
  const categories = normalizeExpenseCategories(input.categories ?? []);
  const exactDate = normalizeOptionalDate(input.exactDate);
  const startDate = normalizeOptionalDate(input.startDate);
  const endDate = normalizeOptionalDate(input.endDate);

  function buildQuery(selectClause: string) {
    let query = supabase
      .from("expense_anomalies_v")
      .select(selectClause)
      .eq("anomaly_flag", true)
      .gte("date", cutoff.toISOString())
      .order("date", { ascending: false });

    if (input.scopeType === "org") {
      query = query.eq("org_id", input.scopeId ?? "");
    }

    if (input.scopeType === "project") {
      query = query.eq("project_id", input.scopeId ?? "");
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

    return query;
  }

  const reviewSelect =
    "expense_id, project_id, org_id, user_id, technician_name, project_name, date, category, amount, anomaly_type, anomaly_reason, anomaly_review_status, anomaly_reviewed_at";
  const legacySelect =
    "expense_id, project_id, org_id, user_id, technician_name, project_name, date, category, amount, anomaly_type, anomaly_reason";

  let rows: AnomalyRow[] = [];
  let reviewEnabled = true;
  let primaryError: Error | null = null;

  try {
    rows = (await unwrapResponse(buildQuery(reviewSelect), "Failed loading anomalies")) as unknown as AnomalyRow[];
  } catch (error) {
    primaryError = error instanceof Error ? error : new Error("Failed loading anomalies");

    if (!isMissingReviewColumnsError(primaryError.message)) {
      throw primaryError;
    }

    reviewEnabled = false;
    rows = (await unwrapResponse(buildQuery(legacySelect), "Failed loading anomalies")) as unknown as AnomalyRow[];
  }

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
    date: toString(row.date),
    review_status: reviewEnabled && row.anomaly_review_status === "verified" ? "verified" : "unreviewed",
    reviewed_at: reviewEnabled ? toNullableString(row.anomaly_reviewed_at) : null
  }));

  return DetectAnomaliesOutput.parse({
    anomalies,
    review_enabled: reviewEnabled,
    count: anomalies.length,
    by_type: anomalies.reduce<Record<string, number>>((accumulator, anomaly) => {
      accumulator[anomaly.type] = (accumulator[anomaly.type] ?? 0) + 1;
      return accumulator;
    }, {}),
    total_flagged_amount: roundNumber(anomalies.reduce((sum, anomaly) => sum + anomaly.amount, 0))
  });
}
