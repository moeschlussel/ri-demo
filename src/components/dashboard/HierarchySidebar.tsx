"use client";

import Link from "next/link";
import { Building2, ChevronLeft, ChevronRight, FolderKanban, Globe2, Layers3 } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { NavigationOrganizationNode, NavigationProjectNode, NavigationTree, Scope } from "@/lib/types";

function isOrganizationActive(scope: Scope, organizationId: string): boolean {
  return (
    (scope.type === "org" && scope.id === organizationId) ||
    (scope.type === "project" && scope.orgId === organizationId)
  );
}

function isProjectActive(scope: Scope, projectId: string): boolean {
  return scope.type === "project" && scope.id === projectId;
}

function projectStatusDotClass(status: string): string {
  if (status === "on_hold") {
    return "bg-[var(--warning)]";
  }

  if (status === "completed") {
    return "bg-slate-400";
  }

  return "bg-[var(--accent)]";
}

function projectCountLabel(count: number): string {
  return count === 1 ? "1 project" : `${count} projects`;
}

function orgCountLabel(count: number): string {
  return count === 1 ? "1 org" : `${count} orgs`;
}

function initials(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function CompactItem({
  href,
  label,
  active,
  icon,
  onNavigate
}: {
  href: string;
  label: string;
  active: boolean;
  icon: ReactNode;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      title={label}
      onClick={onNavigate}
      className={cn(
        "flex h-11 items-center justify-center rounded-2xl transition",
        active
          ? "bg-slate-950 text-white shadow-sm"
          : "text-slate-500 hover:bg-slate-100 hover:text-slate-900"
      )}
    >
      {icon}
      <span className="sr-only">{label}</span>
    </Link>
  );
}

function ExpandedTopLink({
  href,
  label,
  description,
  badge,
  active,
  icon,
  onNavigate
}: {
  href: string;
  label: string;
  description: string;
  badge?: string;
  active: boolean;
  icon: ReactNode;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      onClick={onNavigate}
      className={cn(
        "group flex items-start gap-3 rounded-2xl border px-3 py-3 transition",
        active
          ? "border-slate-950 bg-slate-950 text-white shadow-sm"
          : "border-transparent text-slate-700 hover:border-[color:var(--border)] hover:bg-white"
      )}
    >
      <span
        className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl transition",
          active ? "bg-white/12 text-white" : "bg-slate-100 text-slate-600 group-hover:bg-slate-200"
        )}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn("block truncate text-sm font-semibold", active ? "text-white" : "text-slate-900")}>{label}</span>
        <span className={cn("mt-1 block text-xs leading-5", active ? "text-slate-300" : "text-[var(--muted)]")}>
          {description}
        </span>
      </span>
      {badge ? (
        <span
          className={cn(
            "shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em]",
            active ? "bg-white/12 text-white" : "bg-slate-100 text-slate-600"
          )}
        >
          {badge}
        </span>
      ) : null}
    </Link>
  );
}

function ProjectRow({
  scope,
  project,
  onNavigate
}: {
  scope: Scope;
  project: NavigationProjectNode;
  onNavigate?: () => void;
}) {
  const active = isProjectActive(scope, project.id);

  return (
    <li>
      <Link
        href={`/project/${project.id}`}
        aria-current={active ? "page" : undefined}
        onClick={onNavigate}
        className={cn(
          "flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition",
          active
            ? "bg-slate-900 text-white shadow-sm"
            : "text-slate-700 hover:bg-white hover:text-slate-950"
        )}
      >
        <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", active ? "bg-white/70" : projectStatusDotClass(project.status))} />
        <span className={cn("min-w-0 flex-1 truncate font-medium", active ? "text-white" : "text-slate-700")}>{project.name}</span>
        <FolderKanban className={cn("h-3.5 w-3.5 shrink-0", active ? "text-white/70" : "text-slate-400")} />
      </Link>
    </li>
  );
}

