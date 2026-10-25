import "server-only";
import { db, type Prisma } from "./db";
import { milestoneHealth, milestoneProgress } from "./business";
import type { NotificationType } from "./constants";
import { DAY_MS } from "./utils";
import { finishedEntry } from "./access";

type Client = Prisma.TransactionClient;

export async function logActivity(tx: Client, p: { actorId?: string | null; projectId?: string | null; taskId?: string | null; action: string; summary: string; meta?: Prisma.InputJsonValue }) {
  await tx.activityLog.create({ data: { actorId: p.actorId ?? null, projectId: p.projectId ?? null, taskId: p.taskId ?? null, action: p.action, summary: p.summary, meta: p.meta } });
}

export type NotificationInput = { type: NotificationType; title: string; body?: string; href?: string };
type Channel = (userId: string, n: NotificationInput) => Promise<void>;
/** In-app notifications are always stored. Push an email channel here later, e.g. channels.push(sendEmailChannel). */
const channels: Channel[] = [];

export async function notify(tx: Client, userIds: string[], n: NotificationInput, exceptUserId?: string | null) {
  const ids = [...new Set(userIds)].filter((id) => id && id !== exceptUserId);
  if (!ids.length) return;
  await tx.notification.createMany({ data: ids.map((userId) => ({ userId, type: n.type, title: n.title, body: n.body, href: n.href })) });
  for (const id of ids) for (const ch of channels) ch(id, n).catch((e) => console.error("[notify channel]", e));
}

/** Recompute progress/status/health for a milestone from its tasks; alert owner and manager when it slips. */
export async function recalcMilestone(tx: Client, milestoneId: string | null | undefined) {
  if (!milestoneId) return;
  const m = await tx.milestone.findUnique({ where: { id: milestoneId }, include: { project: { select: { managerId: true, name: true, id: true } }, tasks: { where: { deletedAt: null } } } });
  if (!m) return;
  const progress = milestoneProgress(m.tasks);
  const now = new Date();
  const blockedCount = m.tasks.filter((t) => t.status === "BLOCKED").length;
  const overdueTaskCount = m.tasks.filter((t) => t.status !== "COMPLETED" && t.dueDate && t.dueDate < now).length;
  const health = m.tasks.length ? milestoneHealth({ dueDate: m.dueDate, progress, blockedCount, overdueTaskCount, now }) : m.dueDate < now ? "DELAYED" : "HEALTHY";
  const status = m.tasks.length && progress >= 100 ? "COMPLETED" : m.tasks.some((t) => t.status !== "NOT_STARTED") ? "IN_PROGRESS" : "PENDING";
  await tx.milestone.update({ where: { id: m.id }, data: { progress, health, status } });
  if (health !== "HEALTHY" && m.health === "HEALTHY") {
    await notify(tx, [m.project.managerId, m.ownerId].filter((x): x is string => !!x), {
      type: "MILESTONE_AT_RISK", title: `Milestone ${health === "DELAYED" ? "delayed" : "at risk"}: ${m.name}`, body: `${m.project.name} is now ${health === "DELAYED" ? "behind" : "at risk on"} this milestone (${progress}% complete).`, href: `/projects/${m.project.id}?tab=milestones`,
    });
  }
}

export async function syncTaskHours(tx: Client, taskId: string) {
  const agg = await tx.timeEntry.aggregate({ where: { taskId, ...finishedEntry }, _sum: { hours: true } });
  await tx.task.update({ where: { id: taskId }, data: { loggedHours: Math.round((agg._sum.hours ?? 0) * 100) / 100 } });
}

/** Lazily create "due soon" / "overdue" notifications for a user (at most one per task per day). */
export async function ensureDeadlineNotifications(userId: string) {
  const now = new Date();
  const horizon = new Date(now.getTime() + 2 * DAY_MS);
  const tasks = await db.task.findMany({
    where: { deletedAt: null, status: { not: "COMPLETED" }, dueDate: { lte: horizon }, assignees: { some: { userId } }, project: { archivedAt: null, deletedAt: null } },
    select: { id: true, title: true, dueDate: true },
    take: 25,
  });
  if (!tasks.length) return;
  const since = new Date(now.getTime() - DAY_MS);
  const recent = await db.notification.findMany({ where: { userId, createdAt: { gte: since }, type: { in: ["DEADLINE_APPROACHING", "TASK_OVERDUE"] } }, select: { href: true, type: true } });
  const seen = new Set(recent.map((r) => `${r.type}:${r.href}`));
  const data = tasks.flatMap((t) => {
    const overdue = t.dueDate! < new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const type = overdue ? "TASK_OVERDUE" : "DEADLINE_APPROACHING";
    const href = `/tasks/${t.id}`;
    if (seen.has(`${type}:${href}`)) return [];
    return [{ userId, type: type as NotificationType, title: overdue ? `Overdue: ${t.title}` : `Due soon: ${t.title}`, href }];
  });
  if (data.length) await db.notification.createMany({ data });
}
