# RI AI CFO Dashboard

This project is a scope-aware financial dashboard for Robotic Imaging. It supports three levels of analysis, global, organization, and project, and keeps the same product shape across all three. The dashboard surfaces deterministic KPI, anomaly, and trend data from Supabase. The Gemini-powered CFO chat is there to explain and investigate those numbers, but not to generate them.

The core architectural choice is simple: deterministic financial logic on one side, LLM orchestration on the other, and a small typed tool layer as the only bridge between them.

## Review Path

For code review, the fastest path through the repo is:

1. `supabase/migrations/20260409122600_init_ri_demo.sql`
2. `supabase/migrations/20260409143000_add_reporting_views.sql`
3. `supabase/migrations/20260409160000_add_monthly_profit_trends_view.sql`
4. `src/lib/tools/toolRegistry.ts`
5. `src/lib/tools/*.ts`
6. `src/lib/gemini/runChat.ts`
7. `src/lib/gemini/systemPrompt.ts`
8. `src/components/dashboard/DashboardView.tsx`
9. `src/lib/dashboard/queries.ts`
10. `src/app/api/chat/route.ts`

That sequence shows the system from the bottom up:

- base schema
- derived reporting truth
- typed business primitives
- LLM orchestration
- UI composition

## Architecture Diagram

```text
┌────────────────────────────── Browser / Next.js ──────────────────────────────┐
│                                                                                │
│  /                       /org/[orgId]                 /project/[projectId]     │
│  │                              │                                  │           │
│  └───────────────┬──────────────┴──────────────────┬───────────────┘           │
│                  ▼                                 ▼                           │
│         DashboardView                      CfoChatSidebar                      │
│                  │                                 │                           │
│                  │                                 └── POST /api/chat          │
│                  │                                               │             │
│                  ├── shared analytical handlers                  ▼             │
│                  │      - get_scope_financials          Gemini function calling │
│                  │      - get_profit_trend                       │             │
│                  │      - get_expense_breakdown                  ▼             │
│                  │      - detect_anomalies                 toolRegistry        │
│                  │                                               │             │
│                  └── UI-only server queries                      ▼             │
│                         - navigation tree             Zod validation + handler │
│                         - child tables                          execution       │
└───────────────────────────────────────────────────────┬────────────────────────┘
                                                        ▼
                                      Supabase reporting views + TS aggregation
                                                        │
                           ┌────────────────────────────┼────────────────────────────┐
                           │                            │                            │
                    expense_anomalies_v        project_financials_v         org_financials_v
                    monthly_travel_trends_v    monthly_profit_trends_v
                                                        │
                                                        ▼
                             base tables: organizations, users, projects, revenue, expenses
```

## What Is Implemented

### Routes and page model

- `/` renders the global dashboard
- `/org/[orgId]` renders the organization dashboard
- `/project/[projectId]` renders the project dashboard
- all three routes delegate to the same `DashboardView`

This was intentional. I did not want three separate dashboards with slightly different logic drifting apart over time.

### Dashboard composition

The dashboard currently includes:

- breadcrumbs
- a scope header
- 6 KPI cards
- a net profit trend chart
- a child table at global and org scope
- an expense breakdown table
- an anomalies drawer
- a persistent CFO chat sidebar

### Data layer

The base schema is kept simple and unchanged:

- `organizations`
- `users`
- `projects`
- `revenue`
- `expenses`

All derived business logic is layered on top through reporting views:

- `expense_anomalies_v`
- `project_financials_v`
- `org_financials_v`
- `monthly_travel_trends_v`
- `monthly_profit_trends_v`

### Tool layer

The tool layer is the contract between Gemini and the business data:

| Tool | Responsibility |
| --- | --- |
| `get_scope_financials` | headline KPI totals for the current scope |
| `get_expense_breakdown` | expense rows with filtering and anomaly metadata |
| `get_travel_trend` | monthly travel cost trend data |
| `detect_anomalies` | deterministic anomaly findings |
| `forecast_expenses` | trailing-average expense forecast |
| `resolve_scope_entities` | entity and category resolution from natural language |
| `get_trip_summary` | trip/site-visit summaries grouped from expense rows |
| `get_profit_trend` | monthly net profit trend data |
| `query_expenses` | flexible raw expense query with field selection, grouping, aggregation, and filters — used when no other tool covers the question |

## The Main Architectural Decisions

### 1. Deterministic math is the source of truth

This is the most important decision in the repo.

Revenue, expenses, net profit, margin, anomaly counts, and trend series are all computed outside the model. The model never calculates those numbers itself. It only decides which tool to call and how to explain the returned result.

You can see that boundary in:

- `src/lib/tools/getScopeFinancials.ts`
- `src/lib/tools/getExpenseBreakdown.ts`
- `src/lib/tools/detectAnomalies.ts`
- `src/lib/tools/getTravelTrend.ts`
- `src/lib/tools/getProfitTrend.ts`
- `src/lib/tools/forecastExpenses.ts`

This matters because it keeps the UI and chat aligned. If the KPI card says one thing and the chat says another, the system loses credibility immediately.

