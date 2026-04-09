import { notFound } from "next/navigation";

import { DashboardView } from "@/components/dashboard/DashboardView";
import { getOrganizationScope } from "@/lib/dashboard/queries";

export const dynamic = "force-dynamic";

export default async function OrganizationPage({
  params
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;
  const scope = await getOrganizationScope(orgId);
  if (!scope) {
    notFound();
  }

  return <DashboardView scope={scope} />;
}

