import Link from "next/link";
import { Sparkles } from "lucide-react";
import { db } from "@/lib/db";
import { requireManagement } from "@/lib/auth";
import { projectWhere, finishedEntry } from "@/lib/access";
import { flat, reviewScopeUserWhere } from "@/lib/queries";
import { getInsightsService, type Insight } from "@/lib/ai";
import { Avatar, Badge, Card, CardBody, CardHeader, PageHeader, Table, Td, Th } from "@/components/ui/primitives";
import { AllClear, InsightCard } from "@/components/views";
import { Select } from "@/components/ui/form";
import { buttonClass } from "@/components/ui/button";
import { addDays, fmtHours, isoDate, isWorkday, sum, todayUTC } from "@/lib/utils";

export const metadata = { title: "AI insights" };
export const dynamic = "force-dynamic";
const SEV = { high: 0, medium: 1, low: 2, info: 3 } as const;

function Section({ title, description, items, codes, empty }: { title: string; description: string; items: Insight[]; codes: Record<string, string>; empty: string }) {
  const sorted = [...items].sort((a, b) => SEV[a.severity] - SEV[b.severity]);
  return (
    <Card>
      <CardHeader title={title} description={description} action={items.length ? <Badge tone={sorted[0]!.severity === "high" ? "red" : sorted[0]!.severity === "medium" ? "amber" : "slate"}>{items.length}</Badge> : undefined} />
      {sorted.length ? <ul className="space-y-3 p-4">{sorted.map((i) => <InsightCard key={i.id} insight={i} projectLabel={codes[i.projectId]} />)}</ul> : <AllClear text={empty} />}
    </Card>
  );
}

