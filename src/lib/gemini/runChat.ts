import {
  createPartFromFunctionResponse,
  createUserContent,
  createModelContent,
  FunctionCallingConfigMode,
  type Content,
  type GenerateContentConfig,
  type Part
} from "@google/genai";

import { getGeminiClient } from "@/lib/gemini/client";
import { buildSystemPrompt } from "@/lib/gemini/systemPrompt";
import { geminiFunctionDeclarations, runToolCall } from "@/lib/tools/toolRegistry";
import type { ChatHistoryEntry, ChatToolCallRecord, Scope } from "@/lib/types";

const CHAT_MODEL = "gemini-3.1-pro-preview";
// The previous runtime effectively capped the loop at 5 rounds. We now enforce
// a minimum budget of 10 actual tool calls and make the prompt/runtime agree.
const MIN_TOOL_CALL_LIMIT = 10;
const CONFIGURED_TOOL_CALL_LIMIT = 5;
const MAX_TOOL_CALLS = Math.max(CONFIGURED_TOOL_CALL_LIMIT, MIN_TOOL_CALL_LIMIT);
const MAX_TOOL_ROUNDS = MAX_TOOL_CALLS;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeScopedArgs(rawArgs: unknown, scope: Scope): Record<string, unknown> {
  const args = isRecord(rawArgs) ? { ...rawArgs } : {};

  if (scope.type === "global") {
    if (typeof args.scopeType !== "string") {
      args.scopeType = "global";
    }
    return args;
  }

  if (typeof args.scopeType !== "string") {
    args.scopeType = scope.type;
  }

  if (args.scopeType === scope.type) {
    args.scopeId = scope.id;
  }

  return args;
}

function convertHistoryToContents(history: ChatHistoryEntry[]): Content[] {
  return history.map((entry) =>
    entry.role === "user" ? createUserContent(entry.content) : createModelContent(entry.content)
  );
}

function buildChatConfig(
  scope: Scope,
  options?: { toolBudgetExhausted?: boolean; toolsEnabled?: boolean }
): GenerateContentConfig {
  const config: GenerateContentConfig = {
    // Gemini 3 uses dynamic thinking by default. We intentionally rely on that
    // behavior instead of forcing a fixed budget so the model can spend more
    // effort on deeper questions without wasting tokens on simple ones.
    systemInstruction: buildSystemPrompt(scope, MAX_TOOL_CALLS, {
      toolBudgetExhausted: options?.toolBudgetExhausted
    })
  };

  if (options?.toolsEnabled === false) {
    return config;
  }

  return {
    ...config,
    tools: [{ functionDeclarations: geminiFunctionDeclarations }],
    toolConfig: {
      functionCallingConfig: {
        mode: FunctionCallingConfigMode.AUTO
      }
    }
  };
}

function formatToolTranscript(toolCalls: ChatToolCallRecord[]): string {
  return toolCalls
    .map(
      (toolCall, index) =>
        `Tool call ${index + 1}: ${toolCall.name}\nArgs: ${JSON.stringify(toolCall.args)}\nResult: ${JSON.stringify(toolCall.result, null, 2)}`
    )
    .join("\n\n");
}

async function generateBudgetLimitedAnswer(params: {
  ai: ReturnType<typeof getGeminiClient>;
  scope: Scope;
  history: ChatHistoryEntry[];
  message: string;
  toolCalls: ChatToolCallRecord[];
  skippedToolCalls: number;
}): Promise<string> {
  const response = await params.ai.models.generateContent({
    model: CHAT_MODEL,
    config: buildChatConfig(params.scope, {
      toolBudgetExhausted: true,
      toolsEnabled: false
    }),
    contents: [
      ...convertHistoryToContents(params.history),
      createUserContent(
        [
          `User question: ${params.message}`,
          `You have already used ${params.toolCalls.length} of ${MAX_TOOL_CALLS} allowed tool calls for this answer.`,
          params.skippedToolCalls > 0
            ? `The model attempted to request ${params.skippedToolCalls} additional tool call${params.skippedToolCalls === 1 ? "" : "s"} beyond the limit. You are not allowed to make those calls.`
            : "You are not allowed to make any more tool calls for this answer.",
          "Answer now using only the data already gathered below. If the evidence is incomplete, say what you know, what you infer, and what remains uncertain.",
          "",
          "Tool transcript:",
          formatToolTranscript(params.toolCalls)
        ].join("\n")
      )
    ]
  });

  return (
    response.text ??
    "I reached the tool-call limit, so I'm answering with the data already gathered. I don't have enough grounded evidence to say more with confidence."
  );
}

export async function runCfoChat(params: {
  message: string;
  scope: Scope;
  history: ChatHistoryEntry[];
}): Promise<{ reply: string; toolCalls: ChatToolCallRecord[] }> {
  const ai = getGeminiClient();
  const toolCalls: ChatToolCallRecord[] = [];
  const chat = ai.chats.create({
    model: CHAT_MODEL,
    config: buildChatConfig(params.scope),
    history: convertHistoryToContents(params.history)
  });

  let response = await chat.sendMessage({ message: params.message });

  for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
    const usage = response.usageMetadata;
    if (usage) {
      console.log(`[Gemini round ${round}] thoughts=${usage.thoughtsTokenCount ?? 0} output=${usage.candidatesTokenCount ?? 0}`);
    }

    const functionCalls = response.functionCalls ?? [];
    if (functionCalls.length === 0) {
      return {
        reply:
          response.text ??
          "I couldn't produce a grounded response for that request. Please try again with a more specific question.",
        toolCalls
      };
    }

    const remainingToolCalls = MAX_TOOL_CALLS - toolCalls.length;
    if (remainingToolCalls <= 0) {
      return {
        reply: await generateBudgetLimitedAnswer({
          ai,
          scope: params.scope,
          history: params.history,
          message: params.message,
          toolCalls,
          skippedToolCalls: functionCalls.length
        }),
        toolCalls
      };
    }

    const executableCalls = functionCalls.slice(0, remainingToolCalls);
    const skippedToolCalls = functionCalls.length - executableCalls.length;
    const functionResponses: Part[] = [];
    for (const call of executableCalls) {
      const name = call.name ?? "unknown_tool";
      const args = normalizeScopedArgs(call.args, params.scope);
      const result = await runToolCall(name, args, params.scope);
      toolCalls.push({
        name,
        args,
        result
      });
      functionResponses.push(createPartFromFunctionResponse(call.id ?? name, name, result));
    }

    if (skippedToolCalls > 0 || toolCalls.length >= MAX_TOOL_CALLS) {
      return {
        reply: await generateBudgetLimitedAnswer({
          ai,
          scope: params.scope,
          history: params.history,
          message: params.message,
          toolCalls,
          skippedToolCalls
        }),
        toolCalls
      };
    }

    response = await chat.sendMessage({ message: functionResponses });
  }

  return {
    reply: await generateBudgetLimitedAnswer({
      ai,
      scope: params.scope,
      history: params.history,
      message: params.message,
      toolCalls,
      skippedToolCalls: 0
    }),
    toolCalls
  };
}
