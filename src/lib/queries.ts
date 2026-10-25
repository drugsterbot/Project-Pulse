import "server-only";
import { db, type Prisma } from "./db";
import type { SessionUser } from "./auth";
import { finishedEntry, projectWhere, taskWhere } from "./access";
import { capacityStatus } from "./business";
import { isAdminRole } from "./permissions";
import { addDays, isoDate, parseDateOnly, startOfWeek, sum, todayUTC } from "./utils";

/** People whose work the user can see: everyone for admins, otherwise people sharing a project. */
export function scopeUserWhere(user: SessionUser): Prisma.UserWhereInput {
  const base: Prisma.UserWhereInput = { orgId: user.orgId, deletedAt: null, status: "ACTIVE", role: { not: "CLIENT_VIEWER" } };
  return isAdminRole(user.role) ? base : { ...base, projectMemberships: { some: { project: projectWhere(user) } } };
}

/** People whose daily reports the viewer can review: admins see everyone; PMs the people on projects they manage; leads the people on projects they belong to. */
export function reviewScopeUserWhere(user: SessionUser): Prisma.UserWhereInput {
  const base: Prisma.UserWhereInput = { orgId: user.orgId, deletedAt: null, status: "ACTIVE", role: { not: "CLIENT_VIEWER" } };
  if (isAdminRole(user.role)) return base;
  const projects: Prisma.ProjectWhereInput = user.role === "PROJECT_MANAGER"
    ? { managerId: user.id, deletedAt: null }
    : { members: { some: { userId: user.id } }, deletedAt: null };
  return { ...base, projectMemberships: { some: { project: projects } } };
}

export const taskCardInclude = {
  project: { select: { id: true, name: true, code: true } },
  milestone: { select: { id: true, name: true } },
  assignees: { include: { user: { select: { id: true, name: true, avatarUrl: true } } } },
  subtasks: { select: { id: true, done: true } },
} satisfies Prisma.TaskInclude;
export type TaskCard = Prisma.TaskGetPayload<{ include: typeof taskCardInclude }>;

export type TaskFilters = {
  q?: string; status?: string; priority?: string; projectId?: string; assignee?: string; due?: string; milestoneId?: string; label?: string;
  sort?: string; page?: number; pageSize?: number; mine?: boolean;
};

export function taskFilterWhere(user: SessionUser, f: TaskFilters): Prisma.TaskWhereInput {
  const today = todayUTC();
  const and: Prisma.TaskWhereInput[] = [taskWhere(user)];
  if (f.mine) and.push({ assignees: { some: { userId: user.id } } });
  if (f.q) and.push({ OR: [{ title: { contains: f.q, mode: "insensitive" } }, { description: { contains: f.q, mode: "insensitive" } }] });
  if (f.status) and.push({ status: f.status as "COMPLETED" });
  if (f.priority) and.push({ priority: f.priority as "HIGH" });
  if (f.projectId) and.push({ projectId: f.projectId });
  if (f.milestoneId) and.push({ milestoneId: f.milestoneId });
  if (f.label) and.push({ labels: { has: f.label } });
  if (f.assignee) and.push(f.assignee === "none" ? { assignees: { none: {} } } : { assignees: { some: { userId: f.assignee === "me" ? user.id : f.assignee } } });
  if (f.due === "overdue") and.push({ status: { not: "COMPLETED" }, dueDate: { lt: today } });
  if (f.due === "today") and.push({ dueDate: { gte: today, lt: addDays(today, 1) } });
  if (f.due === "week") and.push({ dueDate: { gte: today, lt: addDays(today, 8) } });
  return { AND: and };
}

