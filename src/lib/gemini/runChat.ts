import {
  createModelContent,
  createPartFromFunctionCall,
  createPartFromFunctionResponse,
  createUserContent,
  FunctionCallingConfigMode
} from "@google/genai";

import { getGeminiClient } from "@/lib/gemini/client";
import { buildSystemPrompt } from "@/lib/gemini/systemPrompt";
import { geminiFunctionDeclarations, runToolCall } from "@/lib/tools/toolRegistry";
import type { ChatHistoryEntry, ChatToolCallRecord, Scope } from "@/lib/types";

const CHAT_MODEL = "gemini-2.5-flash";
const MAX_TOOL_ROUNDS = 5;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
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

  if (args.scopeType === scope.type && !isUuid(args.scopeId)) {
    args.scopeId = scope.id;
  }

  return args;
}

function convertHistoryToContents(history: ChatHistoryEntry[]) {
  return history.map((entry) =>
    entry.role === "user" ? createUserContent(entry.content) : createModelContent(entry.content)
  );
}

export async function runCfoChat(params: {
  message: string;
  scope: Scope;
  history: ChatHistoryEntry[];
}): Promise<{ reply: string; toolCalls: ChatToolCallRecord[] }> {
  const ai = getGeminiClient();
  const contents = [...convertHistoryToContents(params.history), createUserContent(params.message)];
  const toolCalls: ChatToolCallRecord[] = [];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
    const response = await ai.models.generateContent({
      model: CHAT_MODEL,
      contents,
      config: {
        systemInstruction: buildSystemPrompt(params.scope),
        tools: [{ functionDeclarations: geminiFunctionDeclarations }],
        toolConfig: {
          functionCallingConfig: {
            mode: FunctionCallingConfigMode.AUTO
          }
        }
      }
    });

    const functionCalls = response.functionCalls ?? [];
    if (functionCalls.length === 0) {
      return {
        reply:
          response.text ??
          "I couldn't produce a grounded response for that request. Please try again with a more specific question.",
        toolCalls
      };
    }

    contents.push(
      createModelContent(
        functionCalls.map((call) =>
          createPartFromFunctionCall(call.name ?? "unknown_tool", isRecord(call.args) ? call.args : {})
        )
      )
    );

    const functionResponses = [];
    for (const call of functionCalls) {
      const name = call.name ?? "unknown_tool";
      const args = normalizeScopedArgs(call.args, params.scope);
      const result = await runToolCall(name, args);
      toolCalls.push({
        name,
        args,
        result
      });
      functionResponses.push(createPartFromFunctionResponse(call.id ?? name, name, result));
    }

    contents.push(createUserContent(functionResponses));
  }

  return {
    reply:
      "I stopped the analysis because the tool loop exceeded the safety limit. Please retry with a narrower question.",
    toolCalls
  };
}
