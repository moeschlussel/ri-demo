import { z } from "zod";

import { getServerSupabaseClient } from "@/lib/supabase/serverClient";
import {
  EXPENSE_CATEGORIES,
  assertScopeId,
  normalizeSearchValue,
  tokenizeSearchValue,
  toNullableString,
  toString,
  unwrapResponse,
  type GenericRow
} from "@/lib/tools/shared";

const ENTITY_TYPES = ["org", "project", "technician", "category"] as const;
const RELATIONSHIP_TYPES = ["current", "child", "descendant", "available"] as const;

export const ResolveScopeEntitiesInput = z.object({
  scopeType: z.enum(["global", "org", "project"]),
  scopeId: z.string().uuid().optional(),
  queries: z.array(z.string().min(1)).min(1).max(5),
  entityTypes: z.array(z.enum(ENTITY_TYPES)).min(1).max(4).optional(),
  limitPerQuery: z.number().int().min(1).max(5).optional().default(5)
});

export const ResolveScopeEntitiesOutput = z.object({
  current_scope: z.object({
    type: z.enum(["global", "org", "project"]),
    id: z.string().nullable(),
    name: z.string()
  }),
  results: z.array(
    z.object({
      query: z.string(),
      matches: z.array(
        z.object({
          entityType: z.enum(ENTITY_TYPES),
          id: z.string().uuid().nullable(),
          scopeType: z.enum(["org", "project"]).nullable(),
          scopeId: z.string().uuid().nullable(),
          name: z.string(),
          canonicalValue: z.string(),
          orgName: z.string().nullable(),
          path: z.string(),
          relationship: z.enum(RELATIONSHIP_TYPES),
          reason: z.string()
        })
      )
    })
  )
});

type OrgRow = GenericRow & {
  id: string;
  name: string;
};

type ProjectRow = GenericRow & {
  id: string;
  name: string;
  org_id: string;
};

type UserRow = GenericRow & {
  id: string;
  full_name: string;
  org_id: string | null;
};

type ScopedTechnicianRow = GenericRow & {
  user_id: string | null;
  technician_name: string | null;
  org_id: string | null;
};

type EntityCandidate = {
  entityType: "org" | "project" | "technician" | "category";
  id: string | null;
  scopeType: "org" | "project" | null;
  scopeId: string | null;
  name: string;
  canonicalValue: string;
  orgName: string | null;
  path: string;
  relationship: "current" | "child" | "descendant" | "available";
  searchTerms: string[];
};

export type ResolveScopeEntitiesInputType = z.infer<typeof ResolveScopeEntitiesInput>;
export type ResolveScopeEntitiesOutputType = z.infer<typeof ResolveScopeEntitiesOutput>;

function buildSearchTerms(...values: Array<string | null | undefined>): string[] {
  const set = new Set<string>();

  for (const value of values) {
    if (!value) {
      continue;
    }

    const normalized = normalizeSearchValue(value);
    if (!normalized) {
      continue;
    }

    set.add(normalized);

    for (const token of tokenizeSearchValue(value)) {
      if (token.length >= 3) {
        set.add(token);
      }
    }
  }

  return [...set];
}

function buildProjectAliases(name: string): string[] {
  const aliases = new Set<string>();
  const trimmed = name.trim();
  aliases.add(trimmed);

  const segments = trimmed.split(" - ").map((segment) => segment.trim()).filter(Boolean);
  for (const segment of segments) {
    aliases.add(segment);
  }

  const locationSegment = segments.at(-1);
  if (locationSegment) {
    aliases.add(locationSegment);

    const cityOnly = locationSegment.split(",")[0]?.trim();
    if (cityOnly) {
      aliases.add(cityOnly);
    }
  }

  return [...aliases];
}

function expandQueries(queries: string[]): string[] {
  const expanded: string[] = [];
  const seen = new Set<string>();

  for (const query of queries) {
    const fragments = query
      .split(/\s+(?:vs\.?|versus|and)\s+|,/i)
      .map((fragment) => fragment.trim())
      .filter(Boolean);

    for (const fragment of fragments.length > 0 ? fragments : [query.trim()]) {
      const normalized = normalizeSearchValue(fragment);
      if (!normalized || seen.has(normalized)) {
        continue;
      }

      seen.add(normalized);
      expanded.push(fragment);
    }
  }

  return expanded;
}

