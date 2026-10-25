import Link from "next/link";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { getInsightsService } from "@/lib/ai";
import { Avatar, Badge, Card, CardBody, CardHeader, EmptyState, ProgressBar, Stat } from "@/components/ui/primitives";
import { HealthBadge } from "@/components/ui/chips";
import { DonutChart } from "@/components/charts";
import { AnnouncementModal } from "@/components/project-forms";
import { ActionButton } from "@/components/action-form";
import { deleteAnnouncementAction } from "@/actions/projects";
import { TASK_STATUS_LABEL, TASK_STATUS_TONE, SEVERITY_LABEL, type TaskStatus } from "@/lib/constants";
import { fmtDate, fmtHours, fmtShortDate, timeAgo, todayUTC } from "@/lib/utils";
import type { Ctx } from "./types";

const COLORS: Record<string, string> = { slate: "#94a3b8", blue: "#2563eb", green: "#16a34a", amber: "#d97706", red: "#dc2626", violet: "#7c3aed", teal: "#0d9488" };

export async function OverviewTab({ ctx }: { ctx: Ctx }) {
  const { project, level, id } = ctx;
  const client = level === "client";
  const today = todayUTC();
  const [counts, agg, overdue, milestones, announcements, risks, members] = await Promise.all([
    db.task.groupBy({ by: ["status"], where: { projectId: id, deletedAt: null }, _count: true }),
    db.task.aggregate({ where: { projectId: id, deletedAt: null }, _avg: { progress: true }, _sum: { loggedHours: true, estimatedHours: true } }),
    db.task.count({ where: { projectId: id, deletedAt: null, status: { not: "COMPLETED" }, dueDate: { lt: today } } }),
    db.milestone.findMany({ where: { projectId: id, deletedAt: null, status: { not: "COMPLETED" } }, orderBy: { dueDate: "asc" }, take: 4 }),
    client ? [] : db.announcement.findMany({ where: { projectId: id, deletedAt: null }, orderBy: [{ pinned: "desc" }, { createdAt: "desc" }], take: 3, include: { author: { select: { name: true } } } }),
    client ? [] : db.risk.findMany({ where: { projectId: id, deletedAt: null, status: { in: ["OPEN", "MITIGATING"] } }, orderBy: { severity: "desc" }, take: 3, include: { owner: { select: { name: true } } } }),
    db.projectMember.findMany({ where: { projectId: id, isClientAccess: false }, include: { user: { select: { id: true, name: true, avatarUrl: true } } } }),
  ]);
  const total = counts.reduce((a, c) => a + c._count, 0);
  const summary = can(level, "review") ? await getInsightsService().generateProjectSummary(id) : null;
  const donut = (Object.keys(TASK_STATUS_LABEL) as TaskStatus[]).map((s) => ({ name: TASK_STATUS_LABEL[s], value: counts.find((c) => c.status === s)?._count ?? 0, color: COLORS[TASK_STATUS_TONE[s]]! })).filter((d) => d.value > 0);

  return (
    <div className="grid gap-6 xl:grid-cols-3">
      <div className="space-y-6 xl:col-span-2">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Stat label="Average progress" value={`${Math.round(agg._avg.progress ?? 0)}%`} hint={`${total} tasks`} />
          <Stat label="Open tasks" value={total - (counts.find((c) => c.status === "COMPLETED")?._count ?? 0)} />
          <Stat label="Overdue" value={overdue} tone={overdue ? "red" : undefined} />
          {client ? <Stat label="Milestones left" value={milestones.length} /> : <Stat label="Hours" value={fmtHours(agg._sum.loggedHours)} hint={`of ${fmtHours(agg._sum.estimatedHours)} estimated`} />}
        </div>
        <Card>
          <CardHeader title="About this project" />
          <CardBody className="space-y-4 text-sm">
            <p className="whitespace-pre-wrap text-slate-700">{project.description ?? "No description yet."}</p>
            {project.goals && <div><h3 className="mb-1 font-medium">Goals</h3><p className="whitespace-pre-wrap text-slate-700">{project.goals}</p></div>}
            <dl className="grid gap-3 border-t border-line pt-4 sm:grid-cols-3">
              <div><dt className="text-xs text-slate-500">Schedule</dt><dd>{fmtDate(project.startDate)} to {fmtDate(project.endDate)}</dd></div>
              <div><dt className="text-xs text-slate-500">Manager</dt><dd>{project.manager?.name ?? "Unassigned"}</dd></div>
              {project.clientName && <div><dt className="text-xs text-slate-500">Client</dt><dd>{project.clientName}</dd></div>}
              {level === "manage" && project.budget != null && <div><dt className="text-xs text-slate-500">Budget</dt><dd>{Number(project.budget).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })}</dd></div>}
              {project.category && <div><dt className="text-xs text-slate-500">Category</dt><dd>{project.category}</dd></div>}
            </dl>
          </CardBody>
        </Card>
        <Card><CardHeader title="Task status" />
          <CardBody>{donut.length ? <DonutChart data={donut} /> : <EmptyState title="No tasks yet" description="Tasks you add will show up here by status." />}</CardBody>
        </Card>
        {!client && (
          <Card>
            <CardHeader title="Announcements" action={can(level, "announce") ? <AnnouncementModal projectId={id} /> : undefined} />
            {announcements.length ? <ul className="divide-y divide-line">{announcements.map((a) => (
              <li key={a.id} className="px-5 py-3.5"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-medium">{a.pinned && <Badge tone="blue" className="mr-2">Pinned</Badge>}{a.title}</p><p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{a.body}</p><p className="mt-1 text-xs text-slate-400">{a.author.name} · {timeAgo(a.createdAt)}</p></div>
                {can(level, "announce") && <ActionButton action={deleteAnnouncementAction.bind(null, a.id)} variant="ghost" confirm={{ title: "Delete this announcement?", confirmLabel: "Delete" }}>Delete</ActionButton>}</div></li>
            ))}</ul> : <p className="px-5 py-6 text-sm text-slate-500">No announcements yet.</p>}
          </Card>
        )}
      </div>
      <div className="space-y-6">
        {summary && (
          <Card>
            <CardHeader title="Delivery risk" description="Computed from tasks, milestones and progress" action={<Badge tone={summary.risk.level === "High" ? "red" : summary.risk.level === "Medium" ? "amber" : "green"}>{summary.risk.level} · {summary.risk.score}/100</Badge>} />
            <CardBody className="space-y-3 text-sm">
              <p className="font-medium">{summary.headline}</p>
              {summary.paragraphs.map((p, i) => <p key={i} className="text-slate-600">{p}</p>)}
              <details className="text-xs text-slate-500"><summary className="cursor-pointer font-medium text-blue-700">How the score is calculated</summary>
                {summary.risk.reasons.length ? <ul className="mt-1.5 list-disc space-y-0.5 pl-4">{summary.risk.reasons.map((r) => <li key={r}>{r}</li>)}</ul> : <p className="mt-1.5">No risk factors found.</p>}</details>
              <Link href={`/insights?project=${id}`} className="inline-block text-sm font-medium text-blue-700 hover:underline">See insights for this project</Link>
            </CardBody>
          </Card>
        )}
        <Card>
          <CardHeader title="Next milestones" action={<Link href={`/projects/${id}?tab=milestones`} className="text-xs font-medium text-blue-700 hover:underline">All</Link>} />
          {milestones.length ? <ul className="divide-y divide-line">{milestones.map((m) => (
            <li key={m.id} className="px-5 py-3"><div className="flex items-center justify-between gap-2"><span className="truncate text-sm font-medium">{m.name}</span><HealthBadge health={m.health} /></div>
              <div className="mt-2 flex items-center gap-2"><ProgressBar value={m.progress} /><span className="text-xs text-slate-500">{m.progress}%</span></div>
              <p className={`mt-1 text-xs ${m.dueDate < today ? "font-medium text-red-600" : "text-slate-500"}`}>{m.dueDate < today ? "Overdue since" : "Due"} {fmtShortDate(m.dueDate)}</p></li>
          ))}</ul> : <p className="px-5 py-6 text-sm text-slate-500">No open milestones.</p>}
        </Card>
        {!client && risks.length > 0 && (
          <Card><CardHeader title="Open risks" action={<Link href={`/projects/${id}?tab=risks`} className="text-xs font-medium text-blue-700 hover:underline">All</Link>} />
            <ul className="divide-y divide-line">{risks.map((r) => <li key={r.id} className="px-5 py-3"><div className="flex items-center justify-between gap-2"><span className="text-sm font-medium">{r.title}</span><Badge tone={r.severity === "CRITICAL" ? "red" : r.severity === "HIGH" ? "amber" : "slate"}>{SEVERITY_LABEL[r.severity]}</Badge></div>{r.owner && <p className="text-xs text-slate-500">Owner: {r.owner.name}</p>}</li>)}</ul></Card>
        )}
        <Card><CardHeader title="Team" action={!client ? <Link href={`/projects/${id}?tab=team`} className="text-xs font-medium text-blue-700 hover:underline">Manage</Link> : undefined} />
          <ul className="space-y-2 p-5">{members.map((m) => <li key={m.userId} className="flex items-center gap-2.5 text-sm"><Avatar name={m.user.name} src={m.user.avatarUrl} size={26} />{m.user.name}</li>)}{members.length === 0 && <li className="text-sm text-slate-500">No team members yet.</li>}</ul>
        </Card>
      </div>
    </div>
  );
}
