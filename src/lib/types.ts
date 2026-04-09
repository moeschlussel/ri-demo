export type Scope =
  | { type: "global" }
  | { type: "org"; id: string; name: string }
  | { type: "project"; id: string; name: string; orgName: string };

export type ScopeType = Scope["type"];

export type ChatHistoryEntry = {
  role: "user" | "model";
  content: string;
};

export type ChatToolCallRecord = {
  name: string;
  args: Record<string, unknown>;
  result: Record<string, unknown>;
};

export type AsyncResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export type ChildOrganizationRow = {
  id: string;
  name: string;
  totalRevenue: number;
  totalExpenses: number;
  netProfit: number;
  marginPct: number;
  travelSpend: number;
  anomalyCount: number;
  projectCount: number;
};

export type ChildProjectRow = {
  id: string;
  name: string;
  status: string;
  budget: number;
  totalRevenue: number;
  totalExpenses: number;
  netProfit: number;
  marginPct: number;
  travelSpend: number;
  anomalyCount: number;
};

