import "server-only";
import { db, type Prisma } from "./db";
import type { SessionUser } from "./auth";
import { AppError, forbidden, notFoundError } from "./errors";
import { can, canUpdateTask, canViewTask, isAdminRole, projectLevel, type Level, type ProjectAction } from "./permissions";

/** Prisma filter: projects the user may see. */
export function projectWhere(user: SessionUser): Prisma.ProjectWhereInput {
  const base: Prisma.ProjectWhereInput = { orgId: user.orgId, deletedAt: null };
  if (isAdminRole(user.role)) return base;
  if (user.role === "CLIENT_VIEWER") return { ...base, members: { some: { userId: user.id, isClientAccess: true } } };
  return { ...base, OR: [{ managerId: user.id }, { members: { some: { userId: user.id } } }] };
}

/** Prisma filter: tasks the user may see. Team members only see tasks assigned to or created by them. */
export function taskWhere(user: SessionUser): Prisma.TaskWhereInput {
  const base: Prisma.TaskWhereInput = { deletedAt: null, project: { ...projectWhere(user), archivedAt: null } };
  if (user.role === "TEAM_MEMBER") return { ...base, OR: [{ assignees: { some: { userId: user.id } } }, { creatorId: user.id }] };
  return base;
}

export async function loadProjectAccess(user: SessionUser, projectId: string) {
  const project = await db.project.findFirst({
    where: { id: projectId, orgId: user.orgId, deletedAt: null },
    include: { members: { where: { userId: user.id } }, manager: { select: { id: true, name: true } } },
  });
  if (!project) return null;
  const level = projectLevel(user, project, project.members[0] ?? null);
  return level ? { project, level } : null;
}

/** For server actions: throws a friendly error when the user lacks the permission. */
export async function assertProject(user: SessionUser, projectId: string, action: ProjectAction) {
  const access = await loadProjectAccess(user, projectId);
  if (!access) throw notFoundError("That project");
  if (!can(access.level, action)) throw forbidden();
  return access as { project: typeof access.project; level: Level };
}

export async function assertTask(user: SessionUser, taskId: string, mode: "view" | "update" | "review" | "comment") {
  const task = await db.task.findFirst({
    where: { id: taskId, deletedAt: null, project: { orgId: user.orgId, deletedAt: null } },
    include: { assignees: true, project: { include: { members: { where: { userId: user.id } } } } },
  });
  if (!task) throw notFoundError("That task");
  const level = projectLevel(user, task.project, task.project.members[0] ?? null);
  const facts = { assigneeIds: task.assignees.map((a) => a.userId), creatorId: task.creatorId };
  if (!canViewTask(level, user.role, user.id, facts)) throw notFoundError("That task");
  const ok =
    mode === "view" ? true :
    mode === "update" ? canUpdateTask(level, user.id, facts) :
    mode === "review" ? can(level, "review") :
    can(level, "comment");
  if (!ok) throw forbidden();
  return { task, level: level as Level, assigneeIds: facts.assigneeIds };
}

/** Manager, project team leads and (if none) admins: who should hear about reviews and blockers. */
export async function projectReviewerIds(projectId: string, exceptUserId?: string) {
  const project = await db.project.findUnique({ where: { id: projectId }, select: { managerId: true, orgId: true } });
  if (!project) return [];
  const leads = await db.user.findMany({
    where: { status: "ACTIVE", deletedAt: null, role: "TEAM_LEAD", projectMemberships: { some: { projectId } } },
    select: { id: true },
  });
  let ids = [project.managerId, ...leads.map((l) => l.id)].filter((x): x is string => !!x);
  if (!ids.length) {
    ids = (await db.user.findMany({ where: { orgId: project.orgId, role: { in: ["ADMIN", "SUPER_ADMIN"] }, status: "ACTIVE", deletedAt: null }, select: { id: true } })).map((u) => u.id);
  }
  return [...new Set(ids)].filter((id) => id !== exceptUserId);
}

export function assertOrg<T extends { orgId: string }>(user: SessionUser, row: T | null, what: string): T {
  if (!row || row.orgId !== user.orgId) throw new AppError(`${what} could not be found.`, 404);
  return row;
}

/** Levels the viewer holds on projects that the given author also belongs to. */
export async function sharedProjectLevels(user: SessionUser, authorId: string) {
  const projects = await db.project.findMany({
    where: { AND: [projectWhere(user), { OR: [{ managerId: authorId }, { members: { some: { userId: authorId } } }] }] },
    include: { members: { where: { userId: user.id } } },
  });
  return projects.map((p) => projectLevel(user, p, p.members[0] ?? null));
}

/** What the viewer may do with a daily report written by `authorId`. */
export async function reportViewerFlags(user: SessionUser, authorId: string) {
  const { canReviewReport } = await import("./permissions");
  if (authorId === user.id) return { isAuthor: true, canReview: false, canView: true };
  if (user.role === "TEAM_MEMBER" || user.role === "CLIENT_VIEWER") return { isAuthor: false, canReview: false, canView: false };
  const canReview = canReviewReport(user, authorId, await sharedProjectLevels(user, authorId));
  return { isAuthor: false, canReview, canView: canReview };
}

export async function assertReport(user: SessionUser, reportId: string, need: "view" | "review" | "author") {
  const report = await db.dailyReport.findFirst({ where: { id: reportId, author: { orgId: user.orgId, deletedAt: null } }, include: { author: { select: { id: true, name: true } } } });
  if (!report) throw notFoundError("That report");
  const flags = await reportViewerFlags(user, report.authorId);
  if (!flags.canView) throw notFoundError("That report");
  if (need === "review" && !flags.canReview) throw forbidden();
  if (need === "author" && !flags.isAuthor) throw forbidden();
  return { report, ...flags };
}

/** Reviewers for a set of projects (managers + leads), falling back to admins. */
export async function reportReviewerIds(authorId: string, projectIds: string[]) {
  const ids = new Set<string>();
  for (const pid of projectIds) for (const id of await projectReviewerIds(pid, authorId)) ids.add(id);
  return [...ids];
}

/** Time entries that are finished (manual entries, report-generated entries and stopped timers). */
export const finishedEntry = { deletedAt: null, OR: [{ startedAt: null }, { endedAt: { not: null } }] } satisfies Prisma.TimeEntryWhereInput;
export const runningEntry = { deletedAt: null, startedAt: { not: null }, endedAt: null } satisfies Prisma.TimeEntryWhereInput;
