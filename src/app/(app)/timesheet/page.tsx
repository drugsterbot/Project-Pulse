import Link from "next/link";
import { Download, Trash2 } from "lucide-react";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { finishedEntry, runningEntry, taskWhere } from "@/lib/access";
import { flat, reviewScopeUserWhere, weekOf } from "@/lib/queries";
import { isManagementRole } from "@/lib/permissions";
import { Avatar, Card, CardBody, CardHeader, EmptyState, PageHeader, ProgressBar, Stat, Table, Td, Th } from "@/components/ui/primitives";
import { ActionButton } from "@/components/action-form";
import { TimeEntryForm, TimerStarter } from "@/components/time-forms";
import { TimerButton } from "@/components/task-panels";
import { BarsChart } from "@/components/charts";
import { Select } from "@/components/ui/form";
import { buttonClass } from "@/components/ui/button";
import { deleteTimeEntryAction } from "@/actions/time";
import { addDays, fmtDate, fmtHours, fmtShortDate, isoDate, sum, todayUTC } from "@/lib/utils";

export const metadata = { title: "Timesheet" };
export const dynamic = "force-dynamic";

export default async function TimesheetPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  if (user.role === "CLIENT_VIEWER") redirect("/unauthorized");
  const sp = flat(await searchParams);
  const week = weekOf(sp.week);
  const weekEnd = addDays(week, 7);
  const today = todayUTC();
  const mgmt = isManagementRole(user.role);
  const people = mgmt ? await db.user.findMany({ where: reviewScopeUserWhere(user), select: { id: true, name: true }, orderBy: { name: "asc" } }) : [];
  const viewingId = mgmt && sp.user && people.some((p) => p.id === sp.user) ? sp.user : user.id;
  const own = viewingId === user.id;
  const viewing = own ? { id: user.id, name: user.name, avatarUrl: user.avatarUrl, cap: user.weeklyCapacityHours } : await db.user.findUniqueOrThrow({ where: { id: viewingId }, select: { id: true, name: true, avatarUrl: true, weeklyCapacityHours: true } }).then((u) => ({ id: u.id, name: u.name, avatarUrl: u.avatarUrl, cap: u.weeklyCapacityHours }));

  const [entries, running, myTasks] = await Promise.all([
    db.timeEntry.findMany({ where: { userId: viewingId, ...finishedEntry, date: { gte: week, lt: weekEnd }, project: { orgId: user.orgId } }, orderBy: [{ date: "asc" }, { createdAt: "asc" }], include: { task: { select: { id: true, title: true, estimatedHours: true, loggedHours: true } }, project: { select: { code: true } } } }),
    own ? db.timeEntry.findFirst({ where: { userId: user.id, ...runningEntry }, include: { task: { select: { id: true, title: true } }, project: { select: { code: true } } } }) : null,
    own ? db.task.findMany({ where: { AND: [taskWhere(user), { status: { not: "COMPLETED" }, assignees: { some: { userId: user.id } } }] }, select: { id: true, title: true, project: { select: { code: true } } }, orderBy: { title: "asc" } }) : [],
  ]);
  const days = Array.from({ length: 7 }, (_, i) => addDays(week, i));
  const byTask = new Map<string, { task: (typeof entries)[number]["task"]; code: string; hours: number[] }>();
  for (const e of entries) {
    const row = byTask.get(e.taskId) ?? { task: e.task, code: e.project.code, hours: Array(7).fill(0) };
    row.hours[Math.round((e.date.getTime() - week.getTime()) / 86_400_000)] += e.hours; byTask.set(e.taskId, row);
  }
  const dayTotals = days.map((_, i) => sum([...byTask.values()].map((r) => r.hours[i]!)));
  const total = sum(dayTotals);
  const prev = isoDate(addDays(week, -7)), next = isoDate(addDays(week, 7));
  const link = (w: string) => `/timesheet?week=${w}${own ? "" : `&user=${viewingId}`}`;

  return (
    <>
      <PageHeader title={own ? "Timesheet" : `${viewing.name}’s timesheet`} description={`Week of ${fmtDate(week)}`}
        actions={<><Link href={link(prev)} className={buttonClass("secondary")}>← Previous</Link><Link href={link(isoDate(weekOf()))} className={buttonClass("secondary")}>This week</Link>{addDays(week, 7) <= today && <Link href={link(next)} className={buttonClass("secondary")}>Next →</Link>}
          <a href={`/api/export/time?from=${isoDate(week)}&to=${isoDate(addDays(week, 6))}${own ? "" : `&userId=${viewingId}`}`} className={buttonClass("secondary")}><Download className="size-4" aria-hidden />CSV</a></>} />
      {mgmt && people.length > 0 && <form className="mb-5 flex items-center gap-3"><input type="hidden" name="week" value={isoDate(week)} /><Select name="user" defaultValue={own ? "" : viewingId} aria-label="Person" className="w-56"><option value="">Me</option>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select><button className={buttonClass("secondary")}>View</button></form>}

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Logged this week" value={fmtHours(total)} hint={`of ${viewing.cap}h capacity`} />
        <Stat label="Today" value={fmtHours(dayTotals[Math.round((today.getTime() - week.getTime()) / 86_400_000)] ?? 0)} />
        <Stat label="Entries" value={entries.length} />
        <Card className="px-4 py-3.5"><p className="text-xs font-medium text-slate-500">Capacity used</p><p className="mt-1 text-2xl font-semibold">{Math.round((total / viewing.cap) * 100)}%</p><ProgressBar value={(total / viewing.cap) * 100} tone={total > viewing.cap ? "red" : "blue"} className="mt-2" /></Card>
      </div>

      {own && (
        <div className="mb-6 grid gap-6 lg:grid-cols-2">
          <Card><CardHeader title="Timer" description="Track time as you work. Starting a new timer stops the running one." />
            <CardBody className="space-y-4">
              {running && <div className="rounded-lg border border-blue-200 bg-blue-50 p-4"><p className="text-sm font-medium">{running.project.code} · {running.task.title}</p><div className="mt-2"><TimerButton taskId={running.taskId} running={{ id: running.id, startedAt: running.startedAt!.toISOString() }} /></div></div>}
              <TimerStarter tasks={myTasks.map((t) => ({ id: t.id, label: `${t.project.code} · ${t.title}` }))} />
            </CardBody></Card>
          <Card><CardHeader title="Log time manually" /><CardBody><TimeEntryForm today={isoDate(today)} tasks={myTasks.map((t) => ({ id: t.id, label: `${t.project.code} · ${t.title}` }))} /></CardBody></Card>
        </div>
      )}

      <Card className="mb-6">
        <CardHeader title="Week at a glance" description="Hours by task and day" action={<Avatar name={viewing.name} src={viewing.avatarUrl} size={26} />} />
        {byTask.size === 0 ? <EmptyState title="No time logged this week" description={own ? "Start a timer or log time manually to see it here." : undefined} /> : (
          <Table>
            <thead><tr><Th>Task</Th>{days.map((d) => <Th key={d.toISOString()} className="text-center">{new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: "UTC" }).format(d)}<br /><span className="font-normal">{fmtShortDate(d)}</span></Th>)}<Th className="text-right">Total</Th><Th className="text-right">Est. vs actual</Th></tr></thead>
            <tbody>
              {[...byTask.entries()].map(([id, r]) => (
                <tr key={id}><Td className="max-w-xs"><Link href={`/tasks/${id}`} className="font-medium hover:underline">{r.task.title}</Link><div className="text-xs text-slate-500">{r.code}</div></Td>
                  {r.hours.map((h, i) => <Td key={i} className="text-center text-slate-700">{h ? fmtHours(h) : <span className="text-slate-300">·</span>}</Td>)}
                  <Td className="text-right font-medium">{fmtHours(sum(r.hours))}</Td>
                  <Td className={`text-right ${r.task.estimatedHours && r.task.loggedHours > r.task.estimatedHours ? "font-medium text-amber-700" : "text-slate-600"}`}>{fmtHours(r.task.loggedHours)} / {r.task.estimatedHours != null ? fmtHours(r.task.estimatedHours) : "—"}</Td></tr>
              ))}
              <tr className="bg-slate-50/70 font-medium"><Td>Daily total</Td>{dayTotals.map((h, i) => <Td key={i} className="text-center">{h ? fmtHours(h) : "·"}</Td>)}<Td className="text-right">{fmtHours(total)}</Td><Td />{/* spacer */}</tr>
            </tbody>
          </Table>
        )}
      </Card>

      {byTask.size > 0 && <Card className="mb-6"><CardHeader title="Daily hours" /><CardBody><BarsChart unit="h" xKey="day" data={days.map((d, i) => ({ day: new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: "UTC" }).format(d), Hours: Math.round(dayTotals[i]! * 10) / 10 }))} bars={[{ key: "Hours", label: "Hours", color: "#2563eb" }]} height={200} /></CardBody></Card>}

      <Card>
        <CardHeader title="Entries" />
        {entries.length === 0 ? <p className="px-5 py-6 text-sm text-slate-500">No entries this week.</p> : (
          <Table>
            <thead><tr><Th>Date</Th><Th>Task</Th><Th>Hours</Th><Th>Source</Th><Th>Note</Th>{own && <Th className="text-right">Actions</Th>}</tr></thead>
            <tbody>{entries.map((e) => (
              <tr key={e.id}><Td className="whitespace-nowrap">{fmtDate(e.date)}</Td><Td className="max-w-xs truncate"><span className="text-xs font-medium text-slate-500">{e.project.code}</span> {e.task.title}</Td><Td>{fmtHours(e.hours)}</Td>
                <Td className="text-slate-600">{e.reportId ? "Daily report" : e.startedAt ? "Timer" : "Manual"}</Td><Td className="max-w-xs truncate text-slate-600">{e.note ?? "—"}</Td>
                {own && <Td className="text-right">{!e.reportId && <ActionButton action={deleteTimeEntryAction.bind(null, e.id)} variant="ghost" aria-label="Delete entry" confirm={{ title: "Delete this time entry?", description: `${fmtHours(e.hours)} on “${e.task.title}” will be removed.`, confirmLabel: "Delete" }}><Trash2 className="size-4 text-red-600" /></ActionButton>}</Td>}</tr>
            ))}</tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
