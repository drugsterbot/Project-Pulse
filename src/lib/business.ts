import type { Health, TaskStatus } from "./constants";
import { DAY_MS } from "./utils";

/** Pure business rules used by server actions, the AI service and the reports. */

export const isOpenStatus = (s: TaskStatus) => s !== "COMPLETED";
export const isOverdue = (t: { status: TaskStatus; dueDate: Date | null }, now = new Date()) =>
  !!t.dueDate && t.status !== "COMPLETED" && t.dueDate.getTime() < startOfUTCDay(now);
const startOfUTCDay = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());

/** A completion request needs notes, plus evidence when the task requires it. */
export function validateCompletion(input: { notes?: string | null; requiredEvidence: boolean; evidenceCount: number }) {
  if (!input.notes || input.notes.trim().length < 3) return "Add completion notes before sending this task for review.";
  if (input.requiredEvidence && input.evidenceCount < 1) return "This task requires evidence. Attach a file or link first.";
  return null;
}

/** Tasks that are not completed yet but that the given task depends on. */
export const unmetDependencies = <T extends { status: TaskStatus }>(deps: T[]) => deps.filter((d) => d.status !== "COMPLETED");

/** Would adding `taskId -> dependsOnId` create a cycle? `edges` are existing (taskId depends on dependsOnId) pairs. */
export function createsCycle(edges: { taskId: string; dependsOnId: string }[], taskId: string, dependsOnId: string) {
  if (taskId === dependsOnId) return true;
  const next = new Map<string, string[]>();
  for (const e of edges) next.set(e.taskId, [...(next.get(e.taskId) ?? []), e.dependsOnId]);
  const seen = new Set<string>();
  const stack = [dependsOnId];
  while (stack.length) {
    const cur = stack.pop()!;
    if (cur === taskId) return true;
    if (seen.has(cur)) continue;
    seen.add(cur);
    stack.push(...(next.get(cur) ?? []));
  }
  return false;
}

/** Milestone progress is the mean task progress (completed tasks count as 100). */
export function milestoneProgress(tasks: { status: TaskStatus; progress: number }[]) {
  if (!tasks.length) return 0;
  const total = tasks.reduce((a, t) => a + (t.status === "COMPLETED" ? 100 : Math.min(100, Math.max(0, t.progress))), 0);
  return Math.round(total / tasks.length);
}

export function milestoneHealth(input: {
  dueDate: Date; progress: number; blockedCount: number; overdueTaskCount: number; now?: Date;
}): Health {
  const now = (input.now ?? new Date()).getTime();
  const daysLeft = (input.dueDate.getTime() - now) / DAY_MS;
  if (input.progress >= 100) return "HEALTHY";
  if (daysLeft < 0) return "DELAYED";
  if (input.blockedCount > 0 || input.overdueTaskCount > 0) return "AT_RISK";
  if (daysLeft <= 7 && input.progress < 70) return "AT_RISK";
  if (daysLeft <= 14 && input.progress < 35) return "AT_RISK";
  return "HEALTHY";
}

export type Capacity = "UNDER" | "BALANCED" | "OVERLOADED";
export function capacityStatus(plannedHours: number, capacityHours: number): Capacity {
  if (capacityHours <= 0) return "BALANCED";
  const ratio = plannedHours / capacityHours;
  if (ratio > 1) return "OVERLOADED";
  if (ratio < 0.5) return "UNDER";
  return "BALANCED";
}
export const CAPACITY_LABEL: Record<Capacity, string> = { UNDER: "Under capacity", BALANCED: "Balanced", OVERLOADED: "Overloaded" };

