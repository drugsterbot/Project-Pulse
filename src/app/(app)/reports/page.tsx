import Link from "next/link";
import { Download } from "lucide-react";
import { db, type Prisma } from "@/lib/db";
import { requireManagement } from "@/lib/auth";
import { finishedEntry, projectWhere, taskWhere } from "@/lib/access";
import { flat, getWorkload, qs, reviewScopeUserWhere, weekOf } from "@/lib/queries";
import { isOverdue } from "@/lib/business";
import { PRIORITY_LABEL, TASK_STATUS_LABEL, TASK_STATUS_TONE, type TaskStatus } from "@/lib/constants";
import { Avatar, Badge, Card, CardBody, CardHeader, EmptyState, PageHeader, Stat, Table, Td, Th } from "@/components/ui/primitives";
import { HealthBadge, PriorityBadge, TaskStatusBadge } from "@/components/ui/chips";
import { BarsChart, DonutChart, TrendChart } from "@/components/charts";
import { Input, Select } from "@/components/ui/form";
import { buttonClass } from "@/components/ui/button";
import { addDays, fmtDate, fmtShortDate, isoDate, isWorkday, parseDateOnly, pct, sum, timeAgo, todayUTC } from "@/lib/utils";

export const metadata = { title: "Reports" };
export const dynamic = "force-dynamic";
const COLORS: Record<string, string> = { slate: "#94a3b8", blue: "#2563eb", green: "#16a34a", amber: "#d97706", red: "#dc2626", violet: "#7c3aed" };
const round1 = (n: number) => Math.round(n * 10) / 10;