function scoreSearchTerm(query: string, term: string): number {
  const normalizedQuery = normalizeSearchValue(query);
  const normalizedTerm = normalizeSearchValue(term);
  if (!normalizedQuery || !normalizedTerm) {
    return 0;
  }

  if (normalizedQuery === normalizedTerm) {
    return 120;
  }

  if (normalizedQuery.includes(normalizedTerm) && normalizedTerm.length >= 3) {
    return 108 + Math.min(normalizedTerm.length, 8);
  }

  if (normalizedTerm.includes(normalizedQuery) && normalizedQuery.length >= 3) {
    return 94 + Math.min(normalizedQuery.length, 6);
  }

  const queryTokens = new Set(tokenizeSearchValue(query));
  const termTokens = tokenizeSearchValue(term).filter((token) => token.length >= 3);
  if (termTokens.length === 0) {
    return 0;
  }

  const overlap = termTokens.filter((token) =>
    [...queryTokens].some((queryToken) => queryToken === token || queryToken.startsWith(token) || token.startsWith(queryToken))
  );

  if (overlap.length === 0) {
    return 0;
  }

  const coverage = overlap.length / termTokens.length;
  const overlapScore = Math.round(coverage * 25) + overlap.length * 8;
  return 60 + overlapScore;
}

function getMatchScore(query: string, candidate: EntityCandidate): number {
  return candidate.searchTerms.reduce((best, term) => Math.max(best, scoreSearchTerm(query, term)), 0);
}

function buildCategoryCandidates(): EntityCandidate[] {
  const aliases: Record<(typeof EXPENSE_CATEGORIES)[number], string[]> = {
    Flight: ["flight", "flights", "airfare", "air", "airline", "plane", "ticket", "tickets"],
    Hotel: ["hotel", "hotels", "lodging", "room", "rooms", "stay", "stays"],
    Meals: ["meal", "meals", "food", "lunch", "dinner", "breakfast", "per diem", "perdiem"],
    Equipment: ["equipment", "equip", "gear", "hardware", "scanner", "scanners", "lidar"]
  };

  return EXPENSE_CATEGORIES.map((category) => ({
    entityType: "category",
    id: null,
    scopeType: null,
    scopeId: null,
    name: category,
    canonicalValue: category,
    orgName: null,
    path: category,
    relationship: "available",
    searchTerms: buildSearchTerms(category, ...aliases[category])
  }));
}

async function getGlobalCandidates(): Promise<{
  currentScope: { type: "global" | "org" | "project"; id: string | null; name: string };
  candidates: EntityCandidate[];
}> {
  const supabase = getServerSupabaseClient();
  const [orgRows, projectRows, userRows] = await Promise.all([
    unwrapResponse(supabase.from("organizations").select("id, name").order("name", { ascending: true }), "Failed loading organizations"),
    unwrapResponse(
      supabase.from("projects").select("id, name, org_id").order("name", { ascending: true }),
      "Failed loading projects"
    ),
    unwrapResponse(
      supabase.from("users").select("id, full_name, org_id").order("full_name", { ascending: true }),
      "Failed loading technicians"
    )
  ]);

  const organizations = orgRows as OrgRow[];
  const orgNameById = new Map(organizations.map((row) => [row.id, toString(row.name, "Organization")]));

  const candidates: EntityCandidate[] = [
    ...organizations.map(
      (row): EntityCandidate => ({
        entityType: "org",
        id: row.id,
        scopeType: "org",
        scopeId: row.id,
        name: toString(row.name, "Organization"),
        canonicalValue: toString(row.name, "Organization"),
        orgName: null,
        path: toString(row.name, "Organization"),
        relationship: "child",
        searchTerms: buildSearchTerms(toString(row.name, "Organization"))
      })
    ),
    ...(projectRows as ProjectRow[]).map((row) => {
      const projectName = toString(row.name, "Project");
      const orgName = orgNameById.get(row.org_id) ?? "Organization";
      return {
        entityType: "project",
        id: row.id,
        scopeType: "project",
        scopeId: row.id,
        name: projectName,
        canonicalValue: projectName,
        orgName,
        path: `${orgName} / ${projectName}`,
        relationship: "descendant",
        searchTerms: buildSearchTerms(projectName, `${orgName} / ${projectName}`, ...buildProjectAliases(projectName))
      } satisfies EntityCandidate;
    }),
    ...(userRows as UserRow[]).map((row) => {
      const fullName = toString(row.full_name, "Technician");
      const orgName = row.org_id ? orgNameById.get(row.org_id) ?? "Organization" : null;
      return {
        entityType: "technician",
        id: row.id,
        scopeType: null,
        scopeId: null,
        name: fullName,
        canonicalValue: fullName,
        orgName,
        path: orgName ? `${orgName} / ${fullName}` : fullName,
        relationship: "descendant",
        searchTerms: buildSearchTerms(fullName, orgName ? `${orgName} / ${fullName}` : fullName)
      } satisfies EntityCandidate;
    }),
    ...buildCategoryCandidates()
  ];

  return {
    currentScope: {
      type: "global",
      id: null,
      name: "All Organizations"
    },
    candidates
  };
}

