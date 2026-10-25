"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { actionUser } from "@/lib/auth";
import { assertProject } from "@/lib/access";
import { logActivity, notify, recalcMilestone } from "@/lib/activity";
import { AppError, forbidden, run, type ActionResult } from "@/lib/errors";
import { isAdminRole } from "@/lib/permissions";
import { announcementSchema, formObject, milestoneSchema, parseId, projectSchema, riskSchema } from "@/lib/validators";
import { parseDateOnly } from "@/lib/utils";

const dateOrNull = (s?: string) => (s ? parseDateOnly(s) : null);

export async function saveProjectAction(fd: FormData): Promise<ActionResult<{ id: string }>> {
  return run(async () => {
    const user = await actionUser();
    const raw = formObject(fd);
    const input = projectSchema.parse(raw);
    const id = parseId(raw.id);
    if (!id && !(isAdminRole(user.role) || user.role === "PROJECT_MANAGER")) throw forbidden("Only admins and project managers can create projects.");

    let managerId: string | null = input.managerId ?? null;
    if (id) {
      const access = await assertProject(user, id, "edit");
      if (!isAdminRole(user.role)) managerId = access.project.managerId; // only admins reassign the manager
    } else if (!isAdminRole(user.role)) managerId = user.id; // PMs manage the projects they create
    if (managerId) {
      const mgr = await db.user.findFirst({ where: { id: managerId, orgId: user.orgId, status: "ACTIVE", deletedAt: null, role: { in: ["PROJECT_MANAGER", "ADMIN", "SUPER_ADMIN"] } } });
      if (!mgr) throw new AppError("Choose an active project manager.");
    }
    const staffIds = [...new Set([...input.memberIds, ...(managerId ? [managerId] : [])])];
    const staff = await db.user.findMany({ where: { id: { in: staffIds }, orgId: user.orgId, status: "ACTIVE", deletedAt: null, role: { not: "CLIENT_VIEWER" } }, select: { id: true } });
    if (staff.length !== staffIds.length) throw new AppError("One or more team members are invalid or inactive.");
    const clients = await db.user.findMany({ where: { id: { in: input.clientIds }, orgId: user.orgId, status: "ACTIVE", role: "CLIENT_VIEWER" }, select: { id: true } });
    if (clients.length !== input.clientIds.length) throw new AppError("One or more client viewers are invalid.");

    const data = {
      name: input.name, code: input.code, description: input.description ?? null, category: input.category ?? null, status: input.status, priority: input.priority,
      startDate: dateOrNull(input.startDate), endDate: dateOrNull(input.endDate), managerId, budget: input.budget ?? null,
      estimatedHours: input.estimatedHours != null ? Math.round(input.estimatedHours) : null, goals: input.goals ?? null, clientName: input.clientName ?? null,
    };
    const saved = await db.$transaction(async (tx) => {
      if (id) await assertProject(user, id, "edit");
      const project = id ? await tx.project.update({ where: { id }, data }) : await tx.project.create({ data: { ...data, orgId: user.orgId } });
      const want = new Map<string, boolean>([...staffIds.map((u) => [u, false] as const), ...input.clientIds.map((u) => [u, true] as const)]);
      const existing = await tx.projectMember.findMany({ where: { projectId: project.id } });
      const remove = existing.filter((m) => !want.has(m.userId)).map((m) => m.id);
      if (remove.length) await tx.projectMember.deleteMany({ where: { id: { in: remove } } });
      const have = new Set(existing.map((m) => m.userId));
      const add = [...want].filter(([u]) => !have.has(u)).map(([userId, isClientAccess]) => ({ projectId: project.id, userId, isClientAccess }));
      if (add.length) await tx.projectMember.createMany({ data: add });
      await logActivity(tx, { actorId: user.id, projectId: project.id, action: id ? "project_updated" : "project_created", summary: `${user.name} ${id ? "updated" : "created"} the project` });
      await notify(tx, add.filter((a) => !a.isClientAccess).map((a) => a.userId), { type: "ANNOUNCEMENT", title: `You were added to ${project.name}`, href: `/projects/${project.id}` }, user.id);
      return project;
    }).catch((e) => { if (e?.code === "P2002") throw new AppError("That project code is already in use."); throw e; });
    revalidatePath("/projects");
    return { id: saved.id };
  }, "Project saved.");
}

