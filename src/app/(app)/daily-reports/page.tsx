import Link from "next/link";
import { Download, FileText } from "lucide-react";
import { redirect } from "next/navigation";
import { db, type Prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { projectWhere } from "@/lib/access";
import { flat, qs, reviewScopeUserWhere } from "@/lib/queries";
import { isManagementRole } from "@/lib/permissions";
import { REPORT_STATUS_LABEL } from "@/lib/constants";
import { Avatar, Card, EmptyState, PageHeader, Pagination, Table, Td, Th } from "@/components/ui/primitives";
import { MoodBadge, ReportStatusBadge } from "@/components/ui/chips";
import { buttonClass } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/form";
import { fmtDate, fmtHours, sum } from "@/lib/utils";

export const metadata = { title: "Daily reports" };
export const dynamic = "force-dynamic";
const PAGE = 20;

export default async function DailyReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  if (user.role === "CLIENT_VIEWER") redirect("/unauthorized");
  const sp = flat(await searchParams);
  const mgmt = isManagementRole(user.role);
  const page = Math.max(Number(sp.page) || 1, 1);
  const scope: Prisma.DailyReportWhereInput = mgmt ? { OR: [{ authorId: user.id }, { status: { not: "DRAFT" }, author: reviewScopeUserWhere(user) }] } : { authorId: user.id };
  const where: Prisma.DailyReportWhereInput = {
    AND: [scope, {
      ...(sp.person && mgmt ? { authorId: sp.person } : {}), ...(sp.status ? { status: sp.status as "SUBMITTED" } : {}), ...(sp.project ? { items: { some: { projectId: sp.project } } } : {}),
      ...((sp.from || sp.to) ? { reportDate: { ...(sp.from ? { gte: new Date(sp.from) } : {}), ...(sp.to ? { lte: new Date(sp.to) } : {}) } } : {}),
      ...(sp.team && mgmt ? { author: { teamMemberships: { some: { teamId: sp.team } } } } : {}),
    }],
  };
  const [reports, total, people, projects, teams, queue] = await Promise.all([
    db.dailyReport.findMany({ where, orderBy: [{ reportDate: "desc" }, { updatedAt: "desc" }], skip: (page - 1) * PAGE, take: PAGE, include: { author: { select: { name: true, avatarUrl: true } }, reviewer: { select: { name: true } }, items: { select: { hoursSpent: true, project: { select: { code: true } } } }, attachments: { select: { id: true } } } }),
    db.dailyReport.count({ where }),
    mgmt ? db.user.findMany({ where: reviewScopeUserWhere(user), select: { id: true, name: true }, orderBy: { name: "asc" } }) : [],
    db.project.findMany({ where: { AND: [projectWhere(user), { archivedAt: null }] }, select: { id: true, code: true }, orderBy: { code: "asc" } }),
    mgmt ? db.team.findMany({ where: { orgId: user.orgId }, select: { id: true, name: true }, orderBy: { name: "asc" } }) : [],
    mgmt ? db.dailyReport.count({ where: { status: "SUBMITTED", authorId: { not: user.id }, author: reviewScopeUserWhere(user) } }) : 0,
  ]);
  const filtered = !!(sp.person || sp.status || sp.project || sp.from || sp.to || sp.team);

  return (
    <>
      <PageHeader title="Daily reports" description={mgmt ? "Review what your team did, how long it took and what is blocking them." : "Your daily updates and their review status."}
        actions={<><a href={`/api/export/reports${qs({ projectId: sp.project, status: sp.status, userId: sp.person, from: sp.from, to: sp.to }, {})}`} className={buttonClass("secondary")}><Download className="size-4" aria-hidden />CSV</a>
          <Link href="/daily-reports/new" className={buttonClass("primary")}><FileText className="size-4" aria-hidden />Today’s update</Link></>} />
      {mgmt && queue > 0 && sp.status !== "SUBMITTED" && <Link href="/daily-reports?status=SUBMITTED" className="mb-5 flex items-center justify-between rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900 hover:bg-blue-100"><span><strong>{queue}</strong> {queue === 1 ? "report is" : "reports are"} waiting for your review</span><span className="font-medium">Open the queue →</span></Link>}
      <Card>
        <form className="grid gap-3 border-b border-line p-4 sm:grid-cols-2 lg:grid-cols-7" role="search" aria-label="Filter reports">
          {mgmt && <Select name="person" defaultValue={sp.person ?? ""} aria-label="Person"><option value="">Everyone</option>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>}
          {mgmt && <Select name="team" defaultValue={sp.team ?? ""} aria-label="Team"><option value="">All teams</option>{teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select>}
          <Select name="project" defaultValue={sp.project ?? ""} aria-label="Project"><option value="">All projects</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.code}</option>)}</Select>
          <Select name="status" defaultValue={sp.status ?? ""} aria-label="Status"><option value="">Any status</option>{Object.entries(REPORT_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
          <Input name="from" type="date" defaultValue={sp.from} aria-label="From date" /><Input name="to" type="date" defaultValue={sp.to} aria-label="To date" />
          <div className="flex gap-2"><button className={buttonClass("secondary", "md", "flex-1")}>Filter</button>{filtered && <Link href="/daily-reports" className={buttonClass("ghost")}>Clear</Link>}</div>
        </form>
        {reports.length === 0 ? <EmptyState title={filtered ? "No reports match those filters" : "No daily reports yet"} description={filtered ? "Try clearing a filter." : "Submit your first daily update to start the record."} action={!filtered ? <Link href="/daily-reports/new" className={buttonClass("primary")}>Start today’s update</Link> : undefined} /> : (
          <Table>
            <thead><tr><Th>Date</Th>{mgmt && <Th>Person</Th>}<Th>Projects</Th><Th>Hours</Th><Th>Status</Th><Th>Mood</Th><Th>Blockers</Th><Th>Files</Th></tr></thead>
            <tbody>{reports.map((r) => (
              <tr key={r.id} className="hover:bg-slate-50/70">
                <Td className="whitespace-nowrap"><Link href={`/daily-reports/${r.id}`} className="font-medium hover:text-blue-700 hover:underline">{fmtDate(r.reportDate)}</Link></Td>
                {mgmt && <Td><span className="flex items-center gap-2"><Avatar name={r.author.name} src={r.author.avatarUrl} size={22} />{r.author.name}</span></Td>}
                <Td className="text-slate-600">{[...new Set(r.items.map((i) => i.project.code))].join(", ") || "—"}</Td>
                <Td>{fmtHours(sum(r.items.map((i) => i.hoursSpent)))}</Td>
                <Td><ReportStatusBadge status={r.status} />{r.reviewer && <div className="mt-0.5 text-xs text-slate-500">by {r.reviewer.name}</div>}</Td>
                <Td><MoodBadge mood={r.mood} /></Td>
                <Td className="max-w-[16rem] truncate text-slate-600">{r.blockers ? <span className="text-red-700">{r.blockers}</span> : "—"}</Td>
                <Td>{r.attachments.length || "—"}</Td>
              </tr>
            ))}</tbody>
          </Table>
        )}
        <Pagination page={page} pageSize={PAGE} total={total} hrefFor={(n) => `/daily-reports${qs(sp, { page: n === 1 ? undefined : String(n) })}`} />
      </Card>
    </>
  );
}