async function getOrgCandidates(scopeId: string): Promise<{
  currentScope: { type: "global" | "org" | "project"; id: string | null; name: string };
  candidates: EntityCandidate[];
}> {
  const supabase = getServerSupabaseClient();
  const [orgRow, projectRows, userRows] = await Promise.all([
    unwrapResponse(
      supabase.from("organizations").select("id, name").eq("id", scopeId).single(),
      "Failed loading organization scope"
    ),
    unwrapResponse(
      supabase.from("projects").select("id, name, org_id").eq("org_id", scopeId).order("name", { ascending: true }),
      "Failed loading organization projects"
    ),
    unwrapResponse(
      supabase.from("users").select("id, full_name, org_id").eq("org_id", scopeId).order("full_name", { ascending: true }),
      "Failed loading organization technicians"
    )
  ]);

  const organization = orgRow as OrgRow;
  const orgName = toString(organization.name, "Organization");

  return {
    currentScope: {
      type: "org",
      id: organization.id,
      name: orgName
    },
    candidates: [
      {
        entityType: "org",
        id: organization.id,
        scopeType: "org",
        scopeId: organization.id,
        name: orgName,
        canonicalValue: orgName,
        orgName: null,
        path: orgName,
        relationship: "current",
        searchTerms: buildSearchTerms(orgName)
      },
      ...(projectRows as ProjectRow[]).map((row) => {
        const projectName = toString(row.name, "Project");
        return {
          entityType: "project",
          id: row.id,
          scopeType: "project",
          scopeId: row.id,
          name: projectName,
          canonicalValue: projectName,
          orgName,
          path: `${orgName} / ${projectName}`,
          relationship: "child",
          searchTerms: buildSearchTerms(projectName, `${orgName} / ${projectName}`, ...buildProjectAliases(projectName))
        } satisfies EntityCandidate;
      }),
      ...(userRows as UserRow[]).map((row) => {
        const fullName = toString(row.full_name, "Technician");
        return {
          entityType: "technician",
          id: row.id,
          scopeType: null,
          scopeId: null,
          name: fullName,
          canonicalValue: fullName,
          orgName,
          path: `${orgName} / ${fullName}`,
          relationship: "descendant",
          searchTerms: buildSearchTerms(fullName, `${orgName} / ${fullName}`)
        } satisfies EntityCandidate;
      }),
      ...buildCategoryCandidates()
    ]
  };
}