export default async function ReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireManagement();
  const sp = flat(await searchParams);
  const today = todayUTC();
  const from = parseDateOnly(/^\d{4}-\d{2}-\d{2}$/.test(sp.from ?? "") ? sp.from! : isoDate(addDays(today, -29)));
  const to = parseDateOnly(/^\d{4}-\d{2}-\d{2}$/.test(sp.to ?? "") ? sp.to! : isoDate(today));
  const toEnd = addDays(to, 1);

  const [projects, people, depts] = await Promise.all([
    db.project.findMany({ where: { AND: [projectWhere(user), { archivedAt: null }] }, select: { id: true, code: true, name: true }, orderBy: { code: "asc" } }),
    db.user.findMany({ where: reviewScopeUserWhere(user), select: { id: true, name: true, departmentId: true, avatarUrl: true, weeklyCapacityHours: true }, orderBy: { name: "asc" } }),
    db.department.findMany({ where: { orgId: user.orgId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const deptUserIds = sp.department ? people.filter((p) => p.departmentId === sp.department).map((p) => p.id) : null;
  const personFilter = sp.person ? [sp.person] : deptUserIds;

  const taskFilter: Prisma.TaskWhereInput = {
    ...(sp.project ? { projectId: sp.project } : {}), ...(sp.status ? { status: sp.status as "COMPLETED" } : {}),
    ...(personFilter ? { assignees: { some: { userId: { in: personFilter } } } } : {}),
  };
  const [tasks, entries, reports, files, milestones] = await Promise.all([
    db.task.findMany({ where: { AND: [taskWhere(user), taskFilter] }, include: { project: { select: { id: true, code: true } }, assignees: { include: { user: { select: { id: true, name: true } } } }, milestone: { select: { name: true } } } }),
    db.timeEntry.findMany({ where: { ...finishedEntry, project: { AND: [projectWhere(user)] }, date: { gte: from, lt: toEnd }, ...(sp.project ? { projectId: sp.project } : {}), ...(personFilter ? { userId: { in: personFilter } } : {}) }, select: { hours: true, date: true, user: { select: { id: true, name: true } }, project: { select: { id: true, code: true } } } }),
    db.dailyReport.findMany({ where: { reportDate: { gte: from, lt: toEnd }, status: { not: "DRAFT" }, author: { AND: [reviewScopeUserWhere(user), personFilter ? { id: { in: personFilter } } : {}] }, ...(sp.project ? { items: { some: { projectId: sp.project } } } : {}) }, select: { reportDate: true, authorId: true } }),
    db.projectFile.findMany({ where: { deletedAt: null, project: { AND: [projectWhere(user)] }, createdAt: { gte: from, lt: toEnd }, ...(sp.project ? { projectId: sp.project } : {}), ...(sp.person ? { uploaderId: sp.person } : {}) }, orderBy: { createdAt: "desc" }, take: 8, include: { uploader: { select: { name: true } }, project: { select: { code: true } } } }),
    db.milestone.findMany({ where: { deletedAt: null, project: { AND: [projectWhere(user), { archivedAt: null }] }, ...(sp.project ? { projectId: sp.project } : {}) }, include: { project: { select: { code: true } } }, orderBy: { dueDate: "asc" } }),
  ]);
  const workload = await getWorkload(user, weekOf(), { projectId: sp.project });

  const now = new Date();
  const statusData = (Object.keys(TASK_STATUS_LABEL) as TaskStatus[]).map((s) => ({ name: TASK_STATUS_LABEL[s], value: tasks.filter((t) => t.status === s).length, color: COLORS[TASK_STATUS_TONE[s]]! })).filter((d) => d.value);
  const projectProgress = projects.filter((p) => !sp.project || p.id === sp.project).map((p) => { const t = tasks.filter((x) => x.projectId === p.id); return { name: p.code, Complete: pct(t.filter((x) => x.status === "COMPLETED").length, t.length), Tasks: t.length }; }).filter((p) => p.Tasks > 0);
  const overdue = tasks.filter((t) => isOverdue(t, now)).sort((a, b) => a.dueDate!.getTime() - b.dueDate!.getTime());
  const blocked = tasks.filter((t) => t.status === "BLOCKED");
  const contribution = people.filter((p) => !personFilter || personFilter.includes(p.id)).map((p) => ({
    name: p.name.split(" ")[0]!, Completed: tasks.filter((t) => t.status === "COMPLETED" && t.completedAt && t.completedAt >= from && t.completedAt < toEnd && t.assignees.some((a) => a.userId === p.id)).length,
    Hours: round1(sum(entries.filter((e) => e.user.id === p.id).map((e) => e.hours))),
  })).filter((c) => c.Completed || c.Hours);
  const hoursByProject = [...entries.reduce((m, e) => m.set(e.project.code, (m.get(e.project.code) ?? 0) + e.hours), new Map<string, number>())].map(([name, Hours]) => ({ name, Hours: round1(Hours) }));
  const effort = projects.filter((p) => !sp.project || p.id === sp.project).map((p) => { const t = tasks.filter((x) => x.projectId === p.id); return { name: p.code, Estimated: Math.round(sum(t.map((x) => x.estimatedHours ?? 0))), Actual: round1(sum(t.map((x) => x.loggedHours))) }; }).filter((e) => e.Estimated || e.Actual);
  const days: Date[] = []; for (let d = from; d <= to; d = addDays(d, 1)) if (isWorkday(d)) days.push(d);
  const compliance = days.map((d) => ({ day: fmtShortDate(d), Submitted: reports.filter((r) => isoDate(r.reportDate) === isoDate(d)).length, Expected: people.filter((p) => !personFilter || personFilter.includes(p.id)).length }));
  const expectedTotal = sum(compliance.map((c) => c.Expected));
  const rate = pct(sum(compliance.map((c) => c.Submitted)), expectedTotal);
  const health = { HEALTHY: milestones.filter((m) => m.health === "HEALTHY").length, AT_RISK: milestones.filter((m) => m.health === "AT_RISK").length, DELAYED: milestones.filter((m) => m.health === "DELAYED").length };
  const exportQs = qs({ projectId: sp.project, userId: sp.person, status: sp.status, from: isoDate(from), to: isoDate(to) }, {});
  const filtered = !!(sp.project || sp.person || sp.status || sp.department || sp.from || sp.to);

  return (
    <>
      <PageHeader title="Reports & analytics" description={`Time, reports and evidence from ${fmtDate(from)} to ${fmtDate(to)}. Task charts show the current state.`}
        actions={<>{[["tasks", "Tasks"], ["time", "Time"], ["reports", "Daily reports"]].map(([t, l]) => <a key={t} href={`/api/export/${t}${exportQs}`} className={buttonClass("secondary")}><Download className="size-4" aria-hidden />{l} CSV</a>)}</>} />
      <Card className="mb-6">
        <form className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8" role="search" aria-label="Filter reports">
          <Select name="project" defaultValue={sp.project ?? ""} aria-label="Project"><option value="">All projects</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.code}</option>)}</Select>
          <Select name="person" defaultValue={sp.person ?? ""} aria-label="Team member"><option value="">Everyone</option>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>
          <Select name="department" defaultValue={sp.department ?? ""} aria-label="Department"><option value="">All departments</option>{depts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select>
          <Select name="status" defaultValue={sp.status ?? ""} aria-label="Task status"><option value="">Any task status</option>{Object.entries(TASK_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
          <Input name="from" type="date" defaultValue={isoDate(from)} aria-label="From" /><Input name="to" type="date" defaultValue={isoDate(to)} aria-label="To" />
          <button className={buttonClass("secondary")}>Apply</button>{filtered && <Link href="/reports" className={buttonClass("ghost")}>Reset</Link>}
        </form>
      </Card>
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Stat label="Tasks" value={tasks.length} /><Stat label="Completed" value={tasks.filter((t) => t.status === "COMPLETED").length} tone="green" /><Stat label="Overdue" value={overdue.length} tone={overdue.length ? "red" : undefined} />
        <Stat label="Hours logged" value={`${round1(sum(entries.map((e) => e.hours)))}h`} /><Stat label="Report compliance" value={`${rate}%`} tone={rate < 80 ? "amber" : "green"} />
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <Card><CardHeader title="Project completion" description="Share of tasks completed" /><CardBody>{projectProgress.length ? <BarsChart unit="%" xKey="name" data={projectProgress} bars={[{ key: "Complete", label: "% complete", color: "#2563eb" }]} /> : <EmptyState title="No tasks to chart" />}</CardBody></Card>
        <Card><CardHeader title="Task status distribution" /><CardBody>{statusData.length ? <DonutChart data={statusData} /> : <EmptyState title="No tasks to chart" />}</CardBody></Card>
        <Card><CardHeader title="Team contribution" description="Tasks completed and hours logged in the date range" /><CardBody>{contribution.length ? <BarsChart xKey="name" data={contribution} bars={[{ key: "Completed", label: "Tasks completed", color: "#16a34a" }, { key: "Hours", label: "Hours", color: "#2563eb" }]} /> : <EmptyState title="No activity in this range" />}</CardBody></Card>
        <Card><CardHeader title="Time logged by project" /><CardBody>{hoursByProject.length ? <BarsChart unit="h" xKey="name" data={hoursByProject} bars={[{ key: "Hours", label: "Hours", color: "#2563eb" }]} /> : <EmptyState title="No time logged in this range" />}</CardBody></Card>
        <Card><CardHeader title="Estimated vs actual effort" description="Hours, all tasks in each project" /><CardBody>{effort.length ? <BarsChart unit="h" xKey="name" data={effort} bars={[{ key: "Estimated", label: "Estimated", color: "#cbd5e1" }, { key: "Actual", label: "Actual", color: "#2563eb" }]} /> : <EmptyState title="No effort data" />}</CardBody></Card>
        <Card><CardHeader title="Workload and capacity" description="This week, hours" action={<Link href="/workload" className="text-xs font-medium text-blue-700 hover:underline">Details</Link>} /><CardBody>{workload.length ? <BarsChart unit="h" xKey="name" data={workload.map((w) => ({ name: w.name.split(" ")[0]!, Planned: w.planned, Capacity: w.weeklyCapacityHours }))} bars={[{ key: "Planned", label: "Planned", color: "#2563eb" }, { key: "Capacity", label: "Capacity", color: "#cbd5e1" }]} /> : <EmptyState title="No one in scope" />}</CardBody></Card>
        <Card className="xl:col-span-2"><CardHeader title="Daily report compliance" description={`${rate}% of expected reports submitted on workdays`} /><CardBody>{compliance.length ? <TrendChart xKey="day" data={compliance} lines={[{ key: "Submitted", label: "Submitted", color: "#2563eb" }, { key: "Expected", label: "Expected", color: "#cbd5e1" }]} /> : <EmptyState title="No workdays in this range" />}</CardBody></Card>
        <Card><CardHeader title="Milestone health" description={`${health.HEALTHY} healthy · ${health.AT_RISK} at risk · ${health.DELAYED} delayed`} />
          {milestones.length ? <Table><thead><tr><Th>Milestone</Th><Th>Due</Th><Th>Progress</Th><Th>Health</Th></tr></thead><tbody>{milestones.filter((m) => m.status !== "COMPLETED").slice(0, 8).map((m) => <tr key={m.id}><Td><span className="text-xs font-medium text-slate-500">{m.project.code}</span> {m.name}</Td><Td className="whitespace-nowrap">{fmtShortDate(m.dueDate)}</Td><Td>{m.progress}%</Td><Td><HealthBadge health={m.health} /></Td></tr>)}</tbody></Table> : <EmptyState title="No milestones" />}</Card>
        <Card><CardHeader title="Recent evidence uploads" />
          {files.length ? <ul className="divide-y divide-line">{files.map((f) => <li key={f.id} className="flex items-center justify-between gap-3 px-5 py-3"><div className="min-w-0"><a href={f.externalUrl ?? `/api/files/${f.id}`} target="_blank" rel="noopener noreferrer" className="block truncate text-sm font-medium hover:underline">{f.name}</a><p className="text-xs text-slate-500">{f.project.code} · {f.uploader.name} · {timeAgo(f.createdAt)}</p></div><Badge>{f.kind.replace("_LINK", "").toLowerCase()}</Badge></li>)}</ul> : <EmptyState title="No uploads in this range" />}</Card>
        <Card className="xl:col-span-2"><CardHeader title="Overdue tasks" description={`${overdue.length} open tasks past their due date`} />
          {overdue.length ? <Table><thead><tr><Th>Task</Th><Th>Project</Th><Th>Assignees</Th><Th>Priority</Th><Th>Due</Th><Th>Days late</Th></tr></thead><tbody>{overdue.slice(0, 10).map((t) => <tr key={t.id}><Td><Link href={`/tasks/${t.id}`} className="font-medium hover:underline">{t.title}</Link></Td><Td>{t.project.code}</Td><Td className="text-slate-600">{t.assignees.map((a) => a.user.name).join(", ") || "—"}</Td><Td><PriorityBadge priority={t.priority} /></Td><Td>{fmtShortDate(t.dueDate)}</Td><Td className="font-medium text-red-600">{Math.ceil((now.getTime() - t.dueDate!.getTime()) / 86_400_000)}</Td></tr>)}</tbody></Table> : <EmptyState title="Nothing overdue" description="Every open task is on or ahead of its due date." />}</Card>
        <Card className="xl:col-span-2"><CardHeader title="Blocked tasks" description={`${blocked.length} blocked right now`} />
          {blocked.length ? <Table><thead><tr><Th>Task</Th><Th>Project</Th><Th>Assignees</Th><Th>Blocker</Th><Th>Status</Th></tr></thead><tbody>{blocked.map((t) => <tr key={t.id}><Td><Link href={`/tasks/${t.id}`} className="font-medium hover:underline">{t.title}</Link></Td><Td>{t.project.code}</Td><Td className="text-slate-600">{t.assignees.map((a) => a.user.name).join(", ") || "—"}</Td><Td className="max-w-sm text-red-700">{t.blockerReason ?? "No reason recorded"}</Td><Td><TaskStatusBadge status={t.status} /></Td></tr>)}</tbody></Table> : <EmptyState title="No blocked tasks" />}</Card>
      </div>
    </>
  );
}
void Avatar; void PRIORITY_LABEL;
