import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="space-y-4 rounded-[2rem] border border-[color:var(--border)] bg-white p-8 text-center shadow-xl">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--accent)]">Not found</p>
        <h1 className="text-3xl font-semibold text-slate-950">That dashboard scope doesn’t exist.</h1>
        <p className="max-w-lg text-sm leading-6 text-[var(--muted)]">
          The organization or project id in the URL did not resolve to a record in the current Supabase dataset.
        </p>
        <Button asChild>
          <Link href="/">Return to global dashboard</Link>
        </Button>
      </div>
    </div>
  );
}