async function getProjectCandidates(scopeId: string): Promise<{
  currentScope: { type: "global" | "org" | "project"; id: string | null; name: string };
  candidates: EntityCandidate[];
}> {
  const supabase = getServerSupabaseClient();
  const projectRow = await unwrapResponse(
    supabase.from("projects").select("id, name, org_id").eq("id", scopeId).single(),
    "Failed loading project scope"
  );
  const project = projectRow as ProjectRow;
  const orgRow = await unwrapResponse(
    supabase.from("organizations").select("id, name").eq("id", project.org_id).single(),
    "Failed loading project organization"
  );
  const orgName = toString((orgRow as OrgRow).name, "Organization");
  const technicianRows = await unwrapResponse(
    supabase
      .from("expense_anomalies_v")
      .select("user_id, technician_name, org_id")
      .eq("project_id", project.id)
      .order("technician_name", { ascending: true }),
    "Failed loading project technicians"
  );

  const uniqueTechnicians = new Map<string, { id: string; name: string }>();
  for (const row of technicianRows as ScopedTechnicianRow[]) {
    if (!row.user_id || !row.technician_name) {
      continue;
    }

    uniqueTechnicians.set(row.user_id, {
      id: row.user_id,
      name: row.technician_name
    });
  }

  const projectName = toString(project.name, "Project");

  return {
    currentScope: {
      type: "project",
      id: project.id,
      name: projectName
    },
    candidates: [
      {
        entityType: "project",
        id: project.id,
        scopeType: "project",
        scopeId: project.id,
        name: projectName,
        canonicalValue: projectName,
        orgName,
        path: `${orgName} / ${projectName}`,
        relationship: "current",
        searchTerms: buildSearchTerms(projectName, `${orgName} / ${projectName}`, ...buildProjectAliases(projectName))
      },
      ...[...uniqueTechnicians.values()].map(
        (technician): EntityCandidate => ({
          entityType: "technician",
          id: technician.id,
          scopeType: null,
          scopeId: null,
          name: technician.name,
          canonicalValue: technician.name,
          orgName,
          path: `${orgName} / ${projectName} / ${technician.name}`,
          relationship: "descendant",
          searchTerms: buildSearchTerms(technician.name, `${orgName} / ${projectName} / ${technician.name}`)
        })
      ),
      ...buildCategoryCandidates()
    ]
  };
}

async function getAccessibleCandidates(input: ResolveScopeEntitiesInputType): Promise<{
  currentScope: { type: "global" | "org" | "project"; id: string | null; name: string };
  candidates: EntityCandidate[];
}> {
  if (input.scopeType === "global") {
    return getGlobalCandidates();
  }

  if (input.scopeType === "org") {
    return getOrgCandidates(assertScopeId(input));
  }

  return getProjectCandidates(assertScopeId(input));
}

function buildReason(query: string, candidate: EntityCandidate): string {
  if (candidate.entityType === "category") {
    return `Matched ${query} to the category ${candidate.canonicalValue}.`;
  }

  if (candidate.entityType === "technician") {
    return `Matched ${query} to the technician ${candidate.path}.`;
  }

  if (candidate.relationship === "current") {
    return `Matched ${query} to the current ${candidate.entityType} scope.`;
  }

  return `Matched ${query} to the ${candidate.relationship} ${candidate.entityType} ${candidate.path}.`;
}

export async function resolveScopeEntities(
  input: ResolveScopeEntitiesInputType
): Promise<ResolveScopeEntitiesOutputType> {
  const { currentScope, candidates } = await getAccessibleCandidates(input);
  const entityTypeFilter = new Set(input.entityTypes ?? ENTITY_TYPES);
  const expandedQueries = expandQueries(input.queries);
  const filteredCandidates = candidates.filter((candidate) => entityTypeFilter.has(candidate.entityType));

  return ResolveScopeEntitiesOutput.parse({
    current_scope: {
      type: currentScope.type,
      id: currentScope.id,
      name: currentScope.name
    },
    results: expandedQueries.map((query) => {
      const matches = filteredCandidates
        .map((candidate) => ({
          candidate,
          score: getMatchScore(query, candidate)
        }))
        .filter((entry) => entry.score > 0)
        .sort((left, right) => {
          if (right.score !== left.score) {
            return right.score - left.score;
          }

          return left.candidate.path.localeCompare(right.candidate.path);
        })
        .slice(0, input.limitPerQuery)
        .map(({ candidate }) => ({
          entityType: candidate.entityType,
          id: candidate.id,
          scopeType: candidate.scopeType,
          scopeId: candidate.scopeId,
          name: candidate.name,
          canonicalValue: candidate.canonicalValue,
          orgName: toNullableString(candidate.orgName),
          path: candidate.path,
          relationship: candidate.relationship,
          reason: buildReason(query, candidate)
        }));

      return {
        query,
        matches
      };
    })
  });
}
