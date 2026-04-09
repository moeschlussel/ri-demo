import type { FunctionDeclaration } from "@google/genai";
import { z } from "zod";

import {
  detectAnomalies,
  DetectAnomaliesInput,
  DetectAnomaliesOutput
} from "@/lib/tools/detectAnomalies";
import {
  forecastExpenses,
  ForecastExpensesInput,
  ForecastExpensesOutput
} from "@/lib/tools/forecastExpenses";
import {
  getExpenseBreakdown,
  GetExpenseBreakdownInput,
  GetExpenseBreakdownOutput
} from "@/lib/tools/getExpenseBreakdown";
import { getTripSummary, GetTripSummaryInput, GetTripSummaryOutput } from "@/lib/tools/getTripSummary";
import {
  getScopeFinancials,
  GetScopeFinancialsInput,
  GetScopeFinancialsOutput
} from "@/lib/tools/getScopeFinancials";
import {
  resolveScopeEntities,
  ResolveScopeEntitiesInput,
  ResolveScopeEntitiesOutput
} from "@/lib/tools/resolveScopeEntities";
import { getTravelTrend, GetTravelTrendInput, GetTravelTrendOutput } from "@/lib/tools/getTravelTrend";

function createScopeProperties() {
  return {
    scopeType: {
      type: "string",
      enum: ["global", "org", "project"],
      description: "The scope level for the query."
    },
    scopeId: {
      type: "string",
      description: "Required for organization and project scope. Omit for global scope."
    }
  };
}

