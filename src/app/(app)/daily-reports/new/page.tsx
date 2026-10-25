import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { projectWhere, taskWhere } from "@/lib/access";
import { canEditReport } from "@/lib/permissions";
import { flat } from "@/lib/queries";
import { Card, CardBody, EmptyState, PageHeader } from "@/components/ui/primitives";
import { ReportEditor } from "@/components/report-panels";
import { ReportStatusBadge } from "@/components/ui/chips";
import { addDays, isoDate, isWorkday, parseDateOnly, todayUTC } from "@/lib/utils";
import Link from "next/link";

export const metadata = { title: "Daily update" };
export const dynamic = "force-dynamic";

export default async function NewReportPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  if (user.role === "CLIENT_VIEWER") redirect("/unauthorized");
  const sp = flat(await searchParams);
  const today = todayUTC();
  const dates = Array.from({ length: 14 }, (_, i) => addDays(today, -i)).filter((d) => isWorkday(d) || isoDate(d) === isoDate(today)).map(isoDate);
  const date = dates.includes(sp.date ?? "") ? sp.date! : isoDate(today);

  const [existing, projects, tasks] = await Promise.all([
    db.dailyReport.findUnique({ where: { authorId_reportDate: { authorId: user.id, reportDate: parseDateOnly(date) } }, include: { items: true } }),
    db.project.findMany({ where: { AND: [projectWhere(user), { archivedAt: null, status: { in: ["ACTIVE", "PLANNING", "ON_HOLD"] } }] }, select: { id: true, name: true, code: true }, orderBy: { name: "asc" } }),
    db.task.findMany({ where: { AND: [taskWhere(user), { assignees: { some: { userId: user.id } }, OR: [{ status: { not: "COMPLETED" } }, { completedAt: { gte: addDays(today, -14) } }] }] }, select: { id: true, title: true, projectId: true }, orderBy: { title: "asc" } }),
  ]);
  const attachments = existing ? await db.dailyReportAttachment.findMany({ where: { reportId: existing.id, file: { deletedAt: null } }, include: { file: true } }) : [];
  const locked = existing && !canEditReport(user.id, existing);
  const tasksByProject: Record<string, { id: string; title: string }[]> = {};
  for (const t of tasks) (tasksByProject[t.projectId] ||= []).push({ id: t.id, title: t.title });

  return (
    <>
      <PageHeader title="Daily update" description="Share what you did, how long it took, and anything slowing you down." back={{ href: "/daily-reports", label: "Daily reports" }} actions={existing && <ReportStatusBadge status={existing.status} />} />
      {locked ? (
        <Card><EmptyState title="This report has been reviewed" description="Reviewed reports are locked so the record stays accurate." action={<Link className="text-sm font-medium text-blue-700 hover:underline" href={`/daily-reports/${existing!.id}`}>View the report</Link>} /></Card>
      ) : projects.length === 0 ? (
        <Card><EmptyState title="You’re not on a project yet" description="Ask a project manager to add you to a project so you can report time against it." /></Card>
      ) : (
        <>
          <ReportEditor key={date + (existing?.updatedAt.getTime() ?? 0)} today={isoDate(today)} dates={dates} projects={projects} tasksByProject={tasksByProject}
            initial={{ id: existing?.id, date, status: existing?.status ?? "DRAFT", completedToday: existing?.completedToday ?? "", inProgress: existing?.inProgress ?? "", progressUpdate: existing?.progressUpdate ?? "", planTomorrow: existing?.planTomorrow ?? "", blockers: existing?.blockers ?? "", mood: existing?.mood ?? "NORMAL", reviewComment: existing?.reviewComment, items: existing?.items.map((i) => ({ projectId: i.projectId, taskId: i.taskId, notes: i.notes, hoursSpent: i.hoursSpent })) ?? [] }} />
          {attachments.length > 0 && (
            <Card className="mt-6"><div className="border-b border-line px-5 py-3.5 text-sm font-semibold">Attached evidence</div><CardBody>
              <ul className="grid gap-2 sm:grid-cols-2">{attachments.map((a) => <li key={a.id}><a href={a.file.externalUrl ?? `/api/files/${a.file.id}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 rounded-lg border border-line p-2.5 hover:bg-slate-50">
                {a.file.kind === "IMAGE" ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={`/api/files/${a.file.id}`} alt="" className="size-10 rounded object-cover" /> : <span className="flex size-10 items-center justify-center rounded bg-slate-100 text-xs font-medium text-slate-500">{a.file.kind.replace("_LINK", "")}</span>}
                <span className="min-w-0 truncate text-sm font-medium">{a.file.name}</span></a></li>)}</ul></CardBody></Card>
          )}
        </>
      )}
    </>
  );
}
