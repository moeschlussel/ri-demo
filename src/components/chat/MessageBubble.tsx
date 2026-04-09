import type { ChatToolCallRecord } from "@/lib/types";
import { ToolCallBadge } from "@/components/chat/ToolCallBadge";
import { cn } from "@/lib/utils";

type MessageBubbleProps = {
  role: "user" | "model";
  content: string;
  toolCalls?: ChatToolCallRecord[];
};

export function MessageBubble({ role, content, toolCalls }: MessageBubbleProps) {
  const isUser = role === "user";

  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div className={cn("flex max-w-[90%] flex-col space-y-3", isUser ? "items-end" : "items-start")}>
        <div
          className={cn(
            "whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-6 shadow-sm",
            isUser ? "bg-slate-900 text-white" : "bg-white text-slate-900"
          )}
        >
          {content}
        </div>
        {toolCalls && toolCalls.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {toolCalls.map((toolCall, index) => (
              <ToolCallBadge
                key={`${toolCall.name}-${index}`}
                name={toolCall.name}
                hasError={typeof toolCall.result.error === "string"}
              />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
