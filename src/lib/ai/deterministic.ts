import "server-only";
import { cache } from "react";
import { db } from "../db";
import { finishedEntry } from "../access";
import { capacityStatus, delayRisk, milestoneHealth, milestoneProgress, scheduleElapsedPct, unmetDependencies } from "../business";
import { PRIORITY_LABEL } from "../constants";
import { DAY_MS, fmtShortDate, sum } from "../utils";
import type { AIInsightsService, Insight, InsightSeverity, ProjectSummary } from "./types";

const STALLED_DAYS = 5;
const REVIEW_WAIT_DAYS = 2;
const PRIORITY_WEIGHT = { LOW: 0, MEDIUM: 10, HIGH: 25, CRITICAL: 40 } as const;
const days = (ms: number) => Math.floor(ms / DAY_MS);

/** One query per project per request; every insight method reads from this snapshot. */
const snapshot = cache(async (projectId: string) => {
  const since7 = new Date(Date.now() - 7 * DAY_MS);
  const [project, tasks, milestones, time, reports] = await Promise.all([
    db.project.findUniqueOrThrow({ where: { id: projectId }, select: { id: true, name: true, startDate: true, endDate: true } }),
    db.task.findMany({
      where: { projectId, deletedAt: null },
      include: { assignees: { include: { user: { select: { id: true, name: true, weeklyCapacityHours: true } } } }, dependsOn: { include: { dependsOn: { select: { id: true, title: true, status: true, dueDate: true } } } }, blocks: { select: { taskId: true } }, attachments: { select: { id: true } }, milestone: { select: { id: true, name: true } } },
    }),
    db.milestone.findMany({ where: { projectId, deletedAt: null }, include: { tasks: { where: { deletedAt: null }, select: { status: true, progress: true, dueDate: true } } }, orderBy: { dueDate: "asc" } }),
    db.timeEntry.findMany({ where: { projectId, ...finishedEntry, date: { gte: since7 } }, select: { hours: true } }),
    db.dailyReport.count({ where: { reportDate: { gte: since7 }, status: { in: ["SUBMITTED", "APPROVED"] }, items: { some: { projectId } } } }),
  ]);
  return { project, tasks, milestones, time, reports, now: new Date() };
});
type Snap = Awaited<ReturnType<typeof snapshot>>;
const open = (s: Snap) => s.tasks.filter((t) => t.status !== "COMPLETED");
const taskSrc = (t: { id: string; title: string }) => ({ type: "task" as const, id: t.id, label: t.title, href: `/tasks/${t.id}` });
const sev = (n: number): InsightSeverity => (n >= 10 ? "high" : n >= 5 ? "medium" : "low");


/** Transparent priority score: every point added is recorded in `why` so it can be shown to the user. */
export function scoreTask(t: { priority: keyof typeof PRIORITY_WEIGHT; status: string; dueDate: Date | null; dependents: number; milestoneAtRisk: boolean }, now: Date) {
  const why: string[] = [];
  let score = PRIORITY_WEIGHT[t.priority];
  if (score) why.push(`${PRIORITY_LABEL[t.priority].toLowerCase()} priority (+${score})`);
  if (t.dueDate) {
    const d = Math.ceil((t.dueDate.getTime() - now.getTime()) / DAY_MS);
    if (d < 0) { const p = Math.min(30, -d * 3 + 10); score += p; why.push(`overdue by ${-d} day(s) (+${p})`); }
    else if (d <= 3) { score += 15; why.push(`due in ${d} day(s) (+15)`); }
  }
  if (t.dependents) { const p = Math.min(24, t.dependents * 8); score += p; why.push(`${t.dependents} task(s) wait on it (+${p})`); }
  if (t.milestoneAtRisk) { score += 10; why.push("its milestone is at risk (+10)"); }
  if (t.status === "BLOCKED") { score += 5; why.push("currently blocked (+5)"); }
  return { score, why };
}

