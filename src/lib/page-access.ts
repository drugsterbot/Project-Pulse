import "server-only";
import { notFound, redirect } from "next/navigation";
import { db, type Prisma } from "./db";
import type { SessionUser } from "./auth";
import { loadProjectAccess, projectWhere, taskWhere } from "./access";
import { isOverdue, unmetDependencies } from "./business";
import { can, canUpdateTask, projectLevel } from "./permissions";
import { fmtShortDate } from "./utils";
import type { KanbanCard } from "@/components/kanban";
import type { TaskStatus } from "./constants";

/** For pages: 404 when the project doesn't exist, the "no access" page when it exists but isn't yours. */
export async function pageProject(user: SessionUser, id: string) {
  const access = await loadProjectAccess(user, id);
  if (access) return access;
  const exists = await db.project.findFirst({ where: { id, orgId: user.orgId, deletedAt: null }, select: { id: true } });
  if (exists) redirect("/unauthorized");
  notFound();
}

/** Board cards with per-card permissions, so the UI only offers moves the server will accept. */
export async function loadBoardCards(user: SessionUser, where: Prisma.TaskWhereInput = {}, take = 300): Promise<KanbanCard[]> {
  const tasks = await db.task.findMany({
    where: { AND: [taskWhere(user), where] }, take, orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
    include: {
      project: { select: { id: true, code: true, managerId: true, members: { where: { userId: user.id }, select: { isClientAccess: true } } } },
      assignees: { include: { user: { select: { id: true, name: true, avatarUrl: true } } } },
      subtasks: { select: { done: true } },
      attachments: { where: { file: { deletedAt: null } }, select: { id: true } },
      dependsOn: { include: { dependsOn: { select: { status: true } } } },
    },
  });
  return tasks.map((t) => {
    const level = projectLevel(user, t.project, t.project.members[0] ?? null);
    return {
      id: t.id, title: t.title, projectCode: t.project.code, status: t.status as TaskStatus, priority: t.priority, dueLabel: t.dueDate ? fmtShortDate(t.dueDate) : null,
      overdue: isOverdue(t), progress: t.status === "COMPLETED" ? 100 : t.progress, assignees: t.assignees.map((a) => a.user), blockerReason: t.blockerReason,
      requiredEvidence: t.requiredEvidence, evidenceCount: t.attachments.length, checklist: [t.subtasks.filter((s) => s.done).length, t.subtasks.length] as [number, number],
      canMove: canUpdateTask(level, user.id, { assigneeIds: t.assignees.map((a) => a.userId), creatorId: t.creatorId }), canReview: can(level, "review"),
      unmetDeps: unmetDependencies(t.dependsOn.map((d) => d.dependsOn)).length,
    };
  });
}

/** Data for the task form: projects where the user can create tasks, with each project's people, milestones and tasks. */
export async function loadTaskFormData(user: SessionUser, onlyProjectId?: string) {
  const projects = await db.project.findMany({
    where: { AND: [projectWhere(user), { archivedAt: null, status: { notIn: ["CANCELLED", "COMPLETED"] } }, onlyProjectId ? { id: onlyProjectId } : {}] },
    orderBy: { name: "asc" },
    select: {
      id: true, name: true, code: true, managerId: true,
      members: { select: { userId: true, isClientAccess: true, user: { select: { id: true, name: true } } } },
      manager: { select: { id: true, name: true } },
      milestones: { where: { deletedAt: null }, orderBy: { dueDate: "asc" }, select: { id: true, name: true } },
      tasks: { where: { deletedAt: null }, orderBy: { createdAt: "desc" }, select: { id: true, title: true }, take: 200 },
    },
  });
  const allowed = projects.filter((p) => can(projectLevel(user, p, p.members.find((m) => m.userId === user.id) ?? null), "createTask"));
  const data = {
    projects: allowed.map((p) => ({ id: p.id, name: p.name, code: p.code })),
    members: {} as Record<string, { id: string; name: string }[]>, milestones: {} as Record<string, { id: string; name: string }[]>, tasks: {} as Record<string, { id: string; title: string }[]>,
  };
  for (const p of allowed) {
    const people = new Map(p.members.filter((m) => !m.isClientAccess).map((m) => [m.user.id, m.user] as const));
    if (p.manager) people.set(p.manager.id, p.manager);
    data.members[p.id] = [...people.values()].sort((a, b) => a.name.localeCompare(b.name));
    data.milestones[p.id] = p.milestones; data.tasks[p.id] = p.tasks;
  }
  return data;
}

import { assertTask } from "./access";
import { AppError } from "./errors";
import { atLeast } from "./permissions";

/** Task access for pages: unknown or hidden tasks are a 404. */
export async function pageTask(user: SessionUser, id: string, mode: "view" | "update" | "review" = "view") {
  try {
    return await assertTask(user, id, mode);
  } catch (e) {
    if (e instanceof AppError) { if (e.status === 403) redirect("/unauthorized"); notFound(); }
    throw e;
  }
}
