import type { PostgrestSingleResponse } from "@supabase/supabase-js";

import { roundNumber } from "@/lib/format";

export type GenericRow = Record<string, unknown>;

export type ScopeInput = {
  scopeType: "global" | "org" | "project";
  scopeId?: string;
};

export const TRAVEL_CATEGORIES = ["Flight", "Hotel", "Meals"] as const;
export const ANOMALY_TYPES = [
  "duplicate",
  "category_outlier",
  "unauthorized_category",
  "large_equipment"
] as const;

export function assertScopeId(input: ScopeInput): string {
  if (input.scopeType === "global" || input.scopeId) {
    return input.scopeId ?? "";
  }

  throw new Error(`scopeId is required for ${input.scopeType} scope`);
}

export function toNumber(value: unknown): number {
  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "string" && value.length > 0) {
    return Number(value);
  }

  return 0;
}

export function toBoolean(value: unknown): boolean {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    return value === "true";
  }

  return false;
}

export function toString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

export function toNullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

export function formatMonthKey(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return date.toISOString().slice(0, 7);
}

export function subtractMonths(date: Date, months: number): Date {
  const copy = new Date(date);
  copy.setUTCMonth(copy.getUTCMonth() - months);
  return copy;
}

export function aggregateByMonth<T extends { month: string; totalTravelSpend: number; surveyCount: number }>(
  rows: T[]
): Array<{
  month: string;
  totalTravelSpend: number;
  surveyCount: number;
  avgTravelCostPerSurvey: number;
}> {
  const map = new Map<string, { totalTravelSpend: number; surveyCount: number }>();

  for (const row of rows) {
    const current = map.get(row.month) ?? { totalTravelSpend: 0, surveyCount: 0 };
    current.totalTravelSpend += row.totalTravelSpend;
    current.surveyCount += row.surveyCount;
    map.set(row.month, current);
  }

  return [...map.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([month, value]) => ({
      month,
      totalTravelSpend: roundNumber(value.totalTravelSpend),
      surveyCount: value.surveyCount,
      avgTravelCostPerSurvey:
        value.surveyCount > 0 ? roundNumber(value.totalTravelSpend / value.surveyCount) : 0
    }));
}

export async function unwrapResponse<T>(
  promise: PromiseLike<PostgrestSingleResponse<T>>,
  label: string
): Promise<T> {
  const response = await promise;
  if (response.error) {
    throw new Error(`${label}: ${response.error.message}`);
  }

  return response.data as T;
}

export function coerceAnomalyType(value: unknown): (typeof ANOMALY_TYPES)[number] {
  if (typeof value === "string" && ANOMALY_TYPES.includes(value as (typeof ANOMALY_TYPES)[number])) {
    return value as (typeof ANOMALY_TYPES)[number];
  }

  return "category_outlier";
}
