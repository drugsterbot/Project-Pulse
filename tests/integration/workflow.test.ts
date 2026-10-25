/**
 * End-to-end workflow test. Runs the real server actions against a real PostgreSQL database
 * (seeded with `npm run db:seed`). Only the Next.js request context is replaced:
 * the "current user" is whoever `as(email)` selects. Run with `npm run test:integration`.
 */
import { beforeAll, describe, expect, it, vi } from "vitest";

const state = { email: "mumtaz.pm@ppulse.dev" };

vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => { throw new Error(`NEXT_REDIRECT:${to}`); },
  notFound: () => { throw new Error("NEXT_NOT_FOUND"); },
  unstable_rethrow: (e: unknown) => { if (String((e as Error)?.message).startsWith("NEXT_")) throw e; },
}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "user-agent": "vitest", "x-forwarded-for": "10.0.0.1" }),
  cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }),
}));
vi.mock("@/lib/auth", async () => {
  const { db } = await import("@/lib/db");
  const actionUser = async () => {
    const u = await db.user.findUniqueOrThrow({ where: { email: state.email }, select: { id: true, orgId: true, name: true, email: true, role: true, avatarUrl: true, timezone: true, departmentId: true, weeklyCapacityHours: true, phone: true, skills: true } });
    return u;
  };
  return { actionUser, getCurrentUser: actionUser, requireUser: actionUser, createSession: async () => {}, destroySession: async () => {}, SESSION_COOKIE: "pp_session" };
});

import { db } from "@/lib/db";
import { loginAction } from "@/actions/auth";
import { addProjectMemberAction, archiveProjectAction, saveMilestoneAction, saveProjectAction } from "@/actions/projects";
import { addCommentAction, completeTaskAction, moveTaskAction, reviewTaskAction, saveTaskAction } from "@/actions/tasks";
import { reviewReportAction, saveReportAction, submitReportAction } from "@/actions/reports";
import { addTimeEntryAction, startTimerAction, stopTimerAction } from "@/actions/time";
import { addLinkAction } from "@/actions/files";
import { updateUserAction } from "@/actions/admin";
import { getInsightsService } from "@/lib/ai";
import { isoDate } from "@/lib/utils";

const as = (email: string) => { state.email = email; };
const PM = "mumtaz.pm@ppulse.dev", MEMBER = "aisha@projectpulse.dev", LEAD = "mumtaz.lead@projectpulse.dev", OTHER = "ravi@projectpulse.dev", CLIENT = "client@ppulse.dev", ADMIN = "admin@projectpulse.dev";
const idOf = async (email: string) => (await db.user.findUniqueOrThrow({ where: { email } })).id;
function fd(o: Record<string, string | string[] | boolean | undefined>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) {
    if (v === undefined) continue;
    if (Array.isArray(v)) v.forEach((x) => f.append(`${k}[]`, x));
    else f.set(k, String(v));
  }
  return f;
}
const ok = <T,>(r: { ok: boolean } & T) => { if (!r.ok) throw new Error(`expected ok, got: ${JSON.stringify(r)}`); return r as Extract<typeof r, { ok: true }>; };
const err = (r: { ok: boolean; error?: string }) => { expect(r.ok).toBe(false); return r.error ?? ""; };
const today = isoDate(new Date());
const inDays = (n: number) => isoDate(new Date(Date.now() + n * 86_400_000));

const ctx: { projectId: string; milestoneId: string; t1: string; t2: string; reportId: string } = {} as never;

beforeAll(async () => {
  const n = await db.user.count();
  if (n < 5) throw new Error("Seed the test database first: npm run db:seed");
  // Make the test re-runnable: remove what a previous run left behind (projects are archived, never hard-deleted, in the app).
  await db.dailyReportItem.deleteMany({ where: { project: { code: "E2E" } } });
  await db.project.deleteMany({ where: { code: "E2E" } });
});