/** Top priorities for one person across all their projects (used on the personal dashboard). */
export async function recommendPrioritiesForUser(userId: string, limit = 3): Promise<Insight[]> {
  const now = new Date();
  const tasks = await db.task.findMany({
    where: { deletedAt: null, status: { not: "COMPLETED" }, assignees: { some: { userId } }, project: { deletedAt: null, archivedAt: null, status: { in: ["ACTIVE", "PLANNING"] } } },
    include: { blocks: { select: { taskId: true } }, project: { select: { code: true } } },
  });
  return tasks
    .map((t) => ({ t, ...scoreTask({ priority: t.priority, status: t.status, dueDate: t.dueDate, dependents: t.blocks.length, milestoneAtRisk: false }, now) }))
    .filter((x) => x.score > 0).sort((a, b) => b.score - a.score).slice(0, limit)
    .map(({ t, score, why }): Insight => ({
      id: `me-${t.id}`, kind: "priority", severity: score >= 50 ? "high" : score >= 30 ? "medium" : "low", projectId: t.projectId,
      title: t.title, detail: `${t.project.code} · priority score ${score}`, reason: `Score = ${why.join(" + ")}.`, sources: [taskSrc(t)],
    }));
}

export class DeterministicInsightsService implements AIInsightsService {
  async detectStalledTasks(projectId: string): Promise<Insight[]> {
    const s = await snapshot(projectId);
    const out: Insight[] = [];
    for (const t of s.tasks) {
      if (t.status === "COMPLETED" || t.status === "NOT_STARTED") continue;
      const idle = days(s.now.getTime() - t.updatedAt.getTime());
      const limit = t.status === "WAITING_FOR_REVIEW" ? REVIEW_WAIT_DAYS : STALLED_DAYS;
      if (idle < limit) continue;
      out.push({
        id: `stalled-${t.id}`, kind: t.status === "WAITING_FOR_REVIEW" ? "review" : "stalled", severity: sev(idle), projectId,
        title: t.status === "WAITING_FOR_REVIEW" ? `Review waiting ${idle} days: ${t.title}` : `No update for ${idle} days: ${t.title}`,
        detail: t.assignees.length ? `Assigned to ${t.assignees.map((a) => a.user.name).join(", ")}.` : "Nobody is assigned to this task.",
        reason: `Rule: a task in "${t.status.toLowerCase().replace(/_/g, " ")}" with no change for ${limit}+ days is flagged. Last updated ${fmtShortDate(t.updatedAt)}.`,
        sources: [taskSrc(t)],
      });
    }
    return out.sort((a, b) => Number(b.severity === "high") - Number(a.severity === "high"));
  }

  async assessMilestoneHealth(projectId: string): Promise<Insight[]> {
    const s = await snapshot(projectId);
    const out: Insight[] = [];
    for (const m of s.milestones) {
      if (m.status === "COMPLETED") continue;
      const progress = milestoneProgress(m.tasks);
      const blocked = m.tasks.filter((t) => t.status === "BLOCKED").length;
      const overdue = m.tasks.filter((t) => t.status !== "COMPLETED" && t.dueDate && t.dueDate < s.now).length;
      const health = milestoneHealth({ dueDate: m.dueDate, progress, blockedCount: blocked, overdueTaskCount: overdue, now: s.now });
      if (health === "HEALTHY") continue;
      const left = Math.ceil((m.dueDate.getTime() - s.now.getTime()) / DAY_MS);
      out.push({
        id: `milestone-${m.id}`, kind: "milestone", severity: health === "DELAYED" ? "high" : "medium", projectId,
        title: `${m.name} is ${health === "DELAYED" ? "delayed" : "at risk"}`,
        detail: left < 0 ? `Due ${-left} day(s) ago at ${progress}% complete.` : `Due in ${left} day(s) at ${progress}% complete.`,
        reason: `Computed from ${m.tasks.length} linked task(s): ${blocked} blocked, ${overdue} overdue, progress ${progress}%, due ${fmtShortDate(m.dueDate)}.`,
        sources: [{ type: "milestone", id: m.id, label: m.name, href: `/projects/${projectId}?tab=milestones` }],
      });
    }
    return out;
  }

  async recommendPriorities(projectId: string): Promise<Insight[]> {
    const s = await snapshot(projectId);
    const atRiskMilestones = new Set(
      (await this.assessMilestoneHealth(projectId)).map((i) => i.sources[0]!.id),
    );
    const scored = open(s).map((t) => ({ t, ...scoreTask({ priority: t.priority, status: t.status, dueDate: t.dueDate, dependents: t.blocks.length, milestoneAtRisk: !!t.milestoneId && atRiskMilestones.has(t.milestoneId) }, s.now) }))
      .filter((x) => x.score > 0).sort((a, b) => b.score - a.score).slice(0, 5);
    return scored.map(({ t, score, why }) => ({
      id: `priority-${t.id}`, kind: "priority", severity: score >= 50 ? "high" : score >= 30 ? "medium" : "low", projectId,
      title: t.title, detail: `Priority score ${score}. ${t.assignees.length ? "Owner: " + t.assignees.map((a) => a.user.name).join(", ") : "Unassigned"}.`,
      reason: `Score = ${why.join(" + ")}.`, sources: [taskSrc(t)],
    }));
  }

