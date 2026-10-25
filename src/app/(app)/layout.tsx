import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { isAdminRole, isManagementRole } from "@/lib/permissions";
import { ROLE_LABEL } from "@/lib/constants";
import { AppShell, type NavGroup } from "@/components/app-shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const [unread, latest] = await Promise.all([
    db.notification.count({ where: { userId: user.id, readAt: null } }),
    db.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 6 }),
  ]);

  const nav: NavGroup[] =
    user.role === "CLIENT_VIEWER"
      ? [{ title: "Your projects", items: [{ href: "/projects", label: "Projects", icon: "projects" }, { href: "/files", label: "Shared files", icon: "files" }] }]
      : [
          { title: "My work", items: [
            { href: "/dashboard", label: "Dashboard", icon: "dashboard" }, { href: "/tasks", label: "My tasks", icon: "tasks" }, { href: "/board", label: "Board", icon: "board" },
            { href: "/daily-reports", label: "Daily reports", icon: "reports" }, { href: "/timesheet", label: "Timesheet", icon: "time" },
          ] },
          { title: "Projects", items: [{ href: "/projects", label: "Projects", icon: "projects" }, { href: "/files", label: "Files", icon: "files" }] },
          ...(isManagementRole(user.role) ? [{ title: "Team", items: [
            { href: "/team-activity", label: "Team activity", icon: "activity" as const }, { href: "/workload", label: "Workload", icon: "workload" as const },
            { href: "/reports", label: "Reports", icon: "analytics" as const }, { href: "/insights", label: "AI insights", icon: "insights" as const },
          ] }] : []),
          ...(isAdminRole(user.role) ? [{ title: "Administration", items: [{ href: "/admin/users", label: "Users", icon: "users" as const }, { href: "/admin/teams", label: "Teams & departments", icon: "teams" as const }] }] : []),
        ];

  return (
    <AppShell
      user={{ name: user.name, email: user.email, roleLabel: ROLE_LABEL[user.role], avatarUrl: user.avatarUrl }}
      nav={nav} unread={unread}
      notifications={latest.map((n) => ({ id: n.id, title: n.title, body: n.body, href: n.href, createdAt: n.createdAt.toISOString(), read: !!n.readAt }))}
    >
      {children}
    </AppShell>
  );
}
