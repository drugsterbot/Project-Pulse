import Link from "next/link";
import { FileText, Sparkles } from "lucide-react";
import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/auth";
import { finishedEntry, taskWhere } from "@/lib/access";
import { taskCardInclude } from "@/lib/queries";
import { recommendPrioritiesForUser } from "@/lib/ai/deterministic";
import { isOverdue } from "@/lib/business";
import { Card, CardHeader, PageHeader, PulseStrip, Stat } from "@/components/ui/primitives";
import { buttonClass } from "@/components/ui/button";
import { ReportStatusBadge } from "@/components/ui/chips";
import { InsightCard, TaskList } from "@/components/views";
import { addDays, fmtHours, isoDate, isWorkday, pct, startOfWeek, sum, timeAgo, todayUTC } from "@/lib/utils";
import { renderMentions } from "@/lib/business";

export async function MemberDashboard({ user }: { user: SessionUser }) {
  const today = todayUTC();
  const week = startOfWeek(today);
  const days: Date[] = [];
  for (let i = 0; days.length < 14; i++) { const d = addDays(today, -i); if (isWorkday(d)) days.unshift(d); }

  const [tasks, weekEntries, reports, notifications, priorities] = await Promise.all([
    db.task.findMany({ where: { AND: [taskWhere(user), { assignees: { some: { userId: user.id } } }] }, include: taskCardInclude, orderBy: { updatedAt: "desc" } }),
    db.timeEntry.findMany({ where: { userId: user.id, ...finishedEntry, date: { gte: week, lt: addDays(week, 7) } }, select: { hours: true } }),
    db.dailyReport.findMany({ where: { authorId: user.id, reportDate: { gte: days[0], lte: today } }, select: { reportDate: true, status: true, id: true, items: { select: { hoursSpent: true } } } }),
    db.notification.findMany({ where: { userId: user.id, readAt: null }, orderBy: { createdAt: "desc" }, take: 5 }),
    recommendPrioritiesForUser(user.id, 3),
  ]);

  const open = tasks.filter((t) => t.status !== "COMPLETED");
  const dueToday = open.filter((t) => t.dueDate && isoDate(t.dueDate) === isoDate(today));
  const overdue = open.filter((t) => isOverdue(t, new Date())).sort((a, b) => a.dueDate!.getTime() - b.dueDate!.getTime());
  const upcoming = open.filter((t) => t.dueDate && t.dueDate > today && t.dueDate <= addDays(today, 7)).sort((a, b) => a.dueDate!.getTime() - b.dueDate!.getTime());
  const completionRate = pct(tasks.filter((t) => t.status === "COMPLETED").length, tasks.length);
  const hoursWeek = sum(weekEntries.map((e) => e.hours));
  const todayReport = reports.find((r) => isoDate(r.reportDate) === isoDate(today));
  const reportDone = todayReport && todayReport.status !== "DRAFT";
  const hour = new Date().getHours();
  const pulse = days.map((d) => {
    const r = reports.find((x) => isoDate(x.reportDate) === isoDate(d));
    const h = r ? sum(r.items.map((i) => i.hoursSpent)) : 0;
    return { label: isoDate(d), value: Math.min(1, h / 8), tone: !r ? ("none" as const) : r.status === "DRAFT" ? ("late" as const) : ("ok" as const), title: !r ? "no report" : `${r.status.toLowerCase().replace(/_/g, " ")}, ${fmtHours(h)}` };
  });

  return (
    <>
      <PageHeader
        title={`${hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening"}, ${user.name.split(" ")[0]}`}
        description={new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date())}
        actions={<Link href="/daily-reports/new" className={buttonClass(reportDone ? "secondary" : "primary")}><FileText className="size-4" aria-hidden />{reportDone ? "View today’s update" : todayReport ? "Finish daily update" : "Submit daily update"}</Link>}
      />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Due today" value={dueToday.length} href="/tasks?due=today" />
        <Stat label="Overdue" value={overdue.length} tone={overdue.length ? "red" : undefined} href="/tasks?due=overdue" />
        <Stat label="Completion rate" value={`${completionRate}%`} hint={`${tasks.filter((t) => t.status === "COMPLETED").length} of ${tasks.length} tasks`} />
        <Stat label="Hours this week" value={fmtHours(hoursWeek)} hint={`of ${user.weeklyCapacityHours}h capacity`} href="/timesheet" />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {overdue.length > 0 && <Card><CardHeader title="Overdue" description="Update these or move the due date with your manager." /><TaskList tasks={overdue} empty="" /></Card>}
          <Card><CardHeader title="Due today" /><TaskList tasks={dueToday} empty="Nothing due today." /></Card>
          <Card><CardHeader title="Upcoming this week" action={<Link href="/tasks" className="text-xs font-medium text-blue-700 hover:underline">All my tasks</Link>} /><TaskList tasks={upcoming} empty="No deadlines in the next 7 days." /></Card>
          <Card><CardHeader title="Recently updated" /><TaskList tasks={tasks.slice(0, 5)} empty="No tasks assigned yet." /></Card>
        </div>
        <div className="space-y-6">
          <Card>
            <CardHeader title="Daily update" description="Last 14 workdays" action={todayReport ? <ReportStatusBadge status={todayReport.status} /> : undefined} />
            <div className="p-5">
              <PulseStrip days={pulse} />
              <p className="mt-3 text-xs text-slate-500">{reportDone ? "Today’s update is in. Nice." : todayReport ? "Your draft is saved. Submit it before you finish for the day." : "You haven’t started today’s update yet."}</p>
            </div>
          </Card>
          <Card>
            <CardHeader title="Suggested focus" description="Ranked by priority, deadline and what waits on you" action={<Sparkles className="size-4 text-blue-600" aria-hidden />} />
            <div className="p-4">{priorities.length ? <ul className="space-y-3">{priorities.map((p) => <InsightCard key={p.id} insight={p} />)}</ul> : <p className="px-1 py-2 text-sm text-slate-500">Nothing urgent. Pick the task you want to move forward.</p>}</div>
          </Card>
          <Card>
            <CardHeader title="Unread notifications" action={<Link href="/notifications" className="text-xs font-medium text-blue-700 hover:underline">View all</Link>} />
            {notifications.length ? <ul className="divide-y divide-line">{notifications.map((n) => (
              <li key={n.id}><Link href={n.href ?? "/notifications"} className="block px-5 py-3 hover:bg-slate-50"><p className="text-sm font-medium">{n.title}</p>{n.body && <p className="truncate text-xs text-slate-500">{renderMentions(n.body)}</p>}<p className="mt-0.5 text-xs text-slate-400">{timeAgo(n.createdAt)}</p></Link></li>
            ))}</ul> : <p className="px-5 py-6 text-sm text-slate-500">You’re all caught up.</p>}
          </Card>
        </div>
      </div>
    </>
  );
}
