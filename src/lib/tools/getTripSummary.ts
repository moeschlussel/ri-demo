import { z } from "zod";

import { roundNumber } from "@/lib/format";
import { getServerSupabaseClient } from "@/lib/supabase/serverClient";
import {
  TRAVEL_CATEGORIES,
  formatDateOnly,
  normalizeExpenseCategories,
  normalizeOptionalDate,
  toBoolean,
  toNullableString,
  toNumber,
  toString,
  unwrapResponse,
  type GenericRow
} from "@/lib/tools/shared";

export const GetTripSummaryInput = z.object({
  scopeType: z.enum(["global", "org", "project"]),
  scopeId: z.string().uuid().optional(),
  technicianIds: z.array(z.string().uuid()).max(10).optional(),
  projectIds: z.array(z.string().uuid()).max(10).optional(),
  categories: z.array(z.string()).optional(),
  exactDate: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  onlyAnomalies: z.boolean().optional(),
  includeExpenses: z.boolean().optional().default(false),
  limitTrips: z.number().int().min(1).max(100).optional().default(20)
});

const TripExpenseSchema = z.object({
  expense_id: z.string(),
  date: z.string(),
  trip_date: z.string(),
  category: z.string(),
  amount: z.number(),
  anomaly_flag: z.boolean(),
  anomaly_type: z.string().nullable(),
  anomaly_reason: z.string().nullable()
});

export const GetTripSummaryOutput = z.object({
  trips: z.array(
    z.object({
      trip_key: z.string(),
      trip_date: z.string(),
      project_id: z.string().nullable(),
      project_name: z.string().nullable(),
      technician_id: z.string().nullable(),
      technician_name: z.string().nullable(),
      org_id: z.string().nullable(),
      expense_count: z.number(),
      total_amount: z.number(),
      travel_amount: z.number(),
      categories: z.array(z.string()),
      anomaly_count: z.number(),
      anomaly_types: z.record(z.string(), z.number()),
      expenses: z.array(TripExpenseSchema)
    })
  ),
  total_trips: z.number(),
  total_amount: z.number()
});

type TripExpenseRow = GenericRow & {
  expense_id: string;
  project_id: string | null;
  org_id: string | null;
  user_id: string | null;
  technician_name: string | null;
  project_name: string | null;
  date: string;
  category: string;
};

export type GetTripSummaryInputType = z.infer<typeof GetTripSummaryInput>;
export type GetTripSummaryOutputType = z.infer<typeof GetTripSummaryOutput>;

export async function getTripSummary(input: GetTripSummaryInputType): Promise<GetTripSummaryOutputType> {
  const supabase = getServerSupabaseClient();
  const categories = normalizeExpenseCategories(input.categories ?? []);
  const exactDate = normalizeOptionalDate(input.exactDate);
  const startDate = normalizeOptionalDate(input.startDate);
  const endDate = normalizeOptionalDate(input.endDate);

  let query = supabase
    .from("expense_anomalies_v")
    .select(
      "expense_id, project_id, org_id, user_id, technician_name, project_name, date, category, amount, anomaly_flag, anomaly_type, anomaly_reason"
    )
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

  if (input.onlyAnomalies) {
    query = query.eq("anomaly_flag", true);
  }

  const rows = (await unwrapResponse(query, "Failed loading trip summary")) as TripExpenseRow[];
  const grouped = new Map<
    string,
    {
      trip_date: string;
      project_id: string | null;
      project_name: string | null;
      technician_id: string | null;
      technician_name: string | null;
      org_id: string | null;
      expense_count: number;
      total_amount: number;
      travel_amount: number;
      categories: Set<string>;
      anomaly_count: number;
      anomaly_types: Record<string, number>;
      expenses: Array<z.infer<typeof TripExpenseSchema>>;
    }
  >();

  for (const row of rows) {
    const tripDate = formatDateOnly(toString(row.date));
    const key = `${toNullableString(row.project_id) ?? "unknown-project"}:${toNullableString(row.user_id) ?? "unknown-technician"}:${tripDate}`;
    const current = grouped.get(key) ?? {
      trip_date: tripDate,
      project_id: toNullableString(row.project_id),
      project_name: toNullableString(row.project_name),
      technician_id: toNullableString(row.user_id),
      technician_name: toNullableString(row.technician_name),
      org_id: toNullableString(row.org_id),
      expense_count: 0,
      total_amount: 0,
      travel_amount: 0,
      categories: new Set<string>(),
      anomaly_count: 0,
      anomaly_types: {},
      expenses: []
    };

    const category = toString(row.category);
    const amount = roundNumber(toNumber(row.amount));
    const anomalyFlag = toBoolean(row.anomaly_flag);
    const anomalyType = toNullableString(row.anomaly_type);

    current.expense_count += 1;
    current.total_amount += amount;
    if (TRAVEL_CATEGORIES.includes(category as (typeof TRAVEL_CATEGORIES)[number])) {
      current.travel_amount += amount;
    }
    current.categories.add(category);
    if (anomalyFlag) {
      current.anomaly_count += 1;
      if (anomalyType) {
        current.anomaly_types[anomalyType] = (current.anomaly_types[anomalyType] ?? 0) + 1;
      }
    }

    if (input.includeExpenses) {
      current.expenses.push({
        expense_id: toString(row.expense_id),
        date: toString(row.date),
        trip_date: tripDate,
        category,
        amount,
        anomaly_flag: anomalyFlag,
        anomaly_type: anomalyType,
        anomaly_reason: toNullableString(row.anomaly_reason)
      });
    }

    grouped.set(key, current);
  }

  const allTrips = [...grouped.entries()].map(([tripKey, value]) => ({
    trip_key: tripKey,
    trip_date: value.trip_date,
    project_id: value.project_id,
    project_name: value.project_name,
    technician_id: value.technician_id,
    technician_name: value.technician_name,
    org_id: value.org_id,
    expense_count: value.expense_count,
    total_amount: roundNumber(value.total_amount),
    travel_amount: roundNumber(value.travel_amount),
    categories: [...value.categories].sort(),
    anomaly_count: value.anomaly_count,
    anomaly_types: value.anomaly_types,
    expenses: value.expenses
  }));

  const trips = allTrips
    .sort((left, right) => {
      if (right.trip_date !== left.trip_date) {
        return right.trip_date.localeCompare(left.trip_date);
      }

      return (left.project_name ?? "").localeCompare(right.project_name ?? "");
    })
    .slice(0, input.limitTrips)
    .map((trip) => trip);

  return GetTripSummaryOutput.parse({
    trips,
    total_trips: grouped.size,
    total_amount: roundNumber(allTrips.reduce((sum, trip) => sum + trip.total_amount, 0))
  });
}