describe("authentication", () => {
  it("rejects a wrong password and a suspended account, and redirects on success", async () => {
    expect(err(await loginAction(fd({ email: MEMBER, password: "wrong-password" })))).toMatch(/incorrect/i);
    expect(err(await loginAction(fd({ email: "jordan@projectpulse.dev", password: "ProjectPulse#2026" })))).toMatch(/suspended/i);
    await expect(loginAction(fd({ email: ADMIN, password: "ProjectPulse#2026", next: "/projects" }))).rejects.toThrow("NEXT_REDIRECT:/projects");
    const audit = await db.loginAudit.count({ where: { email: ADMIN, success: true } });
    expect(audit).toBeGreaterThan(0);
    const u = await db.user.findUniqueOrThrow({ where: { email: ADMIN } });
    expect(u.lastLoginAt).not.toBeNull();
  });
  it("ignores open-redirect targets", async () => {
    await expect(loginAction(fd({ email: ADMIN, password: "ProjectPulse#2026", next: "//evil.example" }))).rejects.toThrow("NEXT_REDIRECT:/dashboard");
  });
});

describe("projects and teams", () => {
  it("lets a project manager create a project with members; members cannot", async () => {
    as(MEMBER);
    expect(err(await saveProjectAction(fd({ name: "Nope", code: "NOPE", status: "ACTIVE", priority: "LOW" })))).toMatch(/only admins and project managers/i);
    as(PM);
    const res = ok(await saveProjectAction(fd({ name: "End-to-end test project", code: "e2e", status: "ACTIVE", priority: "HIGH", startDate: inDays(-10), endDate: inDays(30), memberIds: [await idOf(MEMBER), await idOf(LEAD)], estimatedHours: "200" })));
    ctx.projectId = (res.data as { id: string }).id;
    const p = await db.project.findUniqueOrThrow({ where: { id: ctx.projectId }, include: { members: true } });
    expect(p.code).toBe("E2E");
    expect(p.managerId).toBe(await idOf(PM));
    expect(p.members.map((m) => m.userId).sort()).toEqual([await idOf(MEMBER), await idOf(LEAD), await idOf(PM)].sort());
    expect(err(await saveProjectAction(fd({ name: "Dup", code: "E2E", status: "ACTIVE", priority: "LOW" })))).toMatch(/already in use/i);
    expect(err(await saveProjectAction(fd({ name: "Bad dates", code: "BADD", status: "ACTIVE", priority: "LOW", startDate: inDays(5), endDate: inDays(1) })))).toMatch(/end date/i);
  });
  it("adds a member to the project", async () => {
    as(OTHER);
    expect(err(await addProjectMemberAction(fd({ projectId: ctx.projectId, userId: await idOf(OTHER) })))).toMatch(/could not be found|permission/i);
    as(PM);
    ok(await addProjectMemberAction(fd({ projectId: ctx.projectId, userId: await idOf(OTHER) })));
    expect(await db.projectMember.count({ where: { projectId: ctx.projectId, userId: await idOf(OTHER) } })).toBe(1);
    const n = await db.notification.count({ where: { userId: await idOf(OTHER), href: `/projects/${ctx.projectId}` } });
    expect(n).toBe(1);
  });
});

