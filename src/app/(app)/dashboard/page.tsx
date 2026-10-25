import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { ensureDeadlineNotifications } from "@/lib/activity";
import { MemberDashboard } from "./member-dashboard";
import { ManagerDashboard } from "./manager-dashboard";

export const metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await requireUser();
  if (user.role === "CLIENT_VIEWER") redirect("/projects");
  await ensureDeadlineNotifications(user.id);
  return user.role === "TEAM_MEMBER" ? <MemberDashboard user={user} /> : <ManagerDashboard user={user} />;
}