### 2. Tool calling instead of NL2SQL

I kept the model away from raw SQL and raw schema access.

`src/lib/tools/toolRegistry.ts` is the only bridge between the LLM and the data layer. Every tool has:

- a Zod input schema
- a Zod output schema
- a handler
- a Gemini function declaration

That does two useful things:

- it narrows the model's freedom to a small set of business primitives
- it makes the behavior inspectable and testable

For a project like this, that is a much stronger architecture than letting the model improvise queries.

### 3. The reporting layer lives in SQL views, not in React components

I deliberately pushed reusable financial logic into Supabase views instead of scattering it across server components, route handlers, or prompts.

That includes:

- anomaly flagging in `expense_anomalies_v`
- project rollups in `project_financials_v`
- org rollups in `org_financials_v`
- monthly travel trend aggregation
- monthly profit trend aggregation

This keeps the logic centralized and easy to inspect. It also means the financial layer can be verified independently of the UI.

### 4. Scope is route-derived and ambient

The current page determines the working scope. That scope is resolved once and then passed through:

- the dashboard
- the chat request body
- the system prompt
- the tool arguments

The user should not have to keep restating context the app already knows.

Scope enforcement is layered. The system prompt tells the model what scope it is in and instructs it not to query outside it. The server independently enforces this in `normalizeScopedArgs` (which always stamps the correct scope ID onto matching tool calls) and in `assertWithinAuthorityScope` (which rejects any tool call whose requested scope falls outside the page scope before the handler runs). The prompt handles intent; the server handles enforcement.

Relevant files:

- `src/lib/types.ts`
- `src/app/page.tsx`
- `src/app/org/[orgId]/page.tsx`
- `src/app/project/[projectId]/page.tsx`
- `src/lib/gemini/systemPrompt.ts`
- `src/lib/gemini/runChat.ts`
- `src/lib/tools/toolRegistry.ts`

### 5. Anomaly detection is deterministic first, interpretive second

Anomalies are not generated by the model.

They come from four fixed rules in `expense_anomalies_v`:

- unauthorized category
- duplicate expense
- large equipment
- category outlier

The dashboard reads those flags. The chat reads those same flags. The LLM can add interpretation, but it is not allowed to invent new anomalies or contradict the deterministic count.

That separation is important because anomaly review is one of the places where users will naturally compare UI and chat side by side.

### 6. One dashboard component across three scopes

All three routes render `DashboardView`.

That gives the project a consistent mental model:

- same page structure
- same KPI semantics
- same chat behavior
- same drill-down pattern

The difference between scopes is handled by data and conditional rendering, not by cloning screens.

### 7. Shared analytical handlers, separate UI plumbing

I did not force every query into the tool layer.

The analytical parts that matter to both dashboard and chat are shared:

- `get_scope_financials`
- `get_profit_trend`
- `get_expense_breakdown`
- `detect_anomalies`

But navigation and child-table loading live separately in `src/lib/dashboard/queries.ts` because those are UI concerns, not business reasoning primitives.

That split keeps the tool layer honest. It contains capabilities the model should have, not every query the UI happens to need.

### 9. Server-side authority scope enforcement

The system prompt alone is not sufficient to prevent a model from querying out-of-scope data. Prompt injection in a user message can override prompt-level instructions.

The enforcement is hardened in two places in `src/lib/tools/toolRegistry.ts`:

`normalizeScopedArgs` always stamps the authority scope ID onto any tool call whose `scopeType` matches the current page scope. The model cannot override this by passing a different ID.

`assertWithinAuthorityScope` runs before every tool handler. It checks that the requested `scopeType` and `scopeId` fall within the page authority:

- global page → any scope is allowed
- org page → only that org or a project that belongs to it (verified by a database lookup)
- project page → only that exact project

If the check fails, the tool returns an error object to the model instead of data. The model cannot retrieve anything the page scope does not permit, regardless of what the user message contains.

### 10. Synchronous chat over streaming chat

The chat route returns one JSON payload containing:

- the final reply
- the tool calls made during the turn

There is no streaming. The entire tool loop happens server-side in `src/lib/gemini/runChat.ts`.

That choice was intentional. Here, inspectability and correctness mattered more than streaming polish.

## Where The Final Implementation Diverged From The Original Plan

### Profit trend became the primary dashboard chart

The original PRD leaned more heavily toward travel trend as the main dashboard visual.

In the final build, I made net profit trend the primary chart and kept travel trend available through the tool layer. The reasoning was product-driven: net profit felt like the more important top-line CFO narrative, while travel trend still remained available for operational drill-down.

That change is backed by:

- `supabase/migrations/20260409160000_add_monthly_profit_trends_view.sql`
- `src/lib/tools/getProfitTrend.ts`
- `src/components/dashboard/NetProfitTrendChart.tsx`

### `resolve_scope_entities` was added to preserve the boundary

This tool was not part of the smallest possible PRD tool list, but I added it because it keeps entity resolution deterministic. Without it, the model would need to guess what "Miami", "Aisha", or "flights" refer to before calling the real financial tools.

That would make the architecture weaker, not simpler.

