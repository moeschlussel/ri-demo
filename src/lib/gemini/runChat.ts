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
const MAX_TOOL_ROUNDS = 5;

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

function buildChatConfig(scope: Scope): GenerateContentConfig {
  return {
    // Gemini 3 uses dynamic thinking by default. We intentionally rely on that
    // behavior instead of forcing a fixed budget so the model can spend more
    // effort on deeper questions without wasting tokens on simple ones.
    systemInstruction: buildSystemPrompt(scope),
    tools: [{ functionDeclarations: geminiFunctionDeclarations }],
    toolConfig: {
      functionCallingConfig: {
        mode: FunctionCallingConfigMode.AUTO
      }
    }
  };
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

    const functionResponses: Part[] = [];
    for (const call of functionCalls) {
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

    response = await chat.sendMessage({ message: functionResponses });
  }

  return {
    reply:
      "I stopped the analysis because the tool loop exceeded the safety limit. Please retry with a narrower question.",
    toolCalls
  };
}
