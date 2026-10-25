import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { db } from "@/lib/db";
import { requireManagement } from "@/lib/auth";
import { projectWhere } from "@/lib/access";
import { flat, reviewScopeUserWhere } from "@/lib/queries";
import { REPORT_STATUS_LABEL } from "@/lib/constants";
import { Avatar, Badge, Card, EmptyState, PageHeader, Stat } from "@/components/ui/primitives";
import { MoodBadge, ReportStatusBadge } from "@/components/ui/chips";
import { buttonClass } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/form";
import { addDays, fmtDate, fmtHours, isoDate, isWorkday, parseDateOnly, sum, todayUTC } from "@/lib/utils";

export const metadata = { title: "Team activity" };
export const dynamic = "force-dynamic";

export default async function TeamActivityPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireManagement();
  const sp = flat(await searchParams);
  const today = todayUTC();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(sp.date ?? "") ? parseDateOnly(sp.date!) : today;
  const workday = isWorkday(date);
  const [people, projects, teams] = await Promise.all([
    db.user.findMany({
      where: { AND: [reviewScopeUserWhere(user), { id: { not: user.id } }, sp.person ? { id: sp.person } : {}, sp.team ? { teamMemberships: { some: { teamId: sp.team } } } : {}, sp.project ? { projectMemberships: { some: { projectId: sp.project } } } : {}] },
      select: { id: true, name: true, avatarUrl: true, role: true, department: { select: { name: true } } }, orderBy: { name: "asc" },
    }),
    db.project.findMany({ where: { AND: [projectWhere(user), { archivedAt: null }] }, select: { id: true, code: true }, orderBy: { code: "asc" } }),
    db.team.findMany({ where: { orgId: user.orgId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const reports = await db.dailyReport.findMany({
    where: { reportDate: date, authorId: { in: people.map((p) => p.id) } },
    include: { items: { include: { project: { select: { code: true } }, task: { select: { id: true, title: true } } } }, attachments: { include: { file: { select: { id: true, name: true, kind: true, externalUrl: true } } } } },
  });
  const rows = people.map((p) => ({ person: p, report: reports.find((r) => r.authorId === p.id) })).filter((r) => !sp.status || (sp.status === "MISSING" ? !r.report || r.report.status === "DRAFT" : r.report?.status === sp.status));
  const submitted = rows.filter((r) => r.report && r.report.status !== "DRAFT");
  const blockers = submitted.filter((r) => r.report!.blockers || r.report!.mood === "NEED_HELP").length;
  const totalHours = sum(submitted.flatMap((r) => r.report!.items.map((i) => i.hoursSpent)));
  const nav = (d: Date) => `/team-activity?${new URLSearchParams({ ...sp, date: isoDate(d) })}`;

  return (
    <>
      <PageHeader title={isoDate(date) === isoDate(today) ? "Today’s team activity" : `Team activity · ${fmtDate(date)}`} description="Who worked, what they submitted, time spent, blockers and evidence."
        actions={<><Link href={nav(addDays(date, -1))} className={buttonClass("secondary")}>← Previous day</Link>{isoDate(date) !== isoDate(today) && <Link href={nav(today)} className={buttonClass("secondary")}>Today</Link>}{date < today && <Link href={nav(addDays(date, 1))} className={buttonClass("secondary")}>Next day →</Link>}</>} />
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Submitted" value={`${submitted.length} of ${people.length}`} tone={workday && submitted.length < people.length ? "amber" : "green"} />
        <Stat label="Hours reported" value={fmtHours(totalHours)} /><Stat label="Blockers / help requests" value={blockers} tone={blockers ? "red" : undefined} />
        <Stat label="Not submitted" value={workday ? people.length - submitted.length : "—"} hint={workday ? undefined : "Weekend"} tone={workday && people.length - submitted.length > 0 ? "amber" : undefined} />
      </div>
      <Card className="mb-6">
        <form className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-6" role="search" aria-label="Filter team activity">
          <Input name="date" type="date" max={isoDate(today)} defaultValue={isoDate(date)} aria-label="Date" />
          <Select name="person" defaultValue={sp.person ?? ""} aria-label="Person"><option value="">Everyone</option>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>
          <Select name="team" defaultValue={sp.team ?? ""} aria-label="Team"><option value="">All teams</option>{teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select>
          <Select name="project" defaultValue={sp.project ?? ""} aria-label="Project"><option value="">All projects</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.code}</option>)}</Select>
          <Select name="status" defaultValue={sp.status ?? ""} aria-label="Report status"><option value="">Any status</option><option value="MISSING">Not submitted</option>{Object.entries(REPORT_STATUS_LABEL).filter(([k]) => k !== "DRAFT").map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
          <button className={buttonClass("secondary")}>Apply</button>
        </form>
      </Card>
      {rows.length === 0 ? <Card><EmptyState title="No one matches those filters" /></Card> : (
        <ul className="grid gap-4 xl:grid-cols-2">
          {rows.map(({ person, report }) => {
            const hours = report ? sum(report.items.map((i) => i.hoursSpent)) : 0;
            const live = report && report.status !== "DRAFT";
            return (
              <li key={person.id}>
                <Card className={live ? undefined : "bg-slate-50/60"}>
                  <div className="flex items-center justify-between gap-3 px-5 py-3.5">
                    <div className="flex min-w-0 items-center gap-3"><Avatar name={person.name} src={person.avatarUrl} size={34} /><div className="min-w-0"><p className="truncate text-sm font-semibold">{person.name}</p><p className="truncate text-xs text-slate-500">{person.department?.name}</p></div></div>
                    <div className="flex items-center gap-2">{live ? <><span className="text-sm font-medium">{fmtHours(hours)}</span><ReportStatusBadge status={report!.status} /></> : report ? <Badge tone="amber">Draft only</Badge> : workday ? <Badge tone="slate">Not submitted</Badge> : <Badge>Weekend</Badge>}</div>
                  </div>
                  {live && (
                    <div className="space-y-3 border-t border-line px-5 py-4 text-sm">
                      {report!.items.length > 0 && <ul className="space-y-1">{report!.items.map((i) => <li key={i.id} className="flex justify-between gap-3"><span className="min-w-0 truncate"><span className="text-xs font-medium text-slate-500">{i.project.code}</span> {i.task ? <Link href={`/tasks/${i.task.id}`} className="hover:underline">{i.task.title}</Link> : "General work"}</span><span className="shrink-0 text-slate-500">{fmtHours(i.hoursSpent)}</span></li>)}</ul>}
                      {report!.completedToday && <p className="text-slate-700"><span className="font-medium text-slate-900">Done: </span>{report!.completedToday}</p>}
                      {report!.progressUpdate && <p className="text-slate-700"><span className="font-medium text-slate-900">Progress: </span>{report!.progressUpdate}</p>}
                      {(report!.blockers || report!.mood === "NEED_HELP") && <p className="flex items-start gap-2 rounded-md bg-red-50 px-3 py-2 text-red-800"><AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden /><span>{report!.blockers ?? "Marked “Need help”"}</span></p>}
                      {report!.attachments.length > 0 && <ul className="flex flex-wrap gap-2">{report!.attachments.map((a) => <li key={a.id}><a href={a.file.externalUrl ?? `/api/files/${a.file.id}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 rounded-md border border-line px-2 py-1 text-xs hover:bg-slate-50">{a.file.kind === "IMAGE" && /* eslint-disable-next-line @next/next/no-img-element */ <img src={`/api/files/${a.file.id}`} alt="" className="size-6 rounded object-cover" />}<span className="max-w-40 truncate">{a.file.name}</span></a></li>)}</ul>}
                      <div className="flex items-center justify-between pt-1"><MoodBadge mood={report!.mood} /><Link href={`/daily-reports/${report!.id}`} className="text-sm font-medium text-blue-700 hover:underline">{report!.status === "SUBMITTED" ? "Review report →" : "Open report →"}</Link></div>
                    </div>
                  )}
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