export default async function InsightsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireManagement();
  const sp = flat(await searchParams);
  const projects = await db.project.findMany({
    where: { AND: [projectWhere(user), user.role === "PROJECT_MANAGER" ? { managerId: user.id } : {}, { archivedAt: null, status: { in: ["ACTIVE", "ON_HOLD"] } }] },
    select: { id: true, code: true, name: true }, orderBy: { name: "asc" },
  });
  const selected = sp.project ? projects.filter((p) => p.id === sp.project) : projects.slice(0, 8);
  const codes = Object.fromEntries(projects.map((p) => [p.id, p.code]));
  const ai = getInsightsService();
  const per = await Promise.all(selected.map(async (p) => {
    const [summary, stalled, milestones, priorities, workload, evidence, deps, actions] = await Promise.all([
      ai.generateProjectSummary(p.id), ai.detectStalledTasks(p.id), ai.assessMilestoneHealth(p.id), ai.recommendPriorities(p.id), ai.analyzeTeamWorkload(p.id), ai.findMissingEvidence(p.id), ai.findBlockedDependencies(p.id), ai.suggestManagerActions(p.id),
    ]);
    return { p, summary, stalled, milestones, priorities, workload, evidence, deps, actions };
  }));
  const all = <K extends "stalled" | "milestones" | "priorities" | "workload" | "evidence" | "deps" | "actions">(k: K) => per.flatMap((x) => x[k]);

  // Weekly team summary, from the last 7 days of tasks, time and reports.
  const since = addDays(todayUTC(), -7);
  const team = await db.user.findMany({ where: { AND: [reviewScopeUserWhere(user), { id: { not: user.id } }] }, select: { id: true, name: true, avatarUrl: true }, orderBy: { name: "asc" } });
  const [done, entries, reports] = await Promise.all([
    db.task.findMany({ where: { status: "COMPLETED", completedAt: { gte: since }, project: projectWhere(user), assignees: { some: { userId: { in: team.map((t) => t.id) } } } }, select: { assignees: { select: { userId: true } } } }),
    db.timeEntry.findMany({ where: { ...finishedEntry, date: { gte: since }, userId: { in: team.map((t) => t.id) } }, select: { userId: true, hours: true } }),
    db.dailyReport.findMany({ where: { reportDate: { gte: since }, status: { not: "DRAFT" }, authorId: { in: team.map((t) => t.id) } }, select: { authorId: true, blockers: true } }),
  ]);
  const workdays = Array.from({ length: 7 }, (_, i) => addDays(todayUTC(), -i)).filter(isWorkday).length;
  const weekly = team.map((t) => ({ ...t, completed: done.filter((d) => d.assignees.some((a) => a.userId === t.id)).length, hours: sum(entries.filter((e) => e.userId === t.id).map((e) => e.hours)), reports: reports.filter((r) => r.authorId === t.id).length, blockers: reports.filter((r) => r.authorId === t.id && r.blockers).length }));

  return (
    <>
      <PageHeader title="AI insights" description="Findings generated from tasks, milestones, reports and time. Every item shows the rule and data behind it."
        actions={<form className="flex items-center gap-2"><Select name="project" defaultValue={sp.project ?? ""} aria-label="Project" className="w-56"><option value="">All active projects</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}</Select><button className={buttonClass("secondary")}>Apply</button></form>} />
      <p className="mb-6 flex items-center gap-2 rounded-lg border border-line bg-white px-4 py-2.5 text-xs text-slate-600"><Sparkles className="size-4 text-blue-600" aria-hidden />Insights use deterministic rules (provider: <code className="rounded bg-slate-100 px-1">{process.env.AI_PROVIDER ?? "mock"}</code>). No data leaves this server and no API key is needed.</p>

      {per.length === 0 ? <Card><CardBody><p className="text-sm text-slate-600">No active projects in your scope.</p></CardBody></Card> : (
        <div className="space-y-6">
          <section aria-label="Project summaries"><h2 className="mb-3 text-sm font-semibold">Daily project summary and delay-risk score</h2>
            <ul className="grid gap-4 xl:grid-cols-2">{[...per].sort((a, b) => b.summary.risk.score - a.summary.risk.score).map(({ p, summary }) => (
              <li key={p.id}><Card><div className="flex items-start justify-between gap-3 px-5 py-4">
                <div><Link href={`/projects/${p.id}`} className="text-sm font-semibold hover:text-blue-700 hover:underline">{p.name}</Link><p className="mt-0.5 text-sm text-slate-600">{summary.headline}</p></div>
                <div className="text-right"><div className={`text-3xl font-semibold ${summary.risk.level === "High" ? "text-red-600" : summary.risk.level === "Medium" ? "text-amber-600" : "text-green-600"}`}>{summary.risk.score}</div><div className="text-xs text-slate-500">{summary.risk.level} delay risk</div></div></div>
                <div className="space-y-2 border-t border-line px-5 py-4 text-sm text-slate-700">{summary.paragraphs.map((t, i) => <p key={i}>{t}</p>)}
                  <details className="text-xs text-slate-500"><summary className="cursor-pointer font-medium text-blue-700">Why this score?</summary>{summary.risk.reasons.length ? <ul className="mt-1.5 list-disc space-y-0.5 pl-4">{summary.risk.reasons.map((r) => <li key={r}>{r}</li>)}</ul> : <p className="mt-1.5">No risk factors found.</p>}</details></div></Card></li>
            ))}</ul>
          </section>

          <Section title="Suggested actions for managers" description="What to do next, in order of urgency" items={all("actions")} codes={codes} empty="Nothing needs your attention." />
          <div className="grid gap-6 xl:grid-cols-2">
            <Section title="Priority recommendations" description="Top tasks by priority, deadline and what waits on them" items={all("priorities")} codes={codes} empty="No open tasks to prioritise." />
            <Section title="Stalled tasks" description="No update for 5+ days, or waiting for review 2+ days" items={all("stalled")} codes={codes} empty="No stalled tasks." />
            <Section title="At-risk milestones" description="Due soon with low progress, or with blocked/overdue tasks" items={all("milestones")} codes={codes} empty="All milestones are on track." />
            <Section title="Overloaded team members" description="Planned hours against weekly capacity" items={all("workload")} codes={codes} empty="Workload looks balanced." />
            <Section title="Overdue and blocked dependencies" description="Late prerequisites holding up other work" items={all("deps")} codes={codes} empty="No dependency problems." />
            <Section title="Missing evidence reminders" description="Tasks that require evidence but have none attached" items={all("evidence")} codes={codes} empty="All required evidence is in." />
          </div>

          <Card><CardHeader title="Weekly team summary" description={`Last 7 days · ${workdays} workdays`} />
            {weekly.length ? <Table><thead><tr><Th>Person</Th><Th>Tasks completed</Th><Th>Hours</Th><Th>Reports</Th><Th>Blockers raised</Th></tr></thead><tbody>{weekly.map((w) => (
              <tr key={w.id}><Td><span className="flex items-center gap-2"><Avatar name={w.name} src={w.avatarUrl} size={24} />{w.name}</span></Td><Td>{w.completed}</Td><Td>{fmtHours(w.hours)}</Td><Td><span className={w.reports < workdays ? "text-amber-700" : ""}>{w.reports} of {workdays}</span></Td><Td>{w.blockers || "—"}</Td></tr>
            ))}</tbody></Table> : <p className="px-5 py-6 text-sm text-slate-500">No team members in scope.</p>}
            <p className="border-t border-line px-5 py-3 text-xs text-slate-500">Source: completed tasks, finished time entries and submitted daily reports from {isoDate(since)} onwards.</p>
          </Card>
        </div>
      )}
    </>
  );
}
