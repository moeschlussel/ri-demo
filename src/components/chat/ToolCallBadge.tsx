import { Badge } from "@/components/ui/badge";

export function ToolCallBadge({
  name,
  hasError
}: {
  name: string;
  hasError?: boolean;
}) {
  return <Badge tone={hasError ? "danger" : "accent"}>Called tool: {name}</Badge>;
}

