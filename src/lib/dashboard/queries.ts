import { getServerSupabaseClient } from "@/lib/supabase/serverClient";
import { roundNumber } from "@/lib/format";
import type {
  ChildOrganizationRow,
  ChildProjectRow,
  NavigationOrganizationNode,
  NavigationProjectNode,
  NavigationTree,
  Scope
} from "@/lib/types";
import { toNumber, toString, unwrapResponse, type GenericRow } from "@/lib/tools/shared";

type NamedRow = GenericRow & {
  id: string;
  name: string;
};

type ProjectRow = GenericRow & {
  id: string;
  org_id: string;
};

type NavigationProjectRow = GenericRow & {
  id: string;
  org_id: string;
  name: string;
  status: string | null;
};

export async function getOrganizationScope(orgId: string): Promise<Scope | null> {
  const supabase = getServerSupabaseClient();
  const row = await unwrapResponse(
    supabase.from("organizations").select("id, name").eq("id", orgId).maybeSingle(),
    "Failed loading organization scope"
  );

  if (!row) {
    return null;
  }

  const organization = row as NamedRow;
  return {
    type: "org",
    id: organization.id,
    name: toString(organization.name, "Organization")
  };
}

export async function getProjectScope(projectId: string): Promise<Scope | null> {
  const supabase = getServerSupabaseClient();
  const project = await unwrapResponse(
    supabase.from("projects").select("id, org_id, name").eq("id", projectId).maybeSingle(),
    "Failed loading project scope"
  );

  if (!project) {
    return null;
  }

  const projectRow = project as ProjectRow;
  const organization = await unwrapResponse(
    supabase.from("organizations").select("id, name").eq("id", projectRow.org_id).maybeSingle(),
    "Failed loading project organization"
  );

  return {
    type: "project",
    id: projectRow.id,
    name: toString(projectRow.name, "Project"),
    orgId: projectRow.org_id,
    orgName: organization ? toString((organization as NamedRow).name, "Organization") : "Organization"
  };
}

export async function getChildOrganizationRows(): Promise<ChildOrganizationRow[]> {
  const supabase = getServerSupabaseClient();
  const rows = await unwrapResponse(
    supabase
      .from("org_financials_v")
      .select(
        "org_id, org_name, project_count, total_revenue, total_expenses, net_profit, margin_pct, travel_spend, anomaly_count"
      )
      .order("total_revenue", { ascending: false }),
    "Failed loading organization table"
  );

  return (rows as GenericRow[]).map((row) => ({
    id: toString(row.org_id),
    name: toString(row.org_name, "Organization"),
    totalRevenue: roundNumber(toNumber(row.total_revenue)),
    totalExpenses: roundNumber(toNumber(row.total_expenses)),
    netProfit: roundNumber(toNumber(row.net_profit)),
    marginPct: roundNumber(toNumber(row.margin_pct)),
    travelSpend: roundNumber(toNumber(row.travel_spend)),
    anomalyCount: toNumber(row.anomaly_count),
    projectCount: toNumber(row.project_count)
  }));
}

export async function getChildProjectRows(orgId: string): Promise<ChildProjectRow[]> {
  const supabase = getServerSupabaseClient();
  const rows = await unwrapResponse(
    supabase
      .from("project_financials_v")
      .select(
        "project_id, project_name, status, budget, total_revenue, total_expenses, net_profit, margin_pct, travel_spend, anomaly_count"
      )
      .eq("org_id", orgId)
      .order("total_revenue", { ascending: false }),
    "Failed loading project table"
  );

  return (rows as GenericRow[]).map((row) => ({
    id: toString(row.project_id),
    name: toString(row.project_name, "Project"),
    status: toString(row.status, "active"),
    budget: roundNumber(toNumber(row.budget)),
    totalRevenue: roundNumber(toNumber(row.total_revenue)),
    totalExpenses: roundNumber(toNumber(row.total_expenses)),
    netProfit: roundNumber(toNumber(row.net_profit)),
    marginPct: roundNumber(toNumber(row.margin_pct)),
    travelSpend: roundNumber(toNumber(row.travel_spend)),
    anomalyCount: toNumber(row.anomaly_count)
  }));
}

export async function getNavigationTree(): Promise<NavigationTree> {
  const supabase = getServerSupabaseClient();
  const [organizationRows, projectRows] = await Promise.all([
    unwrapResponse(
      supabase.from("organizations").select("id, name").order("name", { ascending: true }),
      "Failed loading navigation organizations"
    ),
    unwrapResponse(
      supabase.from("projects").select("id, org_id, name, status").order("name", { ascending: true }),
      "Failed loading navigation projects"
    )
  ]);

  const projectsByOrganization = new Map<string, NavigationProjectNode[]>();
  for (const row of projectRows as NavigationProjectRow[]) {
    const project: NavigationProjectNode = {
      id: toString(row.id),
      name: toString(row.name, "Project"),
      status: toString(row.status, "active")
    };
    const currentProjects = projectsByOrganization.get(row.org_id) ?? [];
    currentProjects.push(project);
    projectsByOrganization.set(row.org_id, currentProjects);
  }

  const organizations = (organizationRows as NamedRow[]).map<NavigationOrganizationNode>((row) => {
    const projects = projectsByOrganization.get(row.id) ?? [];
    return {
      id: row.id,
      name: toString(row.name, "Organization"),
      projectCount: projects.length,
      projects
    };
  });

  return {
    organizationCount: organizations.length,
    projectCount: (projectRows as NavigationProjectRow[]).length,
    organizations
  };
}
