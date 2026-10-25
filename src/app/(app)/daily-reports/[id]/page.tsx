import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { reportViewerFlags } from "@/lib/access";
import { canReviewStatus } from "@/lib/business";
import { canEditReport } from "@/lib/permissions";
import { Avatar, Card, CardBody, CardHeader, PageHeader, Table, Td, Th } from "@/components/ui/primitives";
import { MoodBadge, ReportStatusBadge } from "@/components/ui/chips";
import { buttonClass } from "@/components/ui/button";
import { CommentBody, CommentForm } from "@/components/comments";
import { ReviewReportForm } from "@/components/report-panels";
import { fmtDate, fmtDateTime, fmtHours, sum, timeAgo } from "@/lib/utils";

export const dynamic = "force-dynamic";
export async function generateMetadata() { return { title: "Daily report" }; }

const Section = ({ title, text }: { title: string; text?: string | null }) => text ? <div><h3 className="mb-1 text-xs font-medium text-slate-500">{title}</h3><p className="whitespace-pre-wrap text-sm text-slate-800">{text}</p></div> : null;

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const report = await db.dailyReport.findFirst({
    where: { id, author: { orgId: user.orgId } },
    include: {
      author: { select: { id: true, name: true, avatarUrl: true } }, reviewer: { select: { name: true } },
      items: { include: { project: { select: { id: true, code: true } }, task: { select: { id: true, title: true } } } },
      attachments: { where: { file: { deletedAt: null } }, include: { file: true } },
      comments: { where: { deletedAt: null }, orderBy: { createdAt: "asc" }, include: { author: { select: { id: true, name: true, avatarUrl: true } } } },
    },
  });
  if (!report) notFound();
  const flags = await reportViewerFlags(user, report.authorId);
  if (!flags.canView) notFound();
  const people = (await db.user.findMany({ where: { orgId: user.orgId, status: "ACTIVE", role: { not: "CLIENT_VIEWER" }, id: { not: user.id } }, select: { id: true, name: true }, orderBy: { name: "asc" } }));
  const hours = sum(report.items.map((i) => i.hoursSpent));
  const editable = canEditReport(user.id, report);

  return (
    <>
      <PageHeader back={{ href: "/daily-reports", label: "Daily reports" }}
        title={<span className="flex flex-wrap items-center gap-3">{fmtDate(report.reportDate)}<ReportStatusBadge status={report.status} /><MoodBadge mood={report.mood} /></span>}
        description={<span className="flex items-center gap-2"><Avatar name={report.author.name} src={report.author.avatarUrl} size={22} />{report.author.name} · {fmtHours(hours)} logged{report.submittedAt && <> · submitted {timeAgo(report.submittedAt)}</>}</span>}
        actions={editable && <Link href={`/daily-reports/new?date=${report.reportDate.toISOString().slice(0, 10)}`} className={buttonClass("secondary")}><Pencil className="size-4" aria-hidden />Edit report</Link>} />

      {report.reviewedAt && report.reviewer && (
        <div role="status" className={`mb-5 rounded-lg border px-4 py-3 text-sm ${report.status === "APPROVED" ? "border-green-200 bg-green-50 text-green-900" : report.status === "REJECTED" ? "border-red-200 bg-red-50 text-red-900" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
          <p className="font-medium">{report.status === "APPROVED" ? "Approved" : report.status === "REJECTED" ? "Rejected" : "Changes requested"} by {report.reviewer.name} · {fmtDateTime(report.reviewedAt)}</p>{report.reviewComment && <p className="mt-0.5 whitespace-pre-wrap">{report.reviewComment}</p>}
        </div>
      )}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card><CardHeader title="Update" /><CardBody className="space-y-4">
            <Section title="Work completed today" text={report.completedToday} /><Section title="Work in progress" text={report.inProgress} /><Section title="Progress update" text={report.progressUpdate} /><Section title="Plan for tomorrow" text={report.planTomorrow} />
            {report.blockers && <div className="rounded-md border border-red-200 bg-red-50 p-3"><h3 className="mb-1 text-xs font-medium text-red-700">Blockers or help needed</h3><p className="whitespace-pre-wrap text-sm text-red-900">{report.blockers}</p></div>}
            {!report.completedToday && !report.inProgress && !report.progressUpdate && !report.planTomorrow && !report.blockers && <p className="text-sm text-slate-500">No written update.</p>}
          </CardBody></Card>
          <Card><CardHeader title="Time by task" description={`${fmtHours(hours)} in total`} />
            {report.items.length ? <Table><thead><tr><Th>Project</Th><Th>Task</Th><Th>Hours</Th><Th>Notes</Th></tr></thead><tbody>{report.items.map((i) => <tr key={i.id}><Td><Link href={`/projects/${i.project.id}`} className="hover:underline">{i.project.code}</Link></Td><Td>{i.task ? <Link href={`/tasks/${i.task.id}`} className="hover:underline">{i.task.title}</Link> : <span className="text-slate-500">General project work</span>}</Td><Td>{fmtHours(i.hoursSpent)}</Td><Td className="text-slate-600">{i.notes ?? "—"}</Td></tr>)}</tbody></Table> : <p className="px-5 py-6 text-sm text-slate-500">No tasks listed.</p>}
          </Card>
          <Card><CardHeader title="Evidence" description={`${report.attachments.length} attached`} />
            {report.attachments.length ? <CardBody><ul className="grid gap-3 sm:grid-cols-2">{report.attachments.map((a) => (
              <li key={a.id}><a href={a.file.externalUrl ?? `/api/files/${a.file.id}`} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-lg border border-line hover:border-slate-300">
                {a.file.kind === "IMAGE" && /* eslint-disable-next-line @next/next/no-img-element */ <img src={`/api/files/${a.file.id}`} alt={a.file.name} loading="lazy" className="h-40 w-full object-cover" />}
                <div className="px-3 py-2"><p className="truncate text-sm font-medium">{a.file.name}</p><p className="text-xs text-slate-500">{a.file.kind.replace("_", " ").toLowerCase()}</p></div></a></li>))}</ul></CardBody> : <p className="px-5 py-6 text-sm text-slate-500">No evidence attached.</p>}
          </Card>
        </div>
        <div className="space-y-6">
          {flags.canReview && canReviewStatus(report.status) && <Card><CardHeader title="Review this report" /><CardBody><ReviewReportForm reportId={id} /></CardBody></Card>}
          <Card>
            <CardHeader title="Discussion" />
            <div className="divide-y divide-line">
              {report.comments.length === 0 && <p className="px-5 py-5 text-sm text-slate-500">No comments yet.</p>}
              {report.comments.map((c) => <div key={c.id} className="flex gap-3 px-5 py-3.5"><Avatar name={c.author.name} src={c.author.avatarUrl} size={28} /><div className="min-w-0"><p className="text-sm"><span className="font-medium">{c.author.name}</span> <span className="text-xs text-slate-400">{timeAgo(c.createdAt)}</span></p><div className="mt-1"><CommentBody body={c.body} /></div></div></div>)}
            </div>
            <CardBody className="border-t border-line"><CommentForm reportId={id} people={people} placeholder="Add a comment or question" /></CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
