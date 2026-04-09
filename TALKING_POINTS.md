# Structure

It's structured so you can see the financials of the whole company. You can click on an organization or a project where you will see the total revenue, expenses, profit margin, travel spend, and flagged anomalies.

You have your nav on the left and the AI CFO on the right — if you're on mobile it's on the bottom.

You can scroll down to see all the data, which you can filter by category, technician, or whether it was flagged.

---

# Anomaly Talking Points

When you click on flagged anomalies you see anything we flagged as possible fraud.

The fraud detection here is deterministic and simple.

It flags:

- Any duplicate expenses
- Any expense category that is not `Flight`, `Hotel`, `Meals`, or `Equipment`
- Any equipment expense above `$5,000`
- Any expense that is more than `3x` the average for its category

Simple way to explain it:

"We are not using AI to invent fraud flags. We use fixed rules. We flag duplicates, anything outside the approved categories, any equipment purchase over $5,000, and any expense that is more than three times the normal average for that category."

---
# AI CFO — How It Works

When you ask a question, here is exactly what happens:

1. **Understands** your question and the current scope — injected automatically from the page you're on, you never have to say "I'm looking at Miami"
2. **Plans** which tools to call and in what order
3. **Executes** the tools and gets real data
4. **Evaluates** whether it has enough to answer well — if not, calls more tools (up to 5 rounds)
5. **Reasons** over everything it collected — spots patterns, forms opinions
6. **Answers** like a CFO who knows the business, not a search engine

**The tools:**

- `resolve_scope_entities` — translates "Miami" or "Aisha" into real IDs before touching any data. Runs first, almost always.
- `get_scope_financials` — headline KPIs for the current scope
- `get_expense_breakdown` — individual expense rows with anomaly flags
- `get_profit_trend` / `get_travel_trend` — monthly trends over time
- `detect_anomalies` — flags unusual expenses using fixed statistical rules
- `forecast_expenses` — projects forward using trailing averages
- `get_trip_summary` — groups expenses into per-trip narratives
- `query_expenses` — flexible query for when no other tool covers the question: Gemini specifies which fields to return, how to group and aggregate, and what to filter — TypeScript runs the actual query, Gemini never touches SQL

A question like "why is this project losing money?" will trigger `get_scope_financials`, then `get_expense_breakdown`, then `detect_anomalies` — Gemini decides that chain itself, not you.

When someone asks something the pre-built tools don't cover — like the top spenders by category, a week-by-week breakdown, or the 10 largest individual expenses — Gemini reaches for `query_expenses`. It tells the tool exactly what fields it wants, how to group them, and what to filter. The tool fetches it, validates it, and hands it back. Gemini still never writes a query and still cannot see more than the scope allows.

**The constraints:** Gemini cannot go outside the tools. No raw SQL, no schema access, no invented numbers. The scope is enforced at every step — you cannot query data above your access level. If the dashboard shows $275K profit, the chat will too. They're reading the same place.