export const toolRegistry = {
  resolve_scope_entities: {
    description:
      "Resolve organizations, projects, technicians, and expense categories mentioned in natural language inside the current scope.",
    inputSchema: ResolveScopeEntitiesInput,
    outputSchema: ResolveScopeEntitiesOutput,
    handler: resolveScopeEntities,
    geminiDeclaration: {
      name: "resolve_scope_entities",
      description:
        "Resolve natural-language mentions such as cities, project nicknames, technician names, and expense categories into exact ids or canonical values within the current scope.",
      parametersJsonSchema: {
        type: "object",
        properties: {
          ...createScopeProperties(),
          queries: {
            type: "array",
            description:
              "One or more phrases to resolve. These can be short names like ['Miami', 'Seattle'] or longer natural-language snippets like ['how was the miami project'].",
            items: {
              type: "string"
            },
            minItems: 1,
            maxItems: 5
          },
          entityTypes: {
            type: "array",
            description: "Optional filter for which scope types to search.",
            items: {
              type: "string",
              enum: ["org", "project", "technician", "category"]
            }
          },
          limitPerQuery: {
            type: "number",
            description: "Maximum number of matches to return per query.",
            minimum: 1,
            maximum: 5
          }
        },
        required: ["scopeType", "queries"]
      }
    }
  },
  get_scope_financials: {
    description: "Return deterministic headline KPI values for the requested scope.",
    inputSchema: GetScopeFinancialsInput,
    outputSchema: GetScopeFinancialsOutput,
    handler: getScopeFinancials,
    geminiDeclaration: {
      name: "get_scope_financials",
      description: "Return revenue, expenses, net profit, margin, travel spend, equipment spend, anomaly count, and project count for a scope.",
      parametersJsonSchema: {
        type: "object",
        properties: createScopeProperties(),
        required: ["scopeType"]
      }
    }
  },
  get_expense_breakdown: {
    description: "Return scoped expense rows with anomaly metadata and optional filters.",
    inputSchema: GetExpenseBreakdownInput,
    outputSchema: GetExpenseBreakdownOutput,
    handler: getExpenseBreakdown,
    geminiDeclaration: {
      name: "get_expense_breakdown",
      description:
        "Return individual expense rows for a scope, optionally filtered by category, technician, project, date, or anomaly-only mode.",
      parametersJsonSchema: {
        type: "object",
        properties: {
          ...createScopeProperties(),
          category: {
            type: "string",
            description: "Optional category filter such as Flight, Hotel, Meals, or Equipment."
          },
          categories: {
            type: "array",
            description: "Optional category filters. Conversational labels like flights, hotel, food, or gear are acceptable.",
            items: {
              type: "string"
            }
          },
          technicianIds: {
            type: "array",
            description: "Optional technician ids returned by resolve_scope_entities.",
            items: {
              type: "string"
            }
          },
          projectIds: {
            type: "array",
            description: "Optional project ids returned by resolve_scope_entities.",
            items: {
              type: "string"
            }
          },
          exactDate: {
            type: "string",
            description: "Optional exact trip date in YYYY-MM-DD format."
          },
          startDate: {
            type: "string",
            description: "Optional start date in YYYY-MM-DD format."
          },
          endDate: {
            type: "string",
            description: "Optional end date in YYYY-MM-DD format."
          },
          onlyAnomalies: {
            type: "boolean",
            description: "When true, return only flagged expense rows."
          },
          limit: {
            type: "number",
            description: "Maximum number of rows to return.",
            minimum: 1,
            maximum: 500
          }
        },
        required: ["scopeType"]
      }
    }
  },
  get_trip_summary: {
    description: "Return grouped trip summaries for scoped expense data.",
    inputSchema: GetTripSummaryInput,
    outputSchema: GetTripSummaryOutput,
    handler: getTripSummary,
    geminiDeclaration: {
      name: "get_trip_summary",
      description:
        "Return trip-level summaries grouped by project, technician, and trip date. Use this when the user asks about a trip, site visit, or what happened on a specific survey run.",
      parametersJsonSchema: {
        type: "object",
        properties: {
          ...createScopeProperties(),
          technicianIds: {
            type: "array",
            description: "Optional technician ids returned by resolve_scope_entities.",
            items: {
              type: "string"
            }
          },
          projectIds: {
            type: "array",
            description: "Optional project ids returned by resolve_scope_entities.",
            items: {
              type: "string"
            }
          },
          categories: {
            type: "array",
            description: "Optional category filters. Conversational labels like flights, hotel, food, or gear are acceptable.",
            items: {
              type: "string"
            }
          },
          exactDate: {
            type: "string",
            description: "Optional exact trip date in YYYY-MM-DD format."
          },
          startDate: {
            type: "string",
            description: "Optional start date in YYYY-MM-DD format."
          },
          endDate: {
            type: "string",
            description: "Optional end date in YYYY-MM-DD format."
          },
          onlyAnomalies: {
            type: "boolean",
            description: "When true, only use anomalous expense rows when constructing trips."
          },
          includeExpenses: {
            type: "boolean",
            description: "When true, include the underlying expense rows for each returned trip."
          },
          limitTrips: {
            type: "number",
            description: "Maximum number of trips to return.",
            minimum: 1,
            maximum: 100
          }
        },
        required: ["scopeType"]
      }
    }
  },
  get_travel_trend: {
    description: "Return monthly travel-spend trend data and summary metrics for a scope.",
    inputSchema: GetTravelTrendInput,
    outputSchema: GetTravelTrendOutput,
    handler: getTravelTrend,
    geminiDeclaration: {
      name: "get_travel_trend",
      description: "Return monthly travel cost per survey over time and the headline trend summary.",
      parametersJsonSchema: {
        type: "object",
        properties: {
          ...createScopeProperties(),
          months: {
            type: "number",
            description: "How many trailing months of travel trend data to return.",
            minimum: 1,
            maximum: 36
          }
        },
        required: ["scopeType"]
      }
    }
  },
  detect_anomalies: {
    description: "Return deterministic anomaly findings for a scope and lookback window.",
    inputSchema: DetectAnomaliesInput,
    outputSchema: DetectAnomaliesOutput,
    handler: detectAnomalies,
    geminiDeclaration: {
      name: "detect_anomalies",
      description:
        "Return deterministic flagged expense anomalies for the requested scope and lookback period, optionally filtered by project, technician, category, or date.",
      parametersJsonSchema: {
        type: "object",
        properties: {
          ...createScopeProperties(),
          technicianIds: {
            type: "array",
            description: "Optional technician ids returned by resolve_scope_entities.",
            items: {
              type: "string"
            }
          },
          projectIds: {
            type: "array",
            description: "Optional project ids returned by resolve_scope_entities.",
            items: {
              type: "string"
            }
          },
          categories: {
            type: "array",
            description: "Optional category filters. Conversational labels like flights, hotel, food, or gear are acceptable.",
            items: {
              type: "string"
            }
          },
          exactDate: {
            type: "string",
            description: "Optional exact trip date in YYYY-MM-DD format."
          },
          startDate: {
            type: "string",
            description: "Optional start date in YYYY-MM-DD format."
          },
          endDate: {
            type: "string",
            description: "Optional end date in YYYY-MM-DD format."
          },
          lookbackMonths: {
            type: "number",
            description: "How many months to look back when auditing expenses.",
            minimum: 1,
            maximum: 36
          }
        },
        required: ["scopeType"]
      }
    }
  },
  forecast_expenses: {
    description: "Return a deterministic next-quarter style expense forecast using trailing averages.",
    inputSchema: ForecastExpensesInput,
    outputSchema: ForecastExpensesOutput,
    handler: forecastExpenses,
    geminiDeclaration: {
      name: "forecast_expenses",
      description: "Forecast total expenses and travel spend using trailing monthly averages and scenario math.",
      parametersJsonSchema: {
        type: "object",
        properties: {
          ...createScopeProperties(),
          lookbackMonths: {
            type: "number",
            description: "How many recent months to average.",
            minimum: 1,
            maximum: 12
          },
          horizonMonths: {
            type: "number",
            description: "How many months to project forward.",
            minimum: 1,
            maximum: 12
          }
        },
        required: ["scopeType"]
      }
    }
  }
} as const;

export type ToolName = keyof typeof toolRegistry;

export const geminiFunctionDeclarations = Object.values(toolRegistry).map(
  (tool) => tool.geminiDeclaration
);

export async function runToolCall(name: string, rawArgs: unknown): Promise<Record<string, unknown>> {
  const tool = toolRegistry[name as ToolName] as
    | undefined
    | {
        inputSchema: z.ZodSchema;
        outputSchema: z.ZodSchema;
        handler: (input: unknown) => Promise<unknown>;
        geminiDeclaration: FunctionDeclaration;
      };
  if (!tool) {
    return {
      error: `Unknown tool: ${name}`
    };
  }

  try {
    const parsedInput = tool.inputSchema.parse(rawArgs);
    const result = await tool.handler(parsedInput);
    return tool.outputSchema.parse(result) as Record<string, unknown>;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown tool error";
    return {
      error: message
    };
  }
}
