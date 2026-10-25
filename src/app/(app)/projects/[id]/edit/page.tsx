import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { pageProject } from "@/lib/page-access";
import { can, isAdminRole } from "@/lib/permissions";
import { isoDate } from "@/lib/utils";
import { Card, CardBody, PageHeader } from "@/components/ui/primitives";
import { ProjectForm } from "@/components/project-form";
import type { Role } from "@/lib/constants";

export const metadata = { title: "Edit project" };

export default async function EditProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const { project, level } = await pageProject(user, id);
  if (!can(level, "edit")) redirect("/unauthorized");
  const [people, members] = await Promise.all([
    db.user.findMany({ where: { orgId: user.orgId, status: "ACTIVE", deletedAt: null }, select: { id: true, name: true, role: true }, orderBy: { name: "asc" } }),
    db.projectMember.findMany({ where: { projectId: id }, select: { userId: true, isClientAccess: true } }),
  ]);
  return (
    <>
      <PageHeader title={`Edit ${project.name}`} back={{ href: `/projects/${id}`, label: project.name }} />
      <Card><CardBody>
        <ProjectForm people={people.map((p) => ({ ...p, role: p.role as Role }))} canPickManager={isAdminRole(user.role)} currentUserId={user.id}
          initial={{ id, name: project.name, code: project.code, description: project.description ?? "", category: project.category ?? "", status: project.status, priority: project.priority, startDate: project.startDate ? isoDate(project.startDate) : "", endDate: project.endDate ? isoDate(project.endDate) : "", managerId: project.managerId ?? "", memberIds: members.filter((m) => !m.isClientAccess).map((m) => m.userId), clientIds: members.filter((m) => m.isClientAccess).map((m) => m.userId), budget: project.budget?.toString() ?? "", estimatedHours: project.estimatedHours, goals: project.goals ?? "", clientName: project.clientName ?? "" }} />
      </CardBody></Card>
    </>
  );
}
