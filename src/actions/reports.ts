"use server";

import { revalidatePath } from "next/cache";
import { db, type Prisma } from "@/lib/db";
import { actionUser } from "@/lib/auth";
import { assertProject, assertReport, reportReviewerIds, taskWhere } from "@/lib/access";
import { logActivity, notify, syncTaskHours } from "@/lib/activity";
import { canReviewStatus, validateReviewDecision } from "@/lib/business";
import { AppError, forbidden, run, type ActionResult } from "@/lib/errors";
import { canEditReport } from "@/lib/permissions";
import { formObject, reportSchema, reviewReportSchema, parseId } from "@/lib/validators";
import { DAY_MS, parseDateOnly, todayUTC } from "@/lib/utils";

type Tx = Prisma.TransactionClient;

/** Time spent per task in a report becomes real time entries, so timesheets and reports always agree. */
async function syncReportTimeEntries(tx: Tx, report: { id: string; authorId: string; reportDate: Date }) {
  const old = await tx.timeEntry.findMany({ where: { reportId: report.id }, select: { taskId: true } });
  await tx.timeEntry.deleteMany({ where: { reportId: report.id } });
  const items = await tx.dailyReportItem.findMany({ where: { reportId: report.id, taskId: { not: null }, hoursSpent: { gt: 0 } } });
  if (items.length) {
    await tx.timeEntry.createMany({ data: items.map((i) => ({ userId: report.authorId, taskId: i.taskId!, projectId: i.projectId, date: report.reportDate, hours: i.hoursSpent, note: i.notes?.slice(0, 200) || "From daily report", reportId: report.id })) });
  }
  for (const taskId of new Set([...old.map((o) => o.taskId), ...items.map((i) => i.taskId!)])) await syncTaskHours(tx, taskId);
}

export async function saveReportAction(fd: FormData): Promise<ActionResult<{ id: string; status: string }>> {
  return run(async () => {
    const user = await actionUser();
    if (user.role === "CLIENT_VIEWER") throw forbidden();
    const raw = formObject(fd);
    let items: unknown = [];
    try { items = JSON.parse(String(raw.itemsJson ?? "[]")); } catch { throw new AppError("The task list could not be read."); }
    const input = reportSchema.parse({ ...raw, items });
    const date = parseDateOnly(input.reportDate);
    if (date > todayUTC()) throw new AppError("You can’t file a report for a future date.");
    if (todayUTC().getTime() - date.getTime() > 14 * DAY_MS) throw new AppError("Reports can be filed for the last 14 days only.");

    for (const pid of new Set(input.items.map((i) => i.projectId))) await assertProject(user, pid, "logTime");
    const taskIds = input.items.map((i) => i.taskId).filter((t): t is string => !!t);
    if (taskIds.length) {
      const ok = await db.task.findMany({ where: { AND: [taskWhere(user), { id: { in: taskIds } }] }, select: { id: true, projectId: true } });
      const map = new Map(ok.map((t) => [t.id, t.projectId]));
      for (const i of input.items) if (i.taskId && map.get(i.taskId) !== i.projectId) throw new AppError("A selected task does not belong to its project.");
    }
    const content = {
      completedToday: input.completedToday ?? null, inProgress: input.inProgress ?? null, progressUpdate: input.progressUpdate ?? null,
      planTomorrow: input.planTomorrow ?? null, blockers: input.blockers ?? null, mood: input.mood,
    };
    const saved = await db.$transaction(async (tx) => {
      const existing = await tx.dailyReport.findUnique({ where: { authorId_reportDate: { authorId: user.id, reportDate: date } } });
      if (existing && !canEditReport(user.id, existing)) throw new AppError("This report has already been reviewed and can’t be edited.");
      const report = existing
        ? await tx.dailyReport.update({ where: { id: existing.id }, data: content })
        : await tx.dailyReport.create({ data: { ...content, authorId: user.id, reportDate: date, status: "DRAFT" } });
      await tx.dailyReportItem.deleteMany({ where: { reportId: report.id } });
      if (input.items.length) {
        await tx.dailyReportItem.createMany({ data: input.items.map((i) => ({ reportId: report.id, projectId: i.projectId, taskId: i.taskId || null, notes: i.notes || null, hoursSpent: Math.round(i.hoursSpent * 100) / 100 })) });
      }
      if (report.status === "SUBMITTED") await syncReportTimeEntries(tx, report);
      return report;
    });
    revalidatePath("/daily-reports");
    return { id: saved.id, status: saved.status };
  });
}