  async analyzeTeamWorkload(projectId: string): Promise<Insight[]> {
    const s = await snapshot(projectId);
    const weekEnd = new Date(s.now.getTime() + 7 * DAY_MS);
    const byUser = new Map<string, { name: string; capacity: number; planned: number; tasks: { id: string; title: string }[] }>();
    for (const t of open(s)) {
      if (t.dueDate && t.dueDate > weekEnd) continue;
      const remaining = Math.max((t.estimatedHours ?? 4) - t.loggedHours, 0) / Math.max(t.assignees.length, 1);
      for (const a of t.assignees) {
        const u = byUser.get(a.userId) ?? { name: a.user.name, capacity: a.user.weeklyCapacityHours, planned: 0, tasks: [] };
        u.planned += remaining; u.tasks.push(t); byUser.set(a.userId, u);
      }
    }
    const out: Insight[] = [];
    for (const [id, u] of byUser) {
      const status = capacityStatus(u.planned, u.capacity);
      if (status === "BALANCED") continue;
      out.push({
        id: `workload-${id}`, kind: "workload", severity: status === "OVERLOADED" ? "high" : "info", projectId,
        title: status === "OVERLOADED" ? `${u.name} looks overloaded` : `${u.name} has spare capacity`,
        detail: `${Math.round(u.planned)}h of remaining work due within 7 days against ${u.capacity}h weekly capacity.`,
        reason: `Sum of remaining estimates (estimate minus logged, split across assignees; 4h assumed when no estimate) for open tasks due in the next 7 days or already late, across ${u.tasks.length} task(s) in this project.`,
        sources: [{ type: "user", id, label: u.name }, ...u.tasks.slice(0, 3).map(taskSrc)],
      });
    }
    return out;
  }

  async findMissingEvidence(projectId: string): Promise<Insight[]> {
    const s = await snapshot(projectId);
    return s.tasks
      .filter((t) => t.requiredEvidence && t.attachments.length === 0 && (t.status === "WAITING_FOR_REVIEW" || t.status === "COMPLETED" || t.progress >= 80))
      .map((t): Insight => ({
        id: `evidence-${t.id}`, kind: "evidence", severity: t.status === "WAITING_FOR_REVIEW" ? "high" : "medium", projectId,
        title: `Evidence missing: ${t.title}`, detail: `Marked ${t.status.toLowerCase().replace(/_/g, " ")} at ${t.progress}% but has no attachments.`,
        reason: "The task requires evidence, is at 80%+ progress or beyond, and has no files or links attached.", sources: [taskSrc(t)],
      }));
  }

  async findBlockedDependencies(projectId: string): Promise<Insight[]> {
    const s = await snapshot(projectId);
    const out: Insight[] = [];
    for (const t of open(s)) {
      const unmet = unmetDependencies(t.dependsOn.map((d) => d.dependsOn));
      if (!unmet.length) continue;
      const late = unmet.filter((d) => d.dueDate && d.dueDate < s.now);
      if (!late.length && t.status !== "BLOCKED") continue;
      out.push({
        id: `dep-${t.id}`, kind: "dependency", severity: late.length ? "high" : "medium", projectId,
        title: `${t.title} is waiting on ${unmet.length} task(s)`,
        detail: unmet.map((d) => d.title).join("; "),
        reason: `${late.length} prerequisite(s) are past due and not completed${t.status === "BLOCKED" ? "; this task is marked blocked" : ""}.`,
        sources: [taskSrc(t), ...unmet.map(taskSrc)],
      });
    }
    return out;
  }