describe("tasks, dependencies and the approval workflow", () => {
  it("creates a milestone and two dependent tasks; members cannot create tasks", async () => {
    as(PM);
    ok(await saveMilestoneAction(fd({ projectId: ctx.projectId, name: "Beta", dueDate: inDays(14), ownerId: await idOf(PM) })));
    ctx.milestoneId = (await db.milestone.findFirstOrThrow({ where: { projectId: ctx.projectId } })).id;
    const t1 = ok(await saveTaskAction(fd({ projectId: ctx.projectId, title: "Build login", milestoneId: ctx.milestoneId, priority: "HIGH", dueDate: inDays(5), estimatedHours: "8", requiredEvidence: "on", assigneeIds: [await idOf(MEMBER)] })));
    ctx.t1 = (t1.data as { id: string }).id;
    const t2 = ok(await saveTaskAction(fd({ projectId: ctx.projectId, title: "Build profile page", milestoneId: ctx.milestoneId, priority: "MEDIUM", dueDate: inDays(9), assigneeIds: [await idOf(MEMBER)], dependsOnIds: [ctx.t1] })));
    ctx.t2 = (t2.data as { id: string }).id;
    expect(await db.taskDependency.count({ where: { taskId: ctx.t2, dependsOnId: ctx.t1 } })).toBe(1);
    expect(await db.notification.count({ where: { userId: await idOf(MEMBER), type: "TASK_ASSIGNED", href: `/tasks/${ctx.t1}` } })).toBe(1);
    as(MEMBER);
    expect(err(await saveTaskAction(fd({ projectId: ctx.projectId, title: "Sneaky", priority: "LOW" })))).toMatch(/permission/i);
    as(PM);
    expect(err(await saveTaskAction(fd({ id: ctx.t1, projectId: ctx.projectId, title: "Build login", priority: "HIGH", dependsOnIds: [ctx.t2] })))).toMatch(/loop/i);
  });

  it("blocks starting a task whose dependency is unfinished", async () => {
    as(MEMBER);
    expect(err(await moveTaskAction(ctx.t2, "IN_PROGRESS"))).toMatch(/dependenc/i);
  });

  it("requires notes and evidence before a member can send a task for review", async () => {
    as(MEMBER);
    expect(err(await completeTaskAction(fd({ taskId: ctx.t1, notes: "" })))).toMatch(/notes/i);
    expect(err(await completeTaskAction(fd({ taskId: ctx.t1, notes: "Login works with SSO and password" })))).toMatch(/evidence/i);
    ok(await addLinkAction(fd({ projectId: ctx.projectId, taskId: ctx.t1, url: "https://github.com/acme/app/pull/42", category: "DEVELOPMENT" })));
    const file = await db.projectFile.findFirstOrThrow({ where: { taskId: ctx.t1 } });
    expect(file.kind).toBe("COMMIT_LINK");
    ok(await completeTaskAction(fd({ taskId: ctx.t1, notes: "Login works with SSO and password" })));
    const t = await db.task.findUniqueOrThrow({ where: { id: ctx.t1 } });
    expect(t.status).toBe("WAITING_FOR_REVIEW");
    expect(t.approval).toBe("PENDING");
    expect(await db.notification.count({ where: { userId: await idOf(PM), type: "TASK_AWAITING_REVIEW", href: `/tasks/${ctx.t1}` } })).toBe(1);
  });

  it("only reviewers can approve; rejection needs a comment and reopens the task", async () => {
    as(MEMBER);
    expect(err(await reviewTaskAction(fd({ taskId: ctx.t1, decision: "APPROVE" })))).toMatch(/permission/i);
    as(PM);
    expect(err(await reviewTaskAction(fd({ taskId: ctx.t1, decision: "REJECT" })))).toMatch(/comment is required/i);
    ok(await reviewTaskAction(fd({ taskId: ctx.t1, decision: "REJECT", comment: "Add a test for the lockout path" })));
    let t = await db.task.findUniqueOrThrow({ where: { id: ctx.t1 } });
    expect(t.status).toBe("REOPENED");
    expect(t.approval).toBe("REJECTED");
    expect(await db.notification.count({ where: { userId: await idOf(MEMBER), type: "TASK_REJECTED" } })).toBeGreaterThan(0);
    as(MEMBER);
    ok(await completeTaskAction(fd({ taskId: ctx.t1, notes: "Added lockout test, all green" })));
    as(PM);
    ok(await reviewTaskAction(fd({ taskId: ctx.t1, decision: "APPROVE", comment: "Nice work" })));
    t = await db.task.findUniqueOrThrow({ where: { id: ctx.t1 } });
    expect(t.status).toBe("COMPLETED");
    expect(t.completedAt).not.toBeNull();
    const history = await db.activityLog.findMany({ where: { taskId: ctx.t1, action: "status_changed" }, orderBy: { createdAt: "asc" } });
    expect(history.length).toBeGreaterThanOrEqual(3);
  });

  it("recalculates milestone progress and unlocks dependent tasks", async () => {
    const m = await db.milestone.findUniqueOrThrow({ where: { id: ctx.milestoneId } });
    expect(m.progress).toBe(50); // one task completed, one untouched
    as(MEMBER);
    ok(await moveTaskAction(ctx.t2, "IN_PROGRESS"));
    expect(err(await moveTaskAction(ctx.t2, "BLOCKED"))).toMatch(/blocking/i);
    ok(await moveTaskAction(ctx.t2, "BLOCKED", { reason: "Waiting for design assets" }));
    expect(await db.notification.count({ where: { userId: await idOf(PM), type: "BLOCKER_REPORTED", href: `/tasks/${ctx.t2}` } })).toBe(1);
  });

  it("supports comments with @mentions and keeps members out of other people's tasks", async () => {
    as(PM);
    const lead = await idOf(LEAD);
    ok(await addCommentAction(fd({ taskId: ctx.t2, body: `Can you help? @[Mumtaz Sheikh](${lead})` })));
    expect(await db.notification.count({ where: { userId: lead, type: "MENTION", href: `/tasks/${ctx.t2}` } })).toBe(1);
    as(OTHER);
    expect(err(await addCommentAction(fd({ taskId: ctx.t2, body: "hi" })))).toMatch(/could not be found/i);
    as(CLIENT);
    expect(err(await addCommentAction(fd({ taskId: ctx.t2, body: "hi" })))).toBeTruthy();
  });
});