export async function submitReportAction(fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const user = await actionUser();
    const reportId = parseId(fd.get("reportId"));
    if (!reportId) throw new AppError("Save the report first.");
    const { report } = await assertReport(user, reportId, "author");
    if (!["DRAFT", "CHANGES_REQUESTED"].includes(report.status)) throw new AppError("This report has already been submitted.");
    const items = await db.dailyReportItem.findMany({ where: { reportId } });
    if (!report.completedToday?.trim() && !report.inProgress?.trim() && !items.length) throw new AppError("Add what you worked on before submitting.");
    const projectIds = [...new Set(items.map((i) => i.projectId))];
    const scope = projectIds.length ? projectIds : (await db.projectMember.findMany({ where: { userId: user.id }, select: { projectId: true } })).map((m) => m.projectId);
    let reviewers = await reportReviewerIds(user.id, scope);
    if (!reviewers.length) reviewers = (await db.user.findMany({ where: { orgId: user.orgId, role: { in: ["ADMIN", "SUPER_ADMIN"] }, status: "ACTIVE", deletedAt: null, id: { not: user.id } }, select: { id: true } })).map((u) => u.id);
    const hours = items.reduce((a, i) => a + i.hoursSpent, 0);
    await db.$transaction(async (tx) => {
      const submitted = await tx.dailyReport.update({ where: { id: reportId }, data: { status: "SUBMITTED", submittedAt: new Date(), reviewComment: null, reviewedAt: null, reviewerId: null } });
      await syncReportTimeEntries(tx, submitted);
      await notify(tx, reviewers, { type: "DAILY_REPORT_SUBMITTED", title: `${user.name} submitted a daily report`, body: `${Math.round(hours * 10) / 10}h logged${report.mood === "NEED_HELP" ? " · asked for help" : ""}`, href: `/daily-reports/${reportId}` });
      if (report.blockers?.trim() || report.mood === "NEED_HELP") {
        await notify(tx, reviewers, { type: "BLOCKER_REPORTED", title: `${user.name} reported a blocker`, body: (report.blockers ?? "Marked “Need help”").slice(0, 160), href: `/daily-reports/${reportId}` });
      }
      for (const projectId of projectIds) await logActivity(tx, { actorId: user.id, projectId, action: "report_submitted", summary: `${user.name} submitted a daily report` });
    });
    revalidatePath("/daily-reports"); revalidatePath("/team-activity"); revalidatePath("/dashboard");
  }, "Daily report submitted.");
}

export async function reviewReportAction(fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const user = await actionUser();
    const input = reviewReportSchema.parse(formObject(fd));
    const { report } = await assertReport(user, input.reportId, "review");
    if (!canReviewStatus(report.status)) throw new AppError("Only submitted reports can be reviewed.");
    const problem = validateReviewDecision(input.decision, input.comment);
    if (problem) throw new AppError(problem);
    const comment = input.comment?.trim() || null;
    await db.$transaction(async (tx) => {
      await tx.dailyReport.update({ where: { id: report.id }, data: { status: input.decision, reviewerId: user.id, reviewedAt: new Date(), reviewComment: comment } });
      if (comment) await tx.taskComment.create({ data: { reportId: report.id, authorId: user.id, body: comment } });
      const label = input.decision === "APPROVED" ? "approved" : input.decision === "REJECTED" ? "rejected" : "requested changes on";
      await notify(tx, [report.authorId], { type: "REPORT_REVIEWED", title: `${user.name} ${label} your daily report`, body: comment ?? undefined, href: `/daily-reports/${report.id}` });
    });
    revalidatePath("/daily-reports"); revalidatePath(`/daily-reports/${report.id}`); revalidatePath("/team-activity");
  }, "Review saved.");
}
