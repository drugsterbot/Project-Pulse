import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { Avatar, Badge, Card, CardBody, CardHeader, EmptyState, PageHeader } from "@/components/ui/primitives";
import { DepartmentForm, TeamModal } from "@/components/admin-forms";

export const metadata = { title: "Teams & departments" };
export const dynamic = "force-dynamic";

export default async function TeamsPage() {
  const actor = await requireAdmin();
  const [teams, departments, people] = await Promise.all([
    db.team.findMany({ where: { orgId: actor.orgId }, include: { department: { select: { name: true } }, members: { include: { user: { select: { id: true, name: true, avatarUrl: true } } } } }, orderBy: { name: "asc" } }),
    db.department.findMany({ where: { orgId: actor.orgId }, include: { _count: { select: { users: true } } }, orderBy: { name: "asc" } }),
    db.user.findMany({ where: { orgId: actor.orgId, deletedAt: null, status: "ACTIVE", role: { not: "CLIENT_VIEWER" } }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const deptList = departments.map((d) => ({ id: d.id, name: d.name }));
  return (
    <>
      <PageHeader title="Teams & departments" description="Organize people so reports and workload can be filtered by team." actions={<TeamModal people={people} departments={deptList} />} />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {teams.length === 0 && <Card><EmptyState title="No teams yet" description="Create a team to group people who work together." /></Card>}
          {teams.map((t) => (
            <Card key={t.id}>
              <CardHeader title={<span className="flex items-center gap-2">{t.name}{t.department && <Badge>{t.department.name}</Badge>}</span>} description={`${t.members.length} ${t.members.length === 1 ? "member" : "members"}`}
                action={<TeamModal people={people} departments={deptList} initial={{ id: t.id, name: t.name, departmentId: t.departmentId, leadId: t.leadId, memberIds: t.members.map((m) => m.userId) }} />} />
              <ul className="flex flex-wrap gap-3 p-5">{t.members.map((m) => <li key={m.id} className="flex items-center gap-2 rounded-full border border-line py-1 pl-1 pr-3 text-sm"><Avatar name={m.user.name} src={m.user.avatarUrl} size={24} />{m.user.name}{m.userId === t.leadId && <Badge tone="blue">Lead</Badge>}</li>)}{t.members.length === 0 && <li className="text-sm text-slate-500">No members yet.</li>}</ul>
            </Card>
          ))}
        </div>
        <Card><CardHeader title="Departments" />
          <ul className="divide-y divide-line">{departments.map((d) => <li key={d.id} className="flex items-center justify-between px-5 py-3 text-sm"><span>{d.name}</span><span className="text-slate-500">{d._count.users} people</span></li>)}</ul>
          <CardBody className="border-t border-line"><DepartmentForm /></CardBody></Card>
      </div>
    </>
  );
}
