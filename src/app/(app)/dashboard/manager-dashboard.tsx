import Link from "next/link";
import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/auth";
import { projectWhere, taskWhere } from "@/lib/access";
import { getMissingReports, getWorkload, taskCardInclude, weekOf } from "@/lib/queries";
import { getInsightsService } from "@/lib/ai";
import { isAdminRole } from "@/lib/permissions";
import { Avatar, Card, CardHeader, PageHeader, Stat } from "@/components/ui/primitives";
import { HealthBadge, PriorityBadge } from "@/components/ui/chips";
import { AllClear, ActivityFeed, InsightCard, TaskList } from "@/components/views";
import { BarsChart } from "@/components/charts";
import { buttonClass } from "@/components/ui/button";
import { Badge } from "@/components/ui/primitives";
import { fmtShortDate, todayUTC } from "@/lib/utils";

export async function ManagerDashboard({ user }: { user: SessionUser }) {
  const today = todayUTC();
  const scope = { AND: [projectWhere(user), { archivedAt: null }] };
  const tw = taskWhere(user);
  const reviewScope = user.role === "PROJECT_MANAGER" ? { project: { managerId: user.id } } : {};
  const [activeProjects, statusCounts, overdueCount, milestones, workload, missing, activity, toReview, activeList] = await Promise.all([
    db.project.count({ where: { AND: [...scope.AND, { status: "ACTIVE" }] } }),
    db.task.groupBy({ by: ["status"], where: tw, _count: true }),
    db.task.count({ where: { AND: [tw, { status: { not: "COMPLETED" }, dueDate: { lt: today } }] } }),
    db.milestone.findMany({ where: { deletedAt: null, status: { not: "COMPLETED" }, project: scope }, orderBy: { dueDate: "asc" }, take: 5, include: { project: { select: { id: true, code: true } } } }),
    getWorkload(user, weekOf()),
    getMissingReports(user, today),
    db.activityLog.findMany({ where: { project: scope }, orderBy: { createdAt: "desc" }, take: 8, include: { actor: { select: { name: true, avatarUrl: true } }, project: { select: { id: true, code: true } } } }),
    db.task.findMany({ where: { AND: [tw, { status: "WAITING_FOR_REVIEW" }, reviewScope] }, include: taskCardInclude, orderBy: { updatedAt: "asc" }, take: 6 }),
    db.project.findMany({ where: { AND: [...scope.AND, { status: "ACTIVE" }] }, select: { id: true, code: true, name: true }, take: 8 }),
  ]);
  const count = (s: string) => statusCounts.find((c) => c.status === s)?._count ?? 0;

  const ai = getInsightsService();
  const [summaries, actionLists] = await Promise.all([
    Promise.all(activeList.map((p) => ai.generateProjectSummary(p.id))),
    Promise.all(activeList.map((p) => ai.suggestManagerActions(p.id))),
  ]);
  const atRisk = summaries.filter((s) => s.risk.level !== "Low").sort((a, b) => b.risk.score - a.risk.score);
  const sevRank = { high: 0, medium: 1, low: 2, info: 3 } as const;
  const actions = actionLists.flatMap((list, i) => list.map((a) => ({ a, code: activeList[i]!.code }))).sort((x, y) => sevRank[x.a.severity] - sevRank[y.a.severity]).slice(0, 5);

  return (
    <>
      <PageHeader title="Delivery overview" description="Where projects, people and deadlines stand right now." actions={<><Link href="/team-activity" className={buttonClass("secondary")}>Today’s team activity</Link>{(isAdminRole(user.role) || user.role === "PROJECT_MANAGER") && <Link href="/projects/new" className={buttonClass("primary")}>New project</Link>}</>} />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        <Stat label="Active projects" value={activeProjects} href="/projects?status=ACTIVE" />
        <Stat label="Completed" value={count("COMPLETED")} tone="green" href="/tasks?status=COMPLETED" />
        <Stat label="In progress" value={count("IN_PROGRESS")} href="/tasks?status=IN_PROGRESS" />
        <Stat label="Blocked" value={count("BLOCKED")} tone={count("BLOCKED") ? "red" : undefined} href="/tasks?status=BLOCKED" />
        <Stat label="Overdue" value={overdueCount} tone={overdueCount ? "red" : undefined} href="/tasks?due=overdue" />
        <Stat label="Awaiting review" value={count("WAITING_FOR_REVIEW")} tone={count("WAITING_FOR_REVIEW") ? "amber" : undefined} href="/tasks?status=WAITING_FOR_REVIEW" />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Card>
            <CardHeader title="AI summary and suggested actions" description="Generated from task, milestone, report and time data. Open “Why” on any item to see the evidence." action={<Link href="/insights" className="text-xs font-medium text-blue-700 hover:underline">Open insights</Link>} />
            <div className="space-y-3 p-4">
              {atRisk.length > 0 && (
                <ul className="grid gap-2 sm:grid-cols-2">{atRisk.slice(0, 4).map((s) => (
                  <li key={s.projectId}><Link href={`/projects/${s.projectId}`} className="block rounded-lg border border-line p-3 hover:border-slate-300">
                    <div className="flex items-center justify-between"><span className="text-sm font-medium">{s.projectName}</span><Badge tone={s.risk.level === "High" ? "red" : "amber"}>{s.risk.level} risk · {s.risk.score}</Badge></div>
                    <p className="mt-1 text-xs text-slate-600">{s.paragraphs[1]}</p>
                  </Link></li>
                ))}</ul>
              )}
              {actions.length ? <ul className="space-y-3">{actions.map(({ a, code }) => <InsightCard key={a.id} insight={a} projectLabel={code} />)}</ul> : <AllClear text="No risks or follow-ups detected across your active projects." />}
            </div>
          </Card>
          <Card>
            <CardHeader title="Team workload this week" description="Remaining estimate on open tasks due this week or earlier, against weekly capacity" action={<Link href="/workload" className="text-xs font-medium text-blue-700 hover:underline">Details</Link>} />
            <div className="p-4">
              {workload.length ? <BarsChart data={workload.map((w) => ({ name: w.name.split(" ")[0]!, Planned: w.planned, Logged: w.logged, Capacity: w.weeklyCapacityHours }))} xKey="name" unit="h" bars={[{ key: "Planned", label: "Planned", color: "#2563eb" }, { key: "Logged", label: "Logged", color: "#16a34a" }, { key: "Capacity", label: "Capacity", color: "#cbd5e1" }]} /> : <p className="py-6 text-center text-sm text-slate-500">No team members in your projects yet.</p>}
            </div>
          </Card>
          <Card><CardHeader title="Recent team activity" action={<Link href="/projects" className="text-xs font-medium text-blue-700 hover:underline">All projects</Link>} /><ActivityFeed items={activity} /></Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Tasks needing approval" description="Sent for review by the team" />
            <TaskList tasks={toReview} empty="Nothing waiting for review." />
          </Card>
          <Card>
            <CardHeader title="Missing daily reports" description={today.getUTCDay() % 6 === 0 ? "Weekend: no reports expected" : "Not submitted yet today"} action={<Link href="/team-activity" className="text-xs font-medium text-blue-700 hover:underline">Team activity</Link>} />
            {missing.length ? <ul className="divide-y divide-line">{missing.map((m) => (
              <li key={m.id} className="flex items-center gap-3 px-5 py-2.5"><Avatar name={m.name} src={m.avatarUrl} size={28} /><span className="flex-1 text-sm">{m.name}</span>{m.dailyReports[0] ? <Badge tone="amber">Draft only</Badge> : <Badge>Not started</Badge>}</li>
            ))}</ul> : <AllClear text={today.getUTCDay() % 6 === 0 ? "Enjoy the weekend." : "Everyone has submitted today."} />}
          </Card>
          <Card>
            <CardHeader title="Upcoming milestones" />
            {milestones.length ? <ul className="divide-y divide-line">{milestones.map((m) => (
              <li key={m.id}><Link href={`/projects/${m.project.id}?tab=milestones`} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50">
                <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{m.name}</p><p className={`text-xs ${m.dueDate < today ? "font-medium text-red-600" : "text-slate-500"}`}>{m.project.code} · {m.dueDate < today ? "was due" : "due"} {fmtShortDate(m.dueDate)} · {m.progress}%</p></div>
                <HealthBadge health={m.health} />
              </Link></li>
            ))}</ul> : <p className="px-5 py-6 text-sm text-slate-500">No open milestones.</p>}
          </Card>
        </div>
      </div>
    </>
  );
}
void PriorityBadge;