describe("time tracking", () => {
  it("logs manual time, enforces the 24h limit, and runs a timer", async () => {
    as(MEMBER);
    ok(await addTimeEntryAction(fd({ taskId: ctx.t1, date: today, hours: "2", note: "Pairing" })));
    expect((await db.task.findUniqueOrThrow({ where: { id: ctx.t1 } })).loggedHours).toBe(2);
    expect(err(await addTimeEntryAction(fd({ taskId: ctx.t1, date: today, hours: "23" })))).toMatch(/24 hours/i);
    expect(err(await addTimeEntryAction(fd({ taskId: ctx.t1, date: inDays(2), hours: "1" })))).toMatch(/future/i);
    ok(await startTimerAction(ctx.t2));
    const running = await db.timeEntry.findFirstOrThrow({ where: { taskId: ctx.t2, endedAt: null, startedAt: { not: null } } });
    await db.timeEntry.update({ where: { id: running.id }, data: { startedAt: new Date(Date.now() - 90 * 60_000) } });
    ok(await stopTimerAction(running.id));
    const stopped = await db.timeEntry.findUniqueOrThrow({ where: { id: running.id } });
    expect(stopped.hours).toBeGreaterThan(1.4);
    expect((await db.task.findUniqueOrThrow({ where: { id: ctx.t2 } })).loggedHours).toBeCloseTo(stopped.hours, 1);
  });
});

describe("daily reports", () => {
  beforeAll(async () => {
    // The seed already contains today's report for this user; start from a clean slate.
    await db.dailyReport.deleteMany({ where: { authorId: await idOf(MEMBER), reportDate: new Date(`${today}T00:00:00.000Z`) } });
  });
  const items = () => JSON.stringify([{ projectId: ctx.projectId, taskId: ctx.t2, hoursSpent: 3, notes: "Profile page" }]);
  it("saves a draft, attaches evidence, submits and notifies reviewers", async () => {
    as(MEMBER);
    expect(err(await saveReportAction(fd({ reportDate: inDays(1), itemsJson: "[]" })))).toMatch(/future/i);
    const saved = ok(await saveReportAction(fd({ reportDate: today, completedToday: "Finished login", inProgress: "Profile page", planTomorrow: "Review", blockers: "Need design assets", mood: "NEED_HELP", itemsJson: items() })));
    ctx.reportId = (saved.data as { id: string }).id;
    expect((await db.dailyReport.findUniqueOrThrow({ where: { id: ctx.reportId } })).status).toBe("DRAFT");
    ok(await addLinkAction(fd({ projectId: ctx.projectId, reportId: ctx.reportId, url: "https://www.loom.com/share/demo-123", category: "DEVELOPMENT" })));
    expect(await db.dailyReportAttachment.count({ where: { reportId: ctx.reportId } })).toBe(1);
    ok(await submitReportAction(fd({ reportId: ctx.reportId })));
    const r = await db.dailyReport.findUniqueOrThrow({ where: { id: ctx.reportId } });
    expect(r.status).toBe("SUBMITTED");
    expect(await db.timeEntry.count({ where: { reportId: ctx.reportId } })).toBe(1);
    expect(await db.notification.count({ where: { userId: await idOf(PM), type: "DAILY_REPORT_SUBMITTED", href: `/daily-reports/${ctx.reportId}` } })).toBe(1);
    expect(await db.notification.count({ where: { userId: await idOf(PM), type: "BLOCKER_REPORTED", href: `/daily-reports/${ctx.reportId}` } })).toBe(1);
    expect(err(await submitReportAction(fd({ reportId: ctx.reportId })))).toMatch(/already been submitted/i);
  });

  it("keeps task hours in sync when a submitted report is edited before review", async () => {
    as(MEMBER);
    const before = (await db.task.findUniqueOrThrow({ where: { id: ctx.t2 } })).loggedHours;
    ok(await saveReportAction(fd({ reportDate: today, completedToday: "Finished login", inProgress: "Profile page", mood: "NORMAL", itemsJson: JSON.stringify([{ projectId: ctx.projectId, taskId: ctx.t2, hoursSpent: 5 }]) })));
    const after = (await db.task.findUniqueOrThrow({ where: { id: ctx.t2 } })).loggedHours;
    expect(after - before).toBeCloseTo(2, 1);
  });

  it("limits who can review, and requires comments for changes or rejection", async () => {
    as(OTHER);
    expect(err(await reviewReportAction(fd({ reportId: ctx.reportId, decision: "APPROVED" })))).toMatch(/could not be found/i);
    as(MEMBER);
    expect(err(await reviewReportAction(fd({ reportId: ctx.reportId, decision: "APPROVED" })))).toMatch(/could not be found|permission/i);
    as(PM);
    expect(err(await reviewReportAction(fd({ reportId: ctx.reportId, decision: "CHANGES_REQUESTED" })))).toMatch(/comment/i);
    ok(await reviewReportAction(fd({ reportId: ctx.reportId, decision: "CHANGES_REQUESTED", comment: "Please add the time spent on login" })));
    expect((await db.dailyReport.findUniqueOrThrow({ where: { id: ctx.reportId } })).status).toBe("CHANGES_REQUESTED");
    as(MEMBER);
    ok(await submitReportAction(fd({ reportId: ctx.reportId })));
    as(LEAD);
    ok(await reviewReportAction(fd({ reportId: ctx.reportId, decision: "APPROVED", comment: "Thanks" })));
    expect((await db.dailyReport.findUniqueOrThrow({ where: { id: ctx.reportId } })).status).toBe("APPROVED");
    as(MEMBER);
    expect(err(await saveReportAction(fd({ reportDate: today, completedToday: "Sneaky edit", itemsJson: "[]" })))).toMatch(/already been reviewed/i);
  });
});