### `query_expenses` was added as an escape hatch for flexible analysis

The eight structured tools cover the most common questions, but there are cross-cuts they cannot do — per-technician per-category breakdowns, weekly trends, top spenders by amount, or any grouping not pre-built.

`query_expenses` fills that gap. Gemini specifies which fields to return, how to group and aggregate, and what filters to apply. TypeScript runs the actual query. Gemini never writes SQL and never accesses the raw schema. Scope enforcement is identical to every other tool.

The model is instructed to prefer the more targeted tools when they cover the question and to reach for `query_expenses` only when they do not.

### `get_trip_summary` was added as a real business primitive

There is a meaningful difference between:

- showing expense rows
- explaining what happened on a technician trip or site visit

`get_trip_summary` exists so the model can answer the second class of question cleanly instead of reconstructing trips ad hoc from raw expenses.

### Scope handling is stricter than the original baseline

The prompt is deliberately strict when the user is on an org or project page and asks about something clearly outside that visible scope. Instead of answering loosely, the model is told to say it does not have visibility there.

That creates a cleaner trust model.

## Database Summary

### Base tables

- `organizations`
- `users`
- `projects`
- `revenue`
- `expenses`

### Indexes

The initial migration adds indexes on:

- `users.org_id`
- `projects.org_id`
- `revenue.project_id`
- `revenue.date`
- `expenses.project_id`
- `expenses.user_id`
- `expenses.date`
- `expenses.category`

### Reporting views

| View | Purpose |
| --- | --- |
| `expense_anomalies_v` | anomaly flags plus enriched expense rows |
| `project_financials_v` | project-level revenue, expenses, margin, travel, equipment, anomalies |
| `org_financials_v` | org-level rollup of project financials |
| `monthly_travel_trends_v` | monthly travel totals and per-survey averages |
| `monthly_profit_trends_v` | monthly revenue, expenses, and net profit |

## Repo Layout

```text
src/
  app/
    api/chat/route.ts
    page.tsx
    org/[orgId]/page.tsx
    project/[projectId]/page.tsx
  components/
    dashboard/
    chat/
    ui/
  lib/
    dashboard/queries.ts
    gemini/
    supabase/serverClient.ts
    tools/
supabase/
  migrations/
  config.toml
scripts/
  seed.cjs
  smoke-tools.ts
```

## Running Locally

### 1. Install

```bash
npm install
```

### 2. Create `.env.local`

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
GEMINI_API_KEY=your-gemini-api-key
```

If the seed script should target a different Supabase project than `NEXT_PUBLIC_SUPABASE_URL`, also set:

```bash
SUPABASE_URL=https://your-project.supabase.co
```

### 3. Apply migrations

If using the linked Supabase project:

```bash
supabase link --project-ref tzrsypzpeurtqbepvptl
supabase db push --include-all
```

### 4. Seed data

`supabase/seed.sql` is blank on purpose. The dataset is generated with:

```bash
npm run seed
```

That script creates:

- 2 organizations
- 4 projects
- 24 months of revenue and expense history
- the seeded anomalies used by the demo prompts

### 5. Start the app

```bash
npm run dev
```

### 6. Verify the important paths

```bash
npm run typecheck
npm run build
npm run verify:tools
```

## Deployment

Deploy the repo root to Vercel.

### Required environment variables

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GEMINI_API_KEY`

### Deployment flow

1. Import the repo into Vercel.
2. Add the environment variables.
3. Deploy the root project.
4. Verify:
   - `/` loads the global dashboard
   - `/org/[orgId]` loads the organization dashboard
   - `/project/[projectId]` loads the project dashboard
   - chat returns grounded answers and shows tool badges

## Demo Prompts

These are the main prompts the app should answer well:

1. `What is our overall net profit margin across all Home Depot locations?`
2. `How have average travel costs per survey changed over the last 24 months, and what's the projected expense run-rate for the upcoming quarter?`
3. `Run an audit on technician expenses over the last year. Are there any duplicate flight billings or unusually large equipment purchases we should investigate?`

The in-product starter prompts are slightly different because the final product leans more heavily into profit trend:

1. `What's our overall net profit margin across all Home Depot locations?`
2. `How has monthly net profit changed over the last 24 months, and where has momentum weakened most?`
3. `Run an audit on technician expenses over the last year. Any duplicate flight billings or unusually large equipment purchases?`

## What I Left Out

I kept the scope disciplined and left out:

- authentication and user management
- CRUD flows
- NL2SQL / raw schema exposure
- streaming chat
- real-time subscriptions
- heavyweight forecasting
- pagination / virtualization
- extra routes outside the three core scopes
- UI polish work that did not improve the core architecture

## Verification

The repo already has verification hooks for the core architecture:

- `npm run typecheck`
- `npm run build`
- `npm run verify:tools`

`scripts/smoke-tools.ts` covers:

- global, org, and project financials
- entity resolution
- filtered expenses and anomalies
- trip summaries
- travel trend
- profit trend
- forecasting

## Submission Links

- GitHub repo URL: `TODO`
- Live Vercel URL: `TODO`
- Demo video URL: `TODO`