export async function archiveProjectAction(projectId: string, archive: boolean): Promise<ActionResult> {
  return run(async () => {
    const user = await actionUser();
    await assertProject(user, projectId, "archive");
    await db.$transaction(async (tx) => {
      await tx.project.update({ where: { id: projectId }, data: { archivedAt: archive ? new Date() : null } });
      await logActivity(tx, { actorId: user.id, projectId, action: archive ? "project_archived" : "project_restored", summary: `${user.name} ${archive ? "archived" : "restored"} the project` });
    });
    revalidatePath("/projects");
    revalidatePath(`/projects/${projectId}`);
  }, archive ? "Project archived." : "Project restored.");
}

export async function addProjectMemberAction(fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const user = await actionUser();
    const projectId = parseId(fd.get("projectId"))!;
    const { project } = await assertProject(user, projectId, "manageMembers");
    const userId = parseId(fd.get("userId"));
    if (!userId) throw new AppError("Choose a person to add.");
    const target = await db.user.findFirst({ where: { id: userId, orgId: user.orgId, status: "ACTIVE", deletedAt: null } });
    if (!target) throw new AppError("That person could not be found.");
    const isClientAccess = target.role === "CLIENT_VIEWER";
    await db.$transaction(async (tx) => {
      await tx.projectMember.upsert({ where: { projectId_userId: { projectId, userId } }, update: {}, create: { projectId, userId, isClientAccess } });
      await logActivity(tx, { actorId: user.id, projectId, action: "member_added", summary: `${user.name} added ${target.name} to the project` });
      if (!isClientAccess) await notify(tx, [userId], { type: "ANNOUNCEMENT", title: `You were added to ${project.name}`, href: `/projects/${projectId}` }, user.id);
    });
    revalidatePath(`/projects/${projectId}`);
  }, "Member added.");
}

export async function removeProjectMemberAction(projectId: string, userId: string): Promise<ActionResult> {
  return run(async () => {
    const user = await actionUser();
    const { project } = await assertProject(user, projectId, "manageMembers");
    if (project.managerId === userId) throw new AppError("Change the project manager before removing them.");
    const open = await db.taskAssignee.count({ where: { userId, task: { projectId, deletedAt: null, status: { not: "COMPLETED" } } } });
    await db.$transaction(async (tx) => {
      await tx.taskAssignee.deleteMany({ where: { userId, task: { projectId, status: { not: "COMPLETED" } } } });
      await tx.projectMember.deleteMany({ where: { projectId, userId } });
      await logActivity(tx, { actorId: user.id, projectId, action: "member_removed", summary: `${user.name} removed a member${open ? ` and unassigned ${open} open task(s)` : ""}` });
    });
    revalidatePath(`/projects/${projectId}`);
  }, "Member removed.");
}

export async function saveMilestoneAction(fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const user = await actionUser();
    const raw = formObject(fd);
    const input = milestoneSchema.parse(raw);
    const id = parseId(raw.id);
    const { project } = await assertProject(user, input.projectId, "createMilestone");
    if (input.ownerId && !(await db.user.findFirst({ where: { id: input.ownerId, orgId: user.orgId, status: "ACTIVE" } }))) throw new AppError("Choose a valid owner.");
    const data = { name: input.name, description: input.description ?? null, ownerId: input.ownerId ?? null, dueDate: parseDateOnly(input.dueDate), deliverables: input.deliverables ?? null };
    await db.$transaction(async (tx) => {
      if (id) {
        const m = await tx.milestone.findFirst({ where: { id, projectId: project.id, deletedAt: null } });
        if (!m) throw new AppError("Milestone not found.", 404);
      }
      const saved = id ? await tx.milestone.update({ where: { id }, data }) : await tx.milestone.create({ data: { ...data, projectId: project.id } });
      await logActivity(tx, { actorId: user.id, projectId: project.id, action: id ? "milestone_updated" : "milestone_created", summary: `${user.name} ${id ? "updated" : "created"} milestone “${saved.name}”` });
      await recalcMilestone(tx, saved.id);
    });
    revalidatePath(`/projects/${project.id}`);
  }, "Milestone saved.");
}

