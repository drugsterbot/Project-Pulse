import Link from "next/link";
import { Download } from "lucide-react";
import { db } from "@/lib/db";
import { finishedEntry, taskWhere } from "@/lib/access";
import { Card, CardBody, CardHeader, EmptyState, Stat } from "@/components/ui/primitives";
import { HealthBadge } from "@/components/ui/chips";
import { BarsChart, DonutChart } from "@/components/charts";
import { buttonClass } from "@/components/ui/button";
import { TASK_STATUS_LABEL, TASK_STATUS_TONE, type TaskStatus } from "@/lib/constants";
import { fmtShortDate, pct, sum, todayUTC } from "@/lib/utils";
import type { Ctx } from "./types";

const COLORS: Record<string, string> = { slate: "#94a3b8", blue: "#2563eb", green: "#16a34a", amber: "#d97706", red: "#dc2626", violet: "#7c3aed" };

export async function ReportsTab({ ctx }: { ctx: Ctx }) {
  const { user, id, level } = ctx;
  const client = level === "client";
  const [tasks, milestones, entries, evidence] = await Promise.all([
    db.task.findMany({ where: { AND: [taskWhere(user), { projectId: id }] }, select: { status: true, dueDate: true, estimatedHours: true, loggedHours: true, assignees: { select: { user: { select: { name: true } } } } } }),
    db.milestone.findMany({ where: { projectId: id, deletedAt: null }, orderBy: { dueDate: "asc" }, select: { id: true, name: true, health: true, progress: true, dueDate: true } }),
    client ? [] : db.timeEntry.groupBy({ by: ["userId"], where: { projectId: id, ...finishedEntry }, _sum: { hours: true } }),
    client ? [] : db.projectFile.findMany({ where: { projectId: id, deletedAt: null, archivedAt: null }, orderBy: { createdAt: "desc" }, take: 5, select: { id: true, name: true, createdAt: true, uploader: { select: { name: true } } } }),
  ]);
  const people = client ? [] : await db.user.findMany({ where: { id: { in: entries.map((e) => e.userId) } }, select: { id: true, name: true } });
  const today = todayUTC();
  const done = tasks.filter((t) => t.status === "COMPLETED").length;
  const overdue = tasks.filter((t) => t.status !== "COMPLETED" && t.dueDate && t.dueDate < today).length;
  const donut = (Object.keys(TASK_STATUS_LABEL) as TaskStatus[]).map((s) => ({ name: TASK_STATUS_LABEL[s], value: tasks.filter((t) => t.status === s).length, color: COLORS[TASK_STATUS_TONE[s]]! })).filter((d) => d.value);
  const names = [...new Set(tasks.flatMap((t) => t.assignees.map((a) => a.user.name)))];
  const perPerson = names.map((n) => ({ name: n.split(" ")[0]!, Completed: tasks.filter((t) => t.status === "COMPLETED" && t.assignees.some((a) => a.user.name === n)).length, Open: tasks.filter((t) => t.status !== "COMPLETED" && t.assignees.some((a) => a.user.name === n)).length }));
  const effort = names.map((n) => { const mine = tasks.filter((t) => t.assignees.some((a) => a.user.name === n)); return { name: n.split(" ")[0]!, Estimated: Math.round(sum(mine.map((t) => (t.estimatedHours ?? 0) / Math.max(t.assignees.length, 1)))), Logged: Math.round(sum(mine.map((t) => t.loggedHours / Math.max(t.assignees.length, 1)))) }; });
  const hours = entries.map((e) => ({ name: (people.find((p) => p.id === e.userId)?.name ?? "—").split(" ")[0]!, Hours: Math.round((e._sum.hours ?? 0) * 10) / 10 }));

  return (
    <div className="space-y-6">
      {!client && (
        <div className="flex flex-wrap justify-end gap-2">
          <a href={`/api/export/tasks?projectId=${id}`} className={buttonClass("secondary", "sm")}><Download className="size-3.5" aria-hidden />Tasks CSV</a>
          <a href={`/api/export/time?projectId=${id}`} className={buttonClass("secondary", "sm")}><Download className="size-3.5" aria-hidden />Time CSV</a>
          <a href={`/api/export/reports?projectId=${id}`} className={buttonClass("secondary", "sm")}><Download className="size-3.5" aria-hidden />Daily reports CSV</a>
          <Link href={`/reports?project=${id}`} className={buttonClass("subtle", "sm")}>Open full reports</Link>
        </div>
      )}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Completion" value={`${pct(done, tasks.length)}%`} hint={`${done} of ${tasks.length} tasks`} />
        <Stat label="Overdue tasks" value={overdue} tone={overdue ? "red" : undefined} />
        <Stat label="Milestones healthy" value={`${milestones.filter((m) => m.health === "HEALTHY").length}/${milestones.length}`} />
        {!client && <Stat label="Hours logged" value={`${Math.round(sum(entries.map((e) => e._sum.hours ?? 0)))}h`} />}
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card><CardHeader title="Task status distribution" /><CardBody>{donut.length ? <DonutChart data={donut} /> : <EmptyState title="No tasks" />}</CardBody></Card>
        <Card><CardHeader title="Milestone health" />
          {milestones.length ? <ul className="divide-y divide-line">{milestones.map((m) => <li key={m.id} className="flex items-center justify-between gap-3 px-5 py-3"><div><p className="text-sm font-medium">{m.name}</p><p className="text-xs text-slate-500">Due {fmtShortDate(m.dueDate)} · {m.progress}%</p></div><HealthBadge health={m.health} /></li>)}</ul> : <EmptyState title="No milestones" />}</Card>
        {!client && <Card><CardHeader title="Team contribution" description="Tasks per person" /><CardBody>{perPerson.length ? <BarsChart data={perPerson} xKey="name" stacked bars={[{ key: "Completed", label: "Completed", color: "#16a34a" }, { key: "Open", label: "Open", color: "#2563eb" }]} /> : <EmptyState title="No assignments yet" />}</CardBody></Card>}
        {!client && <Card><CardHeader title="Estimated vs logged hours" description="Per person, split across co-assignees" /><CardBody>{effort.length ? <BarsChart data={effort} xKey="name" unit="h" bars={[{ key: "Estimated", label: "Estimated", color: "#94a3b8" }, { key: "Logged", label: "Logged", color: "#2563eb" }]} /> : <EmptyState title="No estimates yet" />}</CardBody></Card>}
        {!client && <Card><CardHeader title="Time logged by person" /><CardBody>{hours.length ? <BarsChart data={hours} xKey="name" unit="h" bars={[{ key: "Hours", label: "Hours", color: "#0d9488" }]} /> : <EmptyState title="No time logged" />}</CardBody></Card>}
        {!client && <Card><CardHeader title="Recent evidence uploads" action={<Link href={`/projects/${id}?tab=files`} className="text-xs font-medium text-blue-700 hover:underline">All files</Link>} />
          {evidence.length ? <ul className="divide-y divide-line">{evidence.map((f) => <li key={f.id} className="px-5 py-3"><a href={`/api/files/${f.id}`} target="_blank" rel="noopener noreferrer" className="text-sm font-medium hover:underline">{f.name}</a><p className="text-xs text-slate-500">{f.uploader.name} · {fmtShortDate(f.createdAt)}</p></li>)}</ul> : <EmptyState title="No uploads yet" />}</Card>}
      </div>
    </div>
  );
}