describe("AI insights and reporting", () => {
  it("produces a project summary and explains every insight", async () => {
    const ai = getInsightsService();
    const s = await ai.generateProjectSummary(ctx.projectId);
    expect(s.stats.total).toBe(2);
    expect(s.stats.completed).toBe(1);
    expect(s.stats.blocked).toBe(1);
    expect(s.risk.score).toBeGreaterThanOrEqual(0);
    const all = [...(await ai.suggestManagerActions(ctx.projectId)), ...(await ai.recommendPriorities(ctx.projectId)), ...(await ai.analyzeTeamWorkload(ctx.projectId)), ...(await ai.assessMilestoneHealth(ctx.projectId)), ...(await ai.detectStalledTasks(ctx.projectId)), ...(await ai.findBlockedDependencies(ctx.projectId)), ...(await ai.findMissingEvidence(ctx.projectId))];
    expect(all.length).toBeGreaterThan(0);
    for (const i of all) { expect(i.reason.length).toBeGreaterThan(10); expect(i.sources.length).toBeGreaterThan(0); }
    expect(all.some((i) => i.kind === "action" && /unblock/i.test(i.title))).toBe(true);
  });
});

describe("administration and archiving", () => {
  it("stops admins from modifying super admins", async () => {
    as(ADMIN);
    const sup = await db.user.findUniqueOrThrow({ where: { email: "superadmin@projectpulse.dev" } });
    expect(err(await updateUserAction(fd({ id: sup.id, role: "ADMIN", status: "ACTIVE" })))).toMatch(/super admin/i);
    as(MEMBER);
    expect(err(await updateUserAction(fd({ id: sup.id, role: "ADMIN", status: "ACTIVE" })))).toMatch(/permission/i);
  });
  it("archives and restores a project (managers only)", async () => {
    as(MEMBER);
    expect(err(await archiveProjectAction(ctx.projectId, true))).toMatch(/permission/i);
    as(PM);
    ok(await archiveProjectAction(ctx.projectId, true));
    expect((await db.project.findUniqueOrThrow({ where: { id: ctx.projectId } })).archivedAt).not.toBeNull();
    ok(await archiveProjectAction(ctx.projectId, false));
    expect((await db.project.findUniqueOrThrow({ where: { id: ctx.projectId } })).archivedAt).toBeNull();
  });
});
