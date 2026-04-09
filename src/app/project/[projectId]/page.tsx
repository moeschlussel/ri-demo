import { notFound } from "next/navigation";

import { DashboardView } from "@/components/dashboard/DashboardView";
import { getProjectScope } from "@/lib/dashboard/queries";

export const dynamic = "force-dynamic";

export default async function ProjectPage({
  params
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const scope = await getProjectScope(projectId);
  if (!scope) {
    notFound();
  }

  return <DashboardView scope={scope} />;
}

