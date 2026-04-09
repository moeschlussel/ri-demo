import Link from "next/link";

import type { Scope } from "@/lib/types";

export function Breadcrumbs({ scope }: { scope: Scope }) {
  return (
    <nav className="flex items-center gap-2 text-sm text-[var(--muted)]">
      <Link href="/" className="font-medium text-slate-700 transition hover:text-slate-900">
        Global
      </Link>
      {scope.type !== "global" ? <span>/</span> : null}
      {scope.type === "org" ? <span className="font-medium text-slate-900">{scope.name}</span> : null}
      {scope.type === "project" ? (
        <>
          <Link href={`/org/${scope.orgId}`} className="font-medium text-slate-700 transition hover:text-slate-900">
            {scope.orgName}
          </Link>
          <span>/</span>
          <span className="font-medium text-slate-900">{scope.name}</span>
        </>
      ) : null}
    </nav>
  );
}
