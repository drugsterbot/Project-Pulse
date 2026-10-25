import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db, type Prisma } from "@/lib/db";
import { finishedEntry, projectWhere, taskWhere } from "@/lib/access";
import { toCsv } from "@/lib/csv";
import { isManagementRole } from "@/lib/permissions";
import { isoDate } from "@/lib/utils";

export const runtime = "nodejs";
const LIMIT = 10_000;

/** CSV export of tasks, time entries or daily reports, scoped to what the signed-in user may see. */
export async function GET(req: Request, ctx: { params: Promise<{ type: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (user.role === "CLIENT_VIEWER") return NextResponse.json({ error: "Exports are not available for client accounts." }, { status: 403 });
  const { type } = await ctx.params;
  const sp = new URL(req.url).searchParams;
  const projectId = sp.get("projectId") || undefined, userId = sp.get("userId") || undefined, status = sp.get("status") || undefined;
  const from = sp.get("from") || undefined, to = sp.get("to") || undefined;
  const dateRange = (from || to) ? { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(`${to}T23:59:59.999Z`) } : {}) } : undefined;
  const mgmt = isManagementRole(user.role);
  let csv: string;

  if (type === "tasks") {
    const tasks = await db.task.findMany({
      where: { AND: [taskWhere(user), { ...(projectId ? { projectId } : {}), ...(status ? { status: status as "COMPLETED" } : {}), ...(userId ? { assignees: { some: { userId } } } : {}), ...(dateRange ? { dueDate: dateRange } : {}) }] },
      include: { project: { select: { code: true, name: true } }, milestone: { select: { name: true } }, assignees: { include: { user: { select: { name: true } } } } }, orderBy: { createdAt: "desc" }, take: LIMIT,
    });
    csv = toCsv(tasks.map((t) => ({
      Project: t.project.code, Title: t.title, Milestone: t.milestone?.name ?? "", Status: t.status, Priority: t.priority, Assignees: t.assignees.map((a) => a.user.name).join("; "),
      Start: t.startDate ? isoDate(t.startDate) : "", Due: t.dueDate ? isoDate(t.dueDate) : "", "Estimated hours": t.estimatedHours ?? "", "Logged hours": t.loggedHours, "Progress %": t.progress, Labels: t.labels.join("; "), "Blocker reason": t.blockerReason ?? "",
    })));
  } else if (type === "time") {
    const where: Prisma.TimeEntryWhereInput = {
      ...finishedEntry, project: { AND: [projectWhere(user)] }, ...(mgmt ? (userId ? { userId } : {}) : { userId: user.id }), ...(projectId ? { projectId } : {}), ...(dateRange ? { date: dateRange } : {}),
    };
    const rows = await db.timeEntry.findMany({ where, include: { user: { select: { name: true } }, task: { select: { title: true } }, project: { select: { code: true } } }, orderBy: { date: "desc" }, take: LIMIT });
    csv = toCsv(rows.map((e) => ({ Date: isoDate(e.date), Person: e.user.name, Project: e.project.code, Task: e.task.title, Hours: e.hours, Note: e.note ?? "", Source: e.reportId ? "Daily report" : e.startedAt ? "Timer" : "Manual" })));
  } else if (type === "reports") {
    const scope: Prisma.DailyReportWhereInput = mgmt
      ? (user.role === "SUPER_ADMIN" || user.role === "ADMIN" ? { author: { orgId: user.orgId } } : { author: { orgId: user.orgId, OR: [{ id: user.id }, { projectMemberships: { some: { project: projectWhere(user) } } }] } })
      : { authorId: user.id };
    const rows = await db.dailyReport.findMany({
      where: { AND: [scope, { ...(userId && mgmt ? { authorId: userId } : {}), ...(status ? { status: status as "SUBMITTED" } : {}), ...(projectId ? { items: { some: { projectId } } } : {}), ...(dateRange ? { reportDate: dateRange } : {}) }] },
      include: { author: { select: { name: true } }, items: { select: { hoursSpent: true, project: { select: { code: true } } } }, reviewer: { select: { name: true } } }, orderBy: { reportDate: "desc" }, take: LIMIT,
    });
    csv = toCsv(rows.map((r) => ({
      Date: isoDate(r.reportDate), Person: r.author.name, Status: r.status, Mood: r.mood, Projects: [...new Set(r.items.map((i) => i.project.code))].join("; "), Hours: r.items.reduce((a, i) => a + i.hoursSpent, 0),
      Completed: r.completedToday ?? "", "In progress": r.inProgress ?? "", "Plan for tomorrow": r.planTomorrow ?? "", Blockers: r.blockers ?? "", Reviewer: r.reviewer?.name ?? "", "Review comment": r.reviewComment ?? "",
    })));
  } else return NextResponse.json({ error: "Unknown export type. Use tasks, time or reports." }, { status: 404 });

  return new NextResponse(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="projectpulse-${type}-${isoDate(new Date())}.csv"`, "Cache-Control": "no-store" } });
}
