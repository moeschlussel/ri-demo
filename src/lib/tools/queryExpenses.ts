import { z } from "zod";

import { roundNumber } from "@/lib/format";
import { getServerSupabaseClient } from "@/lib/supabase/serverClient";
import {
  assertScopeId,
  createScopedToolInputSchema,
  normalizeExpenseCategories,
  normalizeOptionalDate,
  toBoolean,
  toNullableString,
  toNumber,
  toString,
  unwrapResponse,
  type GenericRow
} from "@/lib/tools/shared";

// Fields Gemini is allowed to request — no IDs, no internal columns
export const ALLOWED_FIELDS = [
  "date",
  "category",
  "amount",
  "technician_name",
  "project_name",
  "anomaly_flag",
  "anomaly_type",
  "anomaly_reason"
] as const;

export type AllowedField = (typeof ALLOWED_FIELDS)[number];

export const QueryExpensesInput = createScopedToolInputSchema({
  // Which fields to return. If omitted, returns all allowed fields.
  fields: z.array(z.enum(ALLOWED_FIELDS)).optional(),

  // Grouping — when set, returns aggregated rows instead of individual rows
  groupBy: z
    .array(z.enum(["technician", "project", "category", "month", "week", "date"]))
    .optional(),

  // Aggregations to compute when groupBy is set
  aggregations: z
    .array(z.enum(["sum", "count", "avg", "min", "max"]))
    .optional(),

  // Filters
  categories: z.array(z.string()).optional(),
  technicianIds: z.array(z.string().uuid()).max(20).optional(),
  projectIds: z.array(z.string().uuid()).max(20).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  onlyAnomalies: z.boolean().optional(),
  minAmount: z.number().optional(),
  maxAmount: z.number().optional(),

  // Sorting
  sortBy: z.enum(["amount", "date"]).optional().default("date"),
  sortDir: z.enum(["asc", "desc"]).optional().default("desc"),

  // Hard limit — Gemini asks for only what it needs
  limit: z.number().int().min(1).max(500).optional().default(100)
});

type RawExpenseRow = GenericRow & {
  expense_id: string;
  project_id: string | null;
  user_id: string | null;
  org_id: string | null;
  technician_name: string | null;
  project_name: string | null;
  date: string;
  category: string;
  amount: number;
  anomaly_flag: boolean;
  anomaly_type: string | null;
  anomaly_reason: string | null;
};

type GroupedRow = Record<string, string | number | boolean | null>;

export const QueryExpensesOutput = z.object({
  // Raw rows (when no groupBy)
  rows: z
    .array(z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])))
    .optional(),
  // Aggregated rows (when groupBy is set)
  groups: z
    .array(z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])))
    .optional(),
  total_rows: z.number(),
  note: z.string().optional()
});

export type QueryExpensesInputType = z.infer<typeof QueryExpensesInput>;
export type QueryExpensesOutputType = z.infer<typeof QueryExpensesOutput>;