const PRIORITY_ORDER = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 } as const;
export async function listTasks(user: SessionUser, f: TaskFilters) {
  const where = taskFilterWhere(user, f);
  const pageSize = f.pageSize ?? 20;
  const page = Math.max(f.page ?? 1, 1);
  const orderBy: Prisma.TaskOrderByWithRelationInput[] =
    f.sort === "updated" ? [{ updatedAt: "desc" }] : f.sort === "priority" ? [{ priority: "desc" }, { dueDate: "asc" }] : [{ dueDate: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }];
  const [rows, total] = await Promise.all([
    db.task.findMany({ where, include: taskCardInclude, orderBy, skip: (page - 1) * pageSize, take: pageSize }),
    db.task.count({ where }),
  ]);
  if (f.sort === "priority") rows.sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] || (a.dueDate?.getTime() ?? 9e15) - (b.dueDate?.getTime() ?? 9e15));
  return { rows, total, page, pageSize };
}

/** Weekly planned vs capacity vs logged hours for each person in the viewer's scope. */
export async function getWorkload(user: SessionUser, weekStart: Date, f: { projectId?: string; teamId?: string } = {}) {
  const weekEnd = addDays(weekStart, 7);
  const people = await db.user.findMany({
    where: { AND: [scopeUserWhere(user), f.teamId ? { teamMemberships: { some: { teamId: f.teamId } } } : {}, f.projectId ? { projectMemberships: { some: { projectId: f.projectId } } } : {}] },
    select: { id: true, name: true, avatarUrl: true, role: true, weeklyCapacityHours: true, department: { select: { name: true } } },
    orderBy: { name: "asc" },
  });
  const ids = people.map((p) => p.id);
  const [tasks, entries] = await Promise.all([
    db.task.findMany({
      where: { AND: [taskWhere(user), { status: { not: "COMPLETED" }, dueDate: { lt: weekEnd }, assignees: { some: { userId: { in: ids } } }, ...(f.projectId ? { projectId: f.projectId } : {}) }] },
      select: { id: true, title: true, estimatedHours: true, loggedHours: true, projectId: true, assignees: { select: { userId: true } } },
    }),
    db.timeEntry.findMany({ where: { ...finishedEntry, userId: { in: ids }, date: { gte: weekStart, lt: weekEnd }, ...(f.projectId ? { projectId: f.projectId } : {}) }, select: { userId: true, hours: true } }),
  ]);
  return people.map((p) => {
    const mine = tasks.filter((t) => t.assignees.some((a) => a.userId === p.id));
    const planned = sum(mine.map((t) => Math.max((t.estimatedHours ?? 4) - t.loggedHours, 0) / Math.max(t.assignees.length, 1)));
    const logged = sum(entries.filter((e) => e.userId === p.id).map((e) => e.hours));
    return { ...p, planned: Math.round(planned * 10) / 10, logged: Math.round(logged * 10) / 10, openTasks: mine.length, status: capacityStatus(planned, p.weeklyCapacityHours) };
  });
}

/** In-scope people who should have submitted a report for `date` but haven't (workdays only). */
export async function getMissingReports(user: SessionUser, date: Date, projectId?: string) {
  if ([0, 6].includes(date.getUTCDay())) return [];
  return db.user.findMany({
    where: { AND: [reviewScopeUserWhere(user), { role: { in: ["TEAM_MEMBER", "TEAM_LEAD"] }, id: { not: user.id } }, projectId ? { projectMemberships: { some: { projectId } } } : {},
      { dailyReports: { none: { reportDate: date, status: { in: ["SUBMITTED", "APPROVED", "CHANGES_REQUESTED", "REJECTED"] } } } }] },
    select: { id: true, name: true, avatarUrl: true, role: true, dailyReports: { where: { reportDate: date }, select: { status: true } } },
    orderBy: { name: "asc" },
  });
}

export const weekOf = (s?: string) => startOfWeek(s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? parseDateOnly(s) : new Date());
export { isoDate };

/** Flatten Next searchParams into a string map. */
export function flat(sp: Record<string, string | string[] | undefined>) {
  const o: Record<string, string> = {};
  for (const [k, v] of Object.entries(sp)) { const x = Array.isArray(v) ? v[0] : v; if (x) o[k] = x; }
  return o;
}
export function qs(base: Record<string, string | undefined>, patch: Record<string, string | undefined>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...base, ...patch })) if (v) p.set(k, v);
  const s = p.toString();
  return s ? `?${s}` : "";
}