function ExpandedOrganization({
  scope,
  organization,
  onNavigate
}: {
  scope: Scope;
  organization: NavigationOrganizationNode;
  onNavigate?: () => void;
}) {
  const active = isOrganizationActive(scope, organization.id);

  return (
    <li className="space-y-2">
      <Link
        href={`/org/${organization.id}`}
        aria-current={scope.type === "org" && scope.id === organization.id ? "page" : undefined}
        onClick={onNavigate}
        className={cn(
          "group flex items-start gap-3 rounded-2xl border px-3 py-3 transition",
          active
            ? "border-[var(--accent)] bg-[var(--accent-soft)] text-slate-950"
            : "border-[color:var(--border)] bg-white/85 text-slate-700 hover:bg-white"
        )}
      >
        <span
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-xs font-semibold",
            active ? "bg-[var(--accent)] text-white" : "bg-slate-100 text-slate-600"
          )}
        >
          {initials(organization.name)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{organization.name}</span>
          <span className="mt-1 block text-xs leading-5 text-[var(--muted)]">
            Organization dashboard with all projects nested underneath
          </span>
        </span>
        <span className="shrink-0 rounded-full bg-white/80 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-600">
          {projectCountLabel(organization.projectCount)}
        </span>
      </Link>

      <div className="ml-5 border-l border-[color:var(--border)] pl-4">
        {organization.projects.length === 0 ? (
          <p className="py-2 text-xs text-[var(--muted)]">No projects available under this organization.</p>
        ) : (
          <ul className="space-y-1.5">
            {organization.projects.map((project) => (
              <ProjectRow key={project.id} scope={scope} project={project} onNavigate={onNavigate} />
            ))}
          </ul>
        )}
      </div>
    </li>
  );
}

export function HierarchySidebar({
  scope,
  navigation,
  collapsed = false,
  mobile = false,
  onToggleCollapse,
  onNavigate
}: {
  scope: Scope;
  navigation: NavigationTree;
  collapsed?: boolean;
  mobile?: boolean;
  onToggleCollapse?: () => void;
  onNavigate?: () => void;
}) {
  const compact = collapsed && !mobile;

  return (
    <aside
      className={cn(
        "flex flex-col bg-white/94 text-slate-900 backdrop-blur-xl",
        mobile ? "w-full h-full" : "sticky top-0 h-screen border-r border-[color:var(--border)] transition-[width] duration-200 ease-out",
        compact ? "w-20" : "w-[22rem]"
      )}
    >
      <div className={cn("border-b border-[color:var(--border)]", compact ? "px-2 py-4" : "px-4 py-4")}>
        <div className={cn("flex items-center", compact ? "flex-col gap-3" : "justify-between gap-3")}>
          <div className={cn("flex min-w-0 items-center gap-3", compact && "flex-col")}>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-slate-950 text-sm font-semibold text-white">
              RI
            </div>
            {!compact ? (
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-950">Robotic Imaging</p>
                <p className="text-xs uppercase tracking-[0.12em] text-[var(--muted)]">Navigation</p>
              </div>
            ) : null}
          </div>

          {!mobile ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onToggleCollapse}
              className={cn("shrink-0", compact ? "w-10 px-0" : "h-10")}
              aria-label={compact ? "Expand sidebar" : "Collapse sidebar"}
            >
              {compact ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
            </Button>
          ) : null}
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className={cn("space-y-6", compact ? "px-2 py-4" : "px-4 py-5")}>
          {!compact ? (
            <div className="rounded-2xl border border-[color:var(--border)] bg-slate-50 px-4 py-3">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--accent)]">
                <Layers3 className="h-4 w-4" />
                Scope hierarchy
              </div>
              <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                Expand an organization to see the projects under it, then jump between levels from the same sidebar.
              </p>
            </div>
          ) : null}

          <nav aria-label="Dashboard hierarchy">
            {compact ? (
              <ul className="space-y-2">
                <li>
                  <CompactItem
                    href="/"
                    label="Global overview"
                    active={scope.type === "global"}
                    icon={<Globe2 className="h-4 w-4" />}
                    onNavigate={onNavigate}
                  />
                </li>
                {navigation.organizations.map((organization) => (
                  <li key={organization.id}>
                    <CompactItem
                      href={`/org/${organization.id}`}
                      label={organization.name}
                      active={isOrganizationActive(scope, organization.id)}
                      icon={<Building2 className="h-4 w-4" />}
                      onNavigate={onNavigate}
                    />
                  </li>
                ))}
              </ul>
            ) : (
              <ul className="space-y-3">
                <li>
                  <ExpandedTopLink
                    href="/"
                    label="Global overview"
                    description="Enterprise roll-up across all organizations and projects"
                    badge={orgCountLabel(navigation.organizationCount)}
                    active={scope.type === "global"}
                    icon={<Globe2 className="h-4 w-4" />}
                    onNavigate={onNavigate}
                  />
                </li>
                {navigation.organizations.map((organization) => (
                  <ExpandedOrganization
                    key={organization.id}
                    scope={scope}
                    organization={organization}
                    onNavigate={onNavigate}
                  />
                ))}
              </ul>
            )}
          </nav>
        </div>
      </ScrollArea>
    </aside>
  );
}
