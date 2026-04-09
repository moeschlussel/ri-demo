import { z } from "zod";

import { runCfoChat } from "@/lib/gemini/runChat";
import type { Scope } from "@/lib/types";

const ScopeSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("global")
  }),
  z.object({
    type: z.literal("org"),
    id: z.string().uuid(),
    name: z.string()
  }),
  z.object({
    type: z.literal("project"),
    id: z.string().uuid(),
    name: z.string(),
    orgName: z.string()
  })
]);

const ChatRequestSchema = z.object({
  message: z.string().min(1),
  scope: ScopeSchema,
  history: z.array(
    z.object({
      role: z.enum(["user", "model"]),
      content: z.string().min(1)
    })
  )
});

export async function POST(request: Request): Promise<Response> {
  try {
    const body = ChatRequestSchema.parse(await request.json());
    const result = await runCfoChat({
      message: body.message,
      scope: body.scope as Scope,
      history: body.history
    });

    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to process chat request";
    return Response.json(
      {
        reply: "I couldn't process that request. Please try again.",
        toolCalls: [],
        error: message
      },
      { status: 400 }
    );
  }
}

