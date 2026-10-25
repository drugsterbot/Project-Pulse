import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { assignableRoles, canModifyUser } from "@/lib/permissions";
import { ROLES, ROLE_LABEL, type Role } from "@/lib/constants";
import { Avatar, Badge, Card, CardHeader, PageHeader, Table, Td, Th } from "@/components/ui/primitives";
import { CreateUserModal, EditUserModal } from "@/components/admin-forms";
import { fmtDateTime } from "@/lib/utils";

export const metadata = { title: "Users" };
export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const actor = await requireAdmin();
  const [users, departments, audits] = await Promise.all([
    db.user.findMany({ where: { orgId: actor.orgId, deletedAt: null }, include: { department: { select: { name: true } } }, orderBy: [{ role: "asc" }, { name: "asc" }] }),
    db.department.findMany({ where: { orgId: actor.orgId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.loginAudit.findMany({ orderBy: { createdAt: "desc" }, take: 12, where: { OR: [{ user: { orgId: actor.orgId } }, { userId: null }] } }),
  ]);
  const roles = assignableRoles(actor.role, ROLES);
  const statusTone = { ACTIVE: "green", INACTIVE: "slate", SUSPENDED: "red" } as const;
  return (
    <>
      <PageHeader title="Users" description="Invite people, change roles and control who can sign in." actions={<CreateUserModal roles={roles} departments={departments} />} />
      <Card>
        <Table>
          <thead><tr><Th>Person</Th><Th>Role</Th><Th>Department</Th><Th>Status</Th><Th>Capacity</Th><Th>Last sign-in</Th><Th className="text-right">Actions</Th></tr></thead>
          <tbody>{users.map((u) => (
            <tr key={u.id}>
              <Td><span className="flex items-center gap-2.5"><Avatar name={u.name} src={u.avatarUrl} size={30} /><span><span className="font-medium">{u.name}</span><span className="block text-xs text-slate-500">{u.email}</span></span></span></Td>
              <Td>{ROLE_LABEL[u.role as Role]}</Td><Td className="text-slate-600">{u.department?.name ?? "—"}</Td>
              <Td><Badge tone={statusTone[u.status]} dot>{u.status.charAt(0) + u.status.slice(1).toLowerCase()}</Badge></Td>
              <Td>{u.weeklyCapacityHours}h</Td><Td className="whitespace-nowrap text-slate-600">{u.lastLoginAt ? fmtDateTime(u.lastLoginAt) : "Never"}</Td>
              <Td className="text-right"><EditUserModal user={{ id: u.id, name: u.name, role: u.role as Role, status: u.status, departmentId: u.departmentId, weeklyCapacityHours: u.weeklyCapacityHours }} roles={roles} departments={departments} self={u.id === actor.id} locked={!canModifyUser(actor.role, u.role as Role)} /></Td>
            </tr>
          ))}</tbody>
        </Table>
      </Card>
      <Card className="mt-6">
        <CardHeader title="Recent sign-in activity" description="The latest successful and failed attempts" />
        <Table><thead><tr><Th>When</Th><Th>Email</Th><Th>Result</Th><Th>Detail</Th></tr></thead>
          <tbody>{audits.map((a) => <tr key={a.id}><Td className="whitespace-nowrap">{fmtDateTime(a.createdAt)}</Td><Td>{a.email}</Td><Td><Badge tone={a.success ? "green" : "red"}>{a.success ? "Success" : "Failed"}</Badge></Td><Td className="text-slate-600">{a.reason ?? "—"}</Td></tr>)}</tbody></Table>
      </Card>
    </>
  );
}