export async function queryExpenses(input: QueryExpensesInputType): Promise<QueryExpensesOutputType> {
  const supabase = getServerSupabaseClient();
  const categories = normalizeExpenseCategories(input.categories ?? []);
  const startDate = normalizeOptionalDate(input.startDate);
  const endDate = normalizeOptionalDate(input.endDate);
  const requestedFields = input.fields ?? [...ALLOWED_FIELDS];

  // Always fetch the internal fields we need for filtering/grouping
  let query = supabase
    .from("expense_anomalies_v")
    .select(
      "expense_id, project_id, org_id, user_id, technician_name, project_name, date, category, amount, anomaly_flag, anomaly_type, anomaly_reason"
    )
    .order(input.sortBy === "amount" ? "amount" : "date", {
      ascending: input.sortDir === "asc"
    });

  // Scope enforcement
  if (input.scopeType === "org") {
    query = query.eq("org_id", assertScopeId(input));
  }
  if (input.scopeType === "project") {
    query = query.eq("project_id", assertScopeId(input));
  }

  // Filters
  if (categories.length === 1) {
    query = query.eq("category", categories[0]);
  } else if (categories.length > 1) {
    query = query.in("category", categories);
  }
  if (input.technicianIds?.length) {
    query = query.in("user_id", input.technicianIds);
  }
  if (input.projectIds?.length) {
    query = query.in("project_id", input.projectIds);
  }
  if (startDate) {
    query = query.gte("date", `${startDate}T00:00:00.000Z`);
  }
  if (endDate) {
    query = query.lte("date", `${endDate}T23:59:59.999Z`);
  }
  if (input.onlyAnomalies) {
    query = query.eq("anomaly_flag", true);
  }
  if (input.minAmount !== undefined) {
    query = query.gte("amount", input.minAmount);
  }
  if (input.maxAmount !== undefined) {
    query = query.lte("amount", input.maxAmount);
  }

  const rawRows = (await unwrapResponse(query, "Failed loading expense query")) as RawExpenseRow[];

  // --- No groupBy: return individual rows with only requested fields ---
  if (!input.groupBy?.length) {
    const limited = rawRows.slice(0, input.limit);
    const rows = limited.map((row) => {
      const out: Record<string, string | number | boolean | null> = {};
      for (const field of requestedFields) {
        switch (field) {
          case "date":
            out.date = toString(row.date).slice(0, 10);
            break;
          case "category":
            out.category = toString(row.category);
            break;
          case "amount":
            out.amount = roundNumber(toNumber(row.amount));
            break;
          case "technician_name":
            out.technician_name = toNullableString(row.technician_name);
            break;
          case "project_name":
            out.project_name = toNullableString(row.project_name);
            break;
          case "anomaly_flag":
            out.anomaly_flag = toBoolean(row.anomaly_flag);
            break;
          case "anomaly_type":
            out.anomaly_type = toNullableString(row.anomaly_type);
            break;
          case "anomaly_reason":
            out.anomaly_reason = toNullableString(row.anomaly_reason);
            break;
        }
      }
      return out;
    });

    return QueryExpensesOutput.parse({
      rows,
      total_rows: rawRows.length,
      note:
        rawRows.length > input.limit
          ? `Showing ${input.limit} of ${rawRows.length} rows. Use startDate/endDate or other filters to narrow the result.`
          : undefined
    });
  }

  // --- GroupBy: aggregate in TypeScript ---
  const aggregations = input.aggregations ?? ["sum", "count"];

  function getGroupKey(row: RawExpenseRow): string {
    return (input.groupBy ?? [])
      .map((dim) => {
        switch (dim) {
          case "technician":
            return `technician::${toNullableString(row.technician_name) ?? "unknown"}`;
          case "project":
            return `project::${toNullableString(row.project_name) ?? "unknown"}`;
          case "category":
            return `category::${toString(row.category)}`;
          case "month":
            return `month::${toString(row.date).slice(0, 7)}`;
          case "week": {
            const d = new Date(toString(row.date));
            const weekStart = new Date(d);
            weekStart.setUTCDate(d.getUTCDate() - d.getUTCDay());
            return `week::${weekStart.toISOString().slice(0, 10)}`;
          }
          case "date":
            return `date::${toString(row.date).slice(0, 10)}`;
        }
      })
      .join("|");
  }

  function getGroupLabel(key: string): Record<string, string | number | boolean | null> {
    const parts = key.split("|");
    const label: Record<string, string | number | boolean | null> = {};
    for (const part of parts) {
      const [dim, value] = part.split("::");
      label[dim] = value ?? null;
    }
    return label;
  }

  const groupMap = new Map<
    string,
    { amounts: number[]; count: number; label: Record<string, string | number | boolean | null> }
  >();

  for (const row of rawRows) {
    const key = getGroupKey(row);
    const existing = groupMap.get(key);
    const amount = roundNumber(toNumber(row.amount));
    if (existing) {
      existing.amounts.push(amount);
      existing.count += 1;
    } else {
      groupMap.set(key, {
        amounts: [amount],
        count: 1,
        label: getGroupLabel(key)
      });
    }
  }

  const groups: GroupedRow[] = [...groupMap.entries()]
    .map(([, { amounts, count, label }]) => {
      const out: GroupedRow = { ...label, count };
      if (aggregations.includes("sum")) {
        out.sum = roundNumber(amounts.reduce((a, b) => a + b, 0));
      }
      if (aggregations.includes("avg")) {
        out.avg = roundNumber(amounts.reduce((a, b) => a + b, 0) / amounts.length);
      }
      if (aggregations.includes("min")) {
        out.min = Math.min(...amounts);
      }
      if (aggregations.includes("max")) {
        out.max = Math.max(...amounts);
      }
      return out;
    })
    .sort((a, b) => {
      // Sort groups by sum desc by default
      const aVal = typeof a.sum === "number" ? a.sum : 0;
      const bVal = typeof b.sum === "number" ? b.sum : 0;
      return bVal - aVal;
    })
    .slice(0, input.limit);

  return QueryExpensesOutput.parse({
    groups,
    total_rows: groupMap.size,
    note:
      groupMap.size > input.limit
        ? `Showing top ${input.limit} of ${groupMap.size} groups by total spend.`
        : undefined
  });
}