/** 0-100 delay-risk score with the reasons that contributed, so the UI can explain it. */
export function delayRisk(i: {
  totalTasks: number; openTasks: number; overdueTasks: number; blockedTasks: number; stalledTasks: number;
  delayedMilestones: number; atRiskMilestones: number; plannedPct: number; actualPct: number;
}) {
  const reasons: string[] = [];
  let score = 0;
  const add = (pts: number, why: string) => { if (pts > 0) { score += pts; reasons.push(`+${Math.round(pts)}: ${why}`); } };
  const open = Math.max(i.openTasks, 1);
  add(Math.min(30, (i.overdueTasks / open) * 60), `${i.overdueTasks} overdue of ${i.openTasks} open tasks`);
  add(Math.min(20, i.blockedTasks * 7), `${i.blockedTasks} blocked task(s)`);
  add(Math.min(10, i.stalledTasks * 3), `${i.stalledTasks} stalled task(s)`);
  add(Math.min(25, i.delayedMilestones * 15 + i.atRiskMilestones * 7), `${i.delayedMilestones} delayed and ${i.atRiskMilestones} at-risk milestone(s)`);
  const gap = i.plannedPct - i.actualPct;
  add(gap > 10 ? Math.min(15, (gap - 10) / 3) : 0, `progress ${i.actualPct}% vs ${i.plannedPct}% of schedule elapsed`);
  score = Math.min(100, Math.round(score));
  const level = score >= 60 ? "High" : score >= 30 ? "Medium" : "Low";
  return { score, level, reasons } as { score: number; level: "High" | "Medium" | "Low"; reasons: string[] };
}

/** Share of the schedule that has elapsed (0-100). */
export function scheduleElapsedPct(start: Date | null, end: Date | null, now = new Date()) {
  if (!start || !end || end <= start) return 0;
  return Math.max(0, Math.min(100, Math.round(((now.getTime() - start.getTime()) / (end.getTime() - start.getTime())) * 100)));
}

export type ReportStatusT = "DRAFT" | "SUBMITTED" | "APPROVED" | "CHANGES_REQUESTED" | "REJECTED";
/** Which review decisions are valid from the current report status. */
export function canReviewStatus(status: ReportStatusT) {
  return status === "SUBMITTED" || status === "CHANGES_REQUESTED";
}
export function validateReviewDecision(decision: "APPROVED" | "CHANGES_REQUESTED" | "REJECTED", comment?: string | null) {
  if (decision !== "APPROVED" && (!comment || comment.trim().length < 3)) return "A comment is required when requesting changes or rejecting.";
  return null;
}

/** Pull @[Name](userId) tokens out of a comment body. */
export function extractMentions(body: string) {
  return [...body.matchAll(/@\[([^\]]+)\]\(([a-z0-9]+)\)/gi)].map((m) => m[2]!);
}
export const renderMentions = (body: string) => body.replace(/@\[([^\]]+)\]\(([a-z0-9]+)\)/gi, "@$1");

export function guessFileKind(name: string, mime?: string | null) {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  if (mime?.startsWith("image/") || ["png", "jpg", "jpeg", "gif", "webp"].includes(ext)) return "IMAGE" as const;
  if (ext === "pdf") return "PDF" as const;
  if (["doc", "docx"].includes(ext)) return "DOCUMENT" as const;
  if (["xls", "xlsx", "csv"].includes(ext)) return "SPREADSHEET" as const;
  if (["ppt", "pptx"].includes(ext)) return "PRESENTATION" as const;
  if (["txt", "md", "log", "json"].includes(ext)) return "TEXT" as const;
  return "OTHER" as const;
}
export function classifyLink(url: string) {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    if (/(github\.com|gitlab\.com|bitbucket\.org)$/.test(host) && /\/(commit|commits|pull|merge_requests|pulls)\b/.test(u.pathname)) return "COMMIT_LINK" as const;
    if (/(youtube\.com|youtu\.be|vimeo\.com|loom\.com|drive\.google\.com)$/.test(host) && !/\/folders\//.test(u.pathname) && host !== "drive.google.com") return "VIDEO_LINK" as const;
    return "LINK" as const;
  } catch {
    return null;
  }
}
