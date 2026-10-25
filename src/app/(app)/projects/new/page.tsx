import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { isAdminRole } from "@/lib/permissions";
import { Card, CardBody, PageHeader } from "@/components/ui/primitives";
import { ProjectForm } from "@/components/project-form";
import type { Role } from "@/lib/constants";

export const metadata = { title: "New project" };

export default async function NewProjectPage() {
  const user = await requireUser();
  if (!(isAdminRole(user.role) || user.role === "PROJECT_MANAGER")) redirect("/unauthorized");
  const people = await db.user.findMany({ where: { orgId: user.orgId, status: "ACTIVE", deletedAt: null }, select: { id: true, name: true, role: true }, orderBy: { name: "asc" } });
  return (
    <>
      <PageHeader title="New project" description="Set the basics now. You can add milestones, tasks and files once it exists." back={{ href: "/projects", label: "Projects" }} />
      <Card><CardBody><ProjectForm people={people.map((p) => ({ ...p, role: p.role as Role }))} canPickManager={isAdminRole(user.role)} currentUserId={user.id} /></CardBody></Card>
    </>
  );
}
