import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { Avatar, Badge, Card, CardBody, CardHeader, Table, Td, Th } from "@/components/ui/primitives";
import { ActionButton } from "@/components/action-form";
import { AddMemberForm } from "@/components/project-forms";
import { removeProjectMemberAction } from "@/actions/projects";
import { ROLE_LABEL, type Role } from "@/lib/constants";
import { addDays, fmtHours, startOfWeek, sum, todayUTC } from "@/lib/utils";
import { finishedEntry } from "@/lib/access";
import type { Ctx } from "./types";

export async function TeamTab({ ctx }: { ctx: Ctx }) {
  const { id, user, level, project } = ctx;
  const week = startOfWeek(todayUTC());
  const manage = can(level, "manageMembers");
  const [members, open, hours, candidates] = await Promise.all([
    db.projectMember.findMany({ where: { projectId: id }, include: { user: { select: { id: true, name: true, avatarUrl: true, role: true, email: true, skills: true } } }, orderBy: { createdAt: "asc" } }),
    db.taskAssignee.groupBy({ by: ["userId"], where: { task: { projectId: id, deletedAt: null, status: { not: "COMPLETED" } } }, _count: true }),
    db.timeEntry.groupBy({ by: ["userId"], where: { projectId: id, ...finishedEntry, date: { gte: week, lt: addDays(week, 7) } }, _sum: { hours: true } }),
    manage ? db.user.findMany({ where: { orgId: user.orgId, status: "ACTIVE", deletedAt: null, projectMemberships: { none: { projectId: id } } }, select: { id: true, name: true, role: true }, orderBy: { name: "asc" } }) : [],
  ]);
  void sum;
  return (
    <div className="space-y-6">
      {manage && <Card><CardHeader title="Add to this project" description="Client viewers get read-only access to what you share with them." /><CardBody><AddMemberForm projectId={id} candidates={candidates.map((c) => ({ id: c.id, name: c.name, roleLabel: ROLE_LABEL[c.role as Role] }))} /></CardBody></Card>}
      <Card>
        <Table>
          <thead><tr><Th>Person</Th><Th>Role</Th><Th>Open tasks</Th><Th>Hours this week</Th>{manage && <Th />}</tr></thead>
          <tbody>{members.map((m) => (
            <tr key={m.id}>
              <Td><span className="flex items-center gap-3"><Avatar name={m.user.name} src={m.user.avatarUrl} size={32} /><span><span className="block font-medium">{m.user.name}</span><span className="text-xs text-slate-500">{m.user.email}</span></span></span></Td>
              <Td>{ROLE_LABEL[m.user.role as Role]}{project.managerId === m.userId && <Badge tone="blue" className="ml-2">Manager</Badge>}{m.isClientAccess && <Badge tone="teal" className="ml-2">Client</Badge>}</Td>
              <Td>{m.isClientAccess ? "—" : open.find((o) => o.userId === m.userId)?._count ?? 0}</Td>
              <Td>{m.isClientAccess ? "—" : fmtHours(hours.find((h) => h.userId === m.userId)?._sum.hours)}</Td>
              {manage && <Td className="text-right">{project.managerId !== m.userId && <ActionButton action={removeProjectMemberAction.bind(null, id, m.userId)} variant="ghost" confirm={{ title: `Remove ${m.user.name}?`, description: "They lose access to this project and are unassigned from its open tasks.", confirmLabel: "Remove" }}>Remove</ActionButton>}</Td>}
            </tr>
          ))}</tbody>
        </Table>
      </Card>
    </div>
  );
}
