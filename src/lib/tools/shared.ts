import { z } from "zod";
import type { PostgrestSingleResponse } from "@supabase/supabase-js";

import { roundNumber } from "@/lib/format";

export type GenericRow = Record<string, unknown>;

export type ScopeInput = {
  scopeType: "global" | "org" | "project";
  scopeId?: string;
};

type ScopeInputShape = z.ZodRawShape;

export const TRAVEL_CATEGORIES = ["Flight", "Hotel", "Meals"] as const;
export const EXPENSE_CATEGORIES = ["Flight", "Hotel", "Meals", "Equipment"] as const;
export const ANOMALY_TYPES = [
  "duplicate",
  "category_outlier",
  "unauthorized_category",
  "large_equipment"
] as const;
const CATEGORY_ALIAS_MAP: Record<string, (typeof EXPENSE_CATEGORIES)[number]> = {
  airfare: "Flight",
  airfares: "Flight",
  airline: "Flight",
  airlines: "Flight",
  air: "Flight",
  plane: "Flight",
  planes: "Flight",
  ticket: "Flight",
  tickets: "Flight",
  flight: "Flight",
  flights: "Flight",
  hotel: "Hotel",
  hotels: "Hotel",
  lodging: "Hotel",
  room: "Hotel",
  rooms: "Hotel",
  stay: "Hotel",
  stays: "Hotel",
  meal: "Meals",
  meals: "Meals",
  food: "Meals",
  foods: "Meals",
  lunch: "Meals",
  lunches: "Meals",
  dinner: "Meals",
  dinners: "Meals",
  breakfast: "Meals",
  breakfasts: "Meals",
  "per diem": "Meals",
  perdiem: "Meals",
  equipment: "Equipment",
  equip: "Equipment",
  gear: "Equipment",
  hardware: "Equipment",
  scanner: "Equipment",
  scanners: "Equipment",
  lidar: "Equipment"
};

export function assertScopeId(input: ScopeInput): string {
  if (input.scopeType === "global" || input.scopeId) {
    return input.scopeId ?? "";
  }

  throw new Error(`scopeId is required for ${input.scopeType} scope`);
}

export function createScopedToolInputSchema<Shape extends ScopeInputShape>(shape: Shape) {
  return z
    .object({
      scopeType: z.enum(["global", "org", "project"]),
      scopeId: z.string().uuid().optional(),
      ...shape
    })
    .superRefine((value, ctx) => {
      const scopedValue = value as ScopeInput;

      if (scopedValue.scopeType !== "global" && !scopedValue.scopeId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["scopeId"],
          message: `scopeId is required for ${scopedValue.scopeType} scope`
        });
      }
    });
}

export function toNumber(value: unknown): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  if (typeof value === "string" && value.length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
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

export function normalizeSearchValue(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function tokenizeSearchValue(value: string): string[] {
  return normalizeSearchValue(value)
    .split(" ")
    .map((token) => token.trim())
    .filter(Boolean);
}

export function normalizeExpenseCategory(value: string): string {
  const normalized = normalizeSearchValue(value);
  return CATEGORY_ALIAS_MAP[normalized] ?? value;
}

export function normalizeExpenseCategories(values: string[] = []): string[] {
  return [...new Set(values.map((value) => normalizeExpenseCategory(value)).filter(Boolean))];
}

function toDateOnly(value: string): string {
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid date value: ${value}`);
  }

  return parsed.toISOString().slice(0, 10);
}

export function normalizeOptionalDate(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  return toDateOnly(value);
}

export function formatDateOnly(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) {
    return typeof value === "string" ? value.slice(0, 10) : "";
  }

  return date.toISOString().slice(0, 10);
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
