"use client";

import { MessageSquareText, Send, Trash2 } from "lucide-react";
import { useEffect, useState, useTransition } from "react";

import { MessageBubble } from "@/components/chat/MessageBubble";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import type { ChatHistoryEntry, ChatToolCallRecord, Scope } from "@/lib/types";

type ChatMessage = {
  id: string;
  role: "user" | "model";
  content: string;
  toolCalls?: ChatToolCallRecord[];
};

const starterPrompts = [
  "What's our overall net profit margin across all Home Depot locations?",
  "How have average travel costs per survey changed over the last 24 months, and what's the projected run-rate for next quarter?",
  "Run an audit on technician expenses over the last year. Any duplicate flight billings or unusually large equipment purchases?"
];

function scopeLabel(scope: Scope): string {
  if (scope.type === "global") {
    return "Global";
  }

  if (scope.type === "org") {
    return scope.name;
  }

  return `${scope.orgName} / ${scope.name}`;
}

function buildHistory(messages: ChatMessage[]): ChatHistoryEntry[] {
  return messages.map((message) => ({
    role: message.role,
    content: message.content
  }));
}

function ChatPanel({
  scope,
  messages,
  input,
  isPending,
  onInputChange,
  onSend,
  onClear
}: {
  scope: Scope;
  messages: ChatMessage[];
  input: string;
  isPending: boolean;
  onInputChange: (value: string) => void;
  onSend: (message?: string) => void;
  onClear: () => void;
}) {
  return (
    <Card className="flex h-full flex-col overflow-hidden">
      <CardHeader className="space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle>AI CFO</CardTitle>
            <CardDescription>Grounded Gemini analysis using the shared financial tool layer.</CardDescription>
          </div>
          <Button variant="ghost" size="sm" onClick={onClear}>
            <Trash2 className="mr-1 h-4 w-4" />
            Clear
          </Button>
        </div>
        <div className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-slate-700">
          Scope: {scopeLabel(scope)}
        </div>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col gap-4 p-0">
        <ScrollArea className="min-h-0 flex-1 px-4">
          <div className="space-y-4 py-4">
            {messages.length === 0 ? (
              <div className="space-y-3">
                <p className="text-sm text-[var(--muted)]">Starter prompts</p>
                <div className="space-y-2">
                  {starterPrompts.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      onClick={() => onSend(prompt)}
                      className="w-full rounded-2xl border border-[color:var(--border)] bg-white p-3 text-left text-sm text-slate-700 transition hover:border-[var(--accent)] hover:text-slate-900"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            {messages.map((message) => (
              <MessageBubble
                key={message.id}
                role={message.role}
                content={message.content}
                toolCalls={message.toolCalls}
              />
            ))}
            {isPending ? (
              <div className="rounded-2xl bg-white px-4 py-3 text-sm text-[var(--muted)] shadow-sm">
                CFO is analyzing...
              </div>
            ) : null}
          </div>
        </ScrollArea>
        <div className="border-t border-[color:var(--border)] px-4 py-4">
          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              onSend();
            }}
          >
            <Input
              value={input}
              onChange={(event) => onInputChange(event.target.value)}
              placeholder="Ask about margin, travel trends, or anomalies..."
            />
            <Button type="submit" disabled={isPending}>
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </div>
      </CardContent>
    </Card>
  );
}

export function CfoChatSidebar({ scope }: { scope: Scope }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const handlePrefill = (event: Event) => {
      const customEvent = event as CustomEvent<{ message?: string }>;
      if (customEvent.detail?.message) {
        setInput(customEvent.detail.message);
        setMobileOpen(true);
      }
    };

    window.addEventListener("cfo-chat-prefill", handlePrefill as EventListener);
    return () => {
      window.removeEventListener("cfo-chat-prefill", handlePrefill as EventListener);
    };
  }, []);

  function sendMessage(overrideMessage?: string) {
    const trimmed = (overrideMessage ?? input).trim();
    if (!trimmed) {
      return;
    }

    const nextUserMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: trimmed
    };

    setMessages((current) => [...current, nextUserMessage]);
    setInput("");

    startTransition(async () => {
      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            message: trimmed,
            scope,
            history: buildHistory(messages)
          })
        });

        const payload = (await response.json()) as {
          reply: string;
          toolCalls: ChatToolCallRecord[];
        };

        setMessages((current) => [
          ...current,
          {
            id: crypto.randomUUID(),
            role: "model",
            content: payload.reply,
            toolCalls: payload.toolCalls
          }
        ]);
      } catch {
        setMessages((current) => [
          ...current,
          {
            id: crypto.randomUUID(),
            role: "model",
            content: "I couldn't complete that analysis. Please try again."
          }
        ]);
      }
    });
  }

  return (
    <>
      <div className="hidden h-[calc(100vh-3rem)] lg:block">
        <ChatPanel
          scope={scope}
          messages={messages}
          input={input}
          isPending={isPending}
          onInputChange={setInput}
          onSend={sendMessage}
          onClear={() => setMessages([])}
        />
      </div>
      <div className="fixed bottom-5 right-5 z-30 lg:hidden">
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger asChild>
            <Button size="lg" className="rounded-full shadow-xl">
              <MessageSquareText className="mr-2 h-4 w-4" />
              CFO Chat
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="max-w-full sm:max-w-lg">
            <SheetHeader className="sr-only">
              <SheetTitle>AI CFO Chat</SheetTitle>
            </SheetHeader>
            <div className="h-full pt-6">
              <ChatPanel
                scope={scope}
                messages={messages}
                input={input}
                isPending={isPending}
                onInputChange={setInput}
                onSend={sendMessage}
                onClear={() => setMessages([])}
              />
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </>
  );
}