export async function deleteMilestoneAction(milestoneId: string): Promise<ActionResult> {
  return run(async () => {
    const user = await actionUser();
    const m = await db.milestone.findFirst({ where: { id: milestoneId, deletedAt: null, project: { orgId: user.orgId } } });
    if (!m) throw new AppError("Milestone not found.", 404);
    await assertProject(user, m.projectId, "createMilestone");
    await db.$transaction(async (tx) => {
      await tx.task.updateMany({ where: { milestoneId }, data: { milestoneId: null } });
      await tx.milestone.update({ where: { id: milestoneId }, data: { deletedAt: new Date() } });
      await logActivity(tx, { actorId: user.id, projectId: m.projectId, action: "milestone_deleted", summary: `${user.name} deleted milestone “${m.name}”` });
    });
    revalidatePath(`/projects/${m.projectId}`);
  }, "Milestone deleted.");
}

export async function saveRiskAction(fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const user = await actionUser();
    const raw = formObject(fd);
    const input = riskSchema.parse(raw);
    const id = parseId(raw.id);
    await assertProject(user, input.projectId, "createRisk");
    const data = { title: input.title, description: input.description ?? null, severity: input.severity, status: input.status, mitigation: input.mitigation ?? null, ownerId: input.ownerId ?? null };
    await db.$transaction(async (tx) => {
      if (id) {
        const r = await tx.risk.findFirst({ where: { id, projectId: input.projectId, deletedAt: null } });
        if (!r) throw new AppError("Risk not found.", 404);
        await tx.risk.update({ where: { id }, data });
      } else await tx.risk.create({ data: { ...data, projectId: input.projectId } });
      await logActivity(tx, { actorId: user.id, projectId: input.projectId, action: id ? "risk_updated" : "risk_logged", summary: `${user.name} ${id ? "updated" : "logged"} risk “${input.title}”` });
    });
    revalidatePath(`/projects/${input.projectId}`);
  }, "Risk saved.");
}

export async function deleteRiskAction(riskId: string): Promise<ActionResult> {
  return run(async () => {
    const user = await actionUser();
    const r = await db.risk.findFirst({ where: { id: riskId, deletedAt: null, project: { orgId: user.orgId } } });
    if (!r) throw new AppError("Risk not found.", 404);
    await assertProject(user, r.projectId, "createRisk");
    await db.risk.update({ where: { id: riskId }, data: { deletedAt: new Date() } });
    revalidatePath(`/projects/${r.projectId}`);
  }, "Risk removed.");
}

export async function postAnnouncementAction(fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const user = await actionUser();
    const input = announcementSchema.parse(formObject(fd));
    const { project } = await assertProject(user, input.projectId, "announce");
    await db.$transaction(async (tx) => {
      await tx.announcement.create({ data: { projectId: project.id, authorId: user.id, title: input.title, body: input.body, pinned: input.pinned } });
      const members = await tx.projectMember.findMany({ where: { projectId: project.id, isClientAccess: false }, select: { userId: true } });
      await notify(tx, members.map((m) => m.userId), { type: "ANNOUNCEMENT", title: `${project.name}: ${input.title}`, body: input.body.slice(0, 140), href: `/projects/${project.id}` }, user.id);
      await logActivity(tx, { actorId: user.id, projectId: project.id, action: "announcement", summary: `${user.name} posted an announcement “${input.title}”` });
    });
    revalidatePath(`/projects/${project.id}`);
  }, "Announcement posted.");
}

export async function deleteAnnouncementAction(id: string): Promise<ActionResult> {
  return run(async () => {
    const user = await actionUser();
    const a = await db.announcement.findFirst({ where: { id, deletedAt: null, project: { orgId: user.orgId } } });
    if (!a) throw new AppError("Announcement not found.", 404);
    await assertProject(user, a.projectId, "announce");
    await db.announcement.update({ where: { id }, data: { deletedAt: new Date() } });
    revalidatePath(`/projects/${a.projectId}`);
  }, "Announcement deleted.");
}

