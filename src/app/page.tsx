import { DashboardView } from "@/components/dashboard/DashboardView";

export const dynamic = "force-dynamic";

export default function HomePage() {
  return <DashboardView scope={{ type: "global" }} />;
}

