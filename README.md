# RI AI CFO Dashboard

A scope-aware financial dashboard for Robotic Imaging with a Gemini-powered CFO chat. Three scopes (global, org, project) share one component and one data contract.

## Submission

- GitHub: `TODO`
- Live URL: https://ri-demo.vercel.app
- Demo video: `TODO`

---

## Review Path

1. `supabase/migrations/` — schema, reporting views, profit trend view
2. `src/lib/tools/toolRegistry.ts` — LLM/data boundary + scope enforcement
3. `src/lib/tools/*.ts` — individual tool handlers
4. `src/lib/gemini/runChat.ts` + `systemPrompt.ts` — orchestration loop
5. `src/components/dashboard/DashboardView.tsx` — unified dashboard
6. `src/lib/dashboard/queries.ts` — UI-only queries (separate from tool layer)

---

## Architecture

```
Browser / Next.js
  /          /org/[orgId]          /project/[projectId]
  └──────────────────── DashboardView ────────────────────┐
                                                          │
                                              CfoChatSidebar → POST /api/chat
                                                                      │
                                                            Gemini function calling
                                                                      │
                                                               toolRegistry
                                                                      │
                                                        Zod validation + handlers
                                                                      │
                                              Supabase reporting views + TS aggregation
                                                                      │
              expense_anomalies_v    project_financials_v    org_financials_v
              monthly_travel_trends_v    monthly_profit_trends_v
                                                                      │
                      base tables: organizations, users, projects, revenue, expenses
```

---

## Architectural Choices

### 1. Deterministic math, interpretive AI

Revenue, expenses, net profit, margin, anomalies, and trend series are computed outside the model — in SQL views and TypeScript handlers. The model only decides which tool to call and how to explain the result. This keeps dashboard KPIs and chat answers in sync.

### 2. Tool calling over NL2SQL

`toolRegistry.ts` is the only bridge between Gemini and the database. Every tool has a Zod input schema, Zod output schema, a handler, and a Gemini function declaration. The model can't improvise queries or touch the raw schema.

Tools:

| Tool | Purpose |
|---|---|
| `get_scope_financials` | Headline KPIs for current scope |
| `get_expense_breakdown` | Expense rows with anomaly metadata |
| `get_profit_trend` | Monthly net profit trend |
| `get_travel_trend` | Monthly travel cost trend |
| `detect_anomalies` | Deterministic anomaly findings |
| `forecast_expenses` | Trailing-average forecast |
| `resolve_scope_entities` | Entity/category resolution from natural language |
| `get_trip_summary` | Trip summaries grouped from expense rows |
| `query_expenses` | Flexible fallback — field selection, grouping, filters — when no structured tool covers the question |

### 3. Reporting logic lives in SQL views

Anomaly flagging, project/org rollups, and trend aggregations are in Supabase views — not in React components or prompts. The financial layer can be verified independently of the UI.

### 4. Scope is route-derived and enforced server-side

The current page determines the working scope. It flows through the dashboard, the chat request body, the system prompt, and all tool arguments. Enforcement is two-layered:

- `normalizeScopedArgs` stamps the correct scope ID onto every tool call — the model can't override it.
- `assertWithinAuthorityScope` rejects any tool call whose requested scope falls outside the page authority before the handler runs.

The prompt handles intent; the server handles enforcement.

### 5. One dashboard across three scopes

All three routes render `DashboardView`. Scope differences are handled by data and conditional rendering, not by duplicating screens.

---

## Running Locally

```bash
npm install
```

`.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
GEMINI_API_KEY=...
```

```bash
supabase link --project-ref tzrsypzpeurtqbepvptl
supabase db push --include-all
npm run seed       # 2 orgs, 4 projects, 24 months of data + seeded anomalies
npm run dev
```

Verify:
```bash
npm run typecheck
npm run build
npm run verify:tools
```