  async generateProjectSummary(projectId: string): Promise<ProjectSummary> {
    const s = await snapshot(projectId);
    const since7 = s.now.getTime() - 7 * DAY_MS;
    const stalled = await this.detectStalledTasks(projectId);
    const ms = await this.assessMilestoneHealth(projectId);
    const t = s.tasks;
    const completed = t.filter((x) => x.status === "COMPLETED");
    const stats = {
      total: t.length, completed: completed.length,
      inProgress: t.filter((x) => x.status === "IN_PROGRESS").length, blocked: t.filter((x) => x.status === "BLOCKED").length,
      overdue: open(s).filter((x) => x.dueDate && x.dueDate < s.now).length, awaitingReview: t.filter((x) => x.status === "WAITING_FOR_REVIEW").length,
      hoursLast7d: Math.round(sum(s.time.map((e) => e.hours)) * 10) / 10,
      completedLast7d: completed.filter((x) => x.completedAt && x.completedAt.getTime() >= since7).length, reportsLast7d: s.reports,
    };
    const actualPct = t.length ? Math.round(sum(t.map((x) => (x.status === "COMPLETED" ? 100 : x.progress))) / t.length) : 0;
    const risk = delayRisk({
      totalTasks: t.length, openTasks: t.length - completed.length, overdueTasks: stats.overdue, blockedTasks: stats.blocked, stalledTasks: stalled.length,
      delayedMilestones: ms.filter((m) => m.severity === "high").length, atRiskMilestones: ms.filter((m) => m.severity !== "high").length,
      plannedPct: scheduleElapsedPct(s.project.startDate, s.project.endDate, s.now), actualPct,
    });
    const paragraphs = [
      `${stats.completed} of ${stats.total} tasks are complete (${actualPct}% average progress). ${stats.completedLast7d} finished and ${stats.hoursLast7d}h were logged in the last 7 days.`,
      stats.blocked || stats.overdue || stats.awaitingReview
        ? `Attention needed: ${stats.blocked} blocked, ${stats.overdue} overdue and ${stats.awaitingReview} waiting for review.`
        : "No blocked, overdue or review-pending tasks right now.",
      ms.length ? `${ms.length} milestone(s) need attention: ${ms.map((m) => m.title).join("; ")}.` : "All open milestones are on track.",
    ];
    return {
      projectId, projectName: s.project.name, stats, risk, paragraphs,
      headline: risk.level === "High" ? "This project is at high risk of slipping." : risk.level === "Medium" ? "Some delivery risk is building." : "Delivery looks on track.",
    };
  }

  async suggestManagerActions(projectId: string): Promise<Insight[]> {
    const [stalled, evidence, deps, workload] = await Promise.all([
      this.detectStalledTasks(projectId), this.findMissingEvidence(projectId), this.findBlockedDependencies(projectId), this.analyzeTeamWorkload(projectId),
    ]);
    const s = await snapshot(projectId);
    const actions: Insight[] = [];
    const push = (id: string, severity: InsightSeverity, title: string, detail: string, reason: string, sources: Insight["sources"]) =>
      actions.push({ id: `action-${projectId}-${id}`, kind: "action", severity, title, detail, reason, sources, projectId });
    const review = s.tasks.filter((t) => t.status === "WAITING_FOR_REVIEW");
    if (review.length) push("review", "medium", `Review ${review.length} task(s) waiting for approval`, "People are blocked on your sign-off.", `${review.length} task(s) are in "waiting for review".`, review.slice(0, 4).map(taskSrc));
    const blocked = s.tasks.filter((t) => t.status === "BLOCKED");
    if (blocked.length) push("blocked", "high", `Unblock ${blocked.length} task(s)`, blocked.map((t) => `${t.title}: ${t.blockerReason ?? "no reason given"}`).slice(0, 3).join(" | "), "Tasks with status Blocked and their recorded blocker reasons.", blocked.slice(0, 4).map(taskSrc));
    if (stalled.length) push("stalled", "medium", `Check in on ${stalled.length} stalled task(s)`, "Ask owners for a quick status or reassign.", `Stalled-task rule matched ${stalled.length} task(s).`, stalled.flatMap((i) => i.sources).slice(0, 4));
    if (evidence.length) push("evidence", "medium", `Request evidence on ${evidence.length} task(s)`, "Ask assignees to attach proof before approving.", "Tasks requiring evidence have none attached.", evidence.flatMap((i) => i.sources).slice(0, 4));
    if (deps.length) push("deps", "high", `Resolve ${deps.length} dependency chain(s)`, "Late prerequisites are holding up downstream work.", "Overdue prerequisite tasks have unfinished dependents.", deps.flatMap((i) => i.sources).slice(0, 4));
    const over = workload.filter((w) => w.severity === "high");
    const under = workload.filter((w) => w.severity === "info");
    if (over.length) push("rebalance", "high", `Rebalance work from ${over.map((o) => o.sources[0]!.label).join(", ")}`, under.length ? `${under.map((u) => u.sources[0]!.label).join(", ")} ${under.length > 1 ? "have" : "has"} spare capacity.` : "Consider moving dates or adding help.", "Planned hours exceed weekly capacity.", over.flatMap((o) => o.sources.slice(0, 1)));
    return actions;
  }
}
