import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, Link2, Pencil, Timer } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { runningEntry, taskWhere } from "@/lib/access";
import { can, canUpdateTask, projectLevel } from "@/lib/permissions";
import { isOverdue, unmetDependencies } from "@/lib/business";
import { flat } from "@/lib/queries";
import { Avatar, Badge, Card, CardBody, CardHeader, PageHeader, ProgressBar } from "@/components/ui/primitives";
import { PriorityBadge, TaskStatusBadge } from "@/components/ui/chips";
import { buttonClass } from "@/components/ui/button";
import { ActivityFeed } from "@/components/views";
import { FilesPanel } from "@/components/files-panel";
import { CommentBody, CommentForm } from "@/components/comments";
import { TimeEntryForm } from "@/components/time-forms";
import { CompleteTaskButton, DeleteTaskButton, ProgressControl, ReviewPanel, StatusControl, SubtaskList, TimerButton } from "@/components/task-panels";
import { fmtDate, fmtDateTime, fmtHours, isoDate, timeAgo, todayUTC } from "@/lib/utils";
import { TASK_STATUS_LABEL, type TaskStatus } from "@/lib/constants";

export const dynamic = "force-dynamic";
export async function generateMetadata() { return { title: "Task" }; }

export default async function TaskPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  const { id } = await params;
  const sp = flat(await searchParams);
  const task = await db.task.findFirst({
    where: { AND: [taskWhere(user), { id }] },
    include: {
      project: { select: { id: true, name: true, code: true, managerId: true, manager: { select: { id: true, name: true } }, members: { include: { user: { select: { id: true, name: true } } } } } },
      milestone: { select: { id: true, name: true } }, creator: { select: { id: true, name: true } },
      assignees: { include: { user: { select: { id: true, name: true, avatarUrl: true } } } },
      subtasks: { orderBy: { position: "asc" } },
      dependsOn: { include: { dependsOn: { select: { id: true, title: true, status: true } } } },
      blocks: { include: { task: { select: { id: true, title: true, status: true } } } },
      comments: { where: { deletedAt: null }, orderBy: { createdAt: "asc" }, include: { author: { select: { id: true, name: true, avatarUrl: true } } } },
      attachments: { where: { file: { deletedAt: null } }, select: { id: true } },
    },
  });
  if (!task) notFound();

  const member = task.project.members.find((m) => m.userId === user.id) ?? null;
  const level = projectLevel(user, task.project, member);
  const assigneeIds = task.assignees.map((a) => a.userId);
  const canUpdate = canUpdateTask(level, user.id, { assigneeIds, creatorId: task.creatorId });
  const canReview = can(level, "review");
  const canComment = can(level, "comment");
  const readOnly = level === "client";

  const [activity, running] = await Promise.all([
    db.activityLog.findMany({ where: { taskId: id }, orderBy: { createdAt: "desc" }, take: 30, include: { actor: { select: { name: true, avatarUrl: true } } } }),
    canComment ? db.timeEntry.findFirst({ where: { userId: user.id, ...runningEntry }, select: { id: true, taskId: true, startedAt: true } }) : null,
  ]);
  const history = activity.filter((a) => a.action === "status_changed");
  const people = [...new Map([...task.project.members.filter((m) => !m.isClientAccess).map((m) => [m.user.id, m.user] as const), ...(task.project.manager ? [[task.project.manager.id, task.project.manager] as const] : [])]).values()].filter((p) => p.id !== user.id);
  const unmet = unmetDependencies(task.dependsOn.map((d) => d.dependsOn));
  const late = isOverdue(task);
  const today = isoDate(todayUTC());
  const done = task.status === "COMPLETED";
  const mover = { id: task.id, title: task.title, status: task.status as TaskStatus, canMove: canUpdate, canReview, requiredEvidence: task.requiredEvidence, evidenceCount: task.attachments.length };
  const lastRejection = task.approval === "REJECTED" ? [...task.comments].reverse().find((c) => c.body.startsWith("Rejected")) : null;

  return (
    <>
      <PageHeader back={{ href: `/projects/${task.project.id}?tab=tasks`, label: `${task.project.code} · ${task.project.name}` }}
        title={task.title}
        description={<span className="flex flex-wrap items-center gap-2"><TaskStatusBadge status={task.status} /><PriorityBadge priority={task.priority} />{late && <Badge tone="red">Overdue</Badge>}{task.requiredEvidence && <Badge tone="violet">Evidence required</Badge>}{task.labels.map((l) => <Badge key={l}>{l}</Badge>)}</span>}
        actions={<>
          {canUpdate && !done && task.status !== "WAITING_FOR_REVIEW" && <CompleteTaskButton taskId={id} requiredEvidence={task.requiredEvidence} evidenceCount={task.attachments.length} />}
          {can(level, "editAnyTask") && <Link href={`/tasks/${id}/edit`} className={buttonClass("secondary")}><Pencil className="size-4" aria-hidden />Edit</Link>}
          {can(level, "editAnyTask") && <DeleteTaskButton taskId={id} projectId={task.project.id} />}
        </>} />

      {task.status === "BLOCKED" && <div role="alert" className="mb-5 flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"><AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden /><div><p className="font-medium">Blocked</p><p>{task.blockerReason ?? "No reason recorded."}</p></div></div>}
      {task.status === "WAITING_FOR_REVIEW" && (
        <div className="mb-5 rounded-lg border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-900">
          <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-medium">Waiting for review</p><p className="mt-0.5 whitespace-pre-wrap">{task.completionNotes}</p></div>{canReview && <ReviewPanel taskId={id} status={task.status} />}</div>
        </div>
      )}
      {lastRejection && task.status === "REOPENED" && <div role="status" className="mb-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"><p className="font-medium">Sent back for changes</p><p className="mt-0.5 whitespace-pre-wrap">{lastRejection.body.replace(/^Rejected:\s*/, "")}</p></div>}
      {unmet.length > 0 && !done && <div role="status" className="mb-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">Waiting on {unmet.length} unfinished {unmet.length === 1 ? "dependency" : "dependencies"}: {unmet.map((u) => u.title).join(", ")}.</div>}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card><CardHeader title="Description" /><CardBody><p className="whitespace-pre-wrap text-sm text-slate-700">{task.description || "No description."}</p>
            {task.completionNotes && task.status !== "WAITING_FOR_REVIEW" && <div className="mt-4 border-t border-line pt-4"><h3 className="mb-1 text-sm font-medium">Completion notes</h3><p className="whitespace-pre-wrap text-sm text-slate-700">{task.completionNotes}</p></div>}</CardBody></Card>
          <Card><CardHeader title="Checklist" /><CardBody><SubtaskList taskId={id} subtasks={task.subtasks.map((s) => ({ id: s.id, title: s.title, done: s.done }))} canEdit={canUpdate && !done} /></CardBody></Card>
          <section id="evidence" className="scroll-mt-20">
            <Card>
              <CardHeader title="Evidence & files" description={task.requiredEvidence ? `Evidence is required before this task can be completed (${task.attachments.length} attached).` : "Screenshots, documents and links that show the work."} />
              <CardBody><FilesPanel user={user} basePath={`/tasks/${id}`} params={sp} projectId={task.project.id} taskId={id} canUpload={can(level, "upload") && !readOnly} compact /></CardBody>
            </Card>
          </section>
          {!readOnly && (
            <Card>
              <CardHeader title="Comments" description={`${task.comments.length} ${task.comments.length === 1 ? "comment" : "comments"}`} />
              <div className="divide-y divide-line">
                {task.comments.length === 0 && <p className="px-5 py-6 text-sm text-slate-500">No comments yet. Start the conversation.</p>}
                {task.comments.map((c) => (
                  <div key={c.id} className="flex gap-3 px-5 py-4"><Avatar name={c.author.name} src={c.author.avatarUrl} size={30} />
                    <div className="min-w-0 flex-1"><p className="text-sm"><span className="font-medium">{c.author.name}</span> <span className="text-xs text-slate-400">{timeAgo(c.createdAt)}</span></p><div className="mt-1"><CommentBody body={c.body} /></div></div></div>
                ))}
              </div>
              {canComment && <CardBody className="border-t border-line"><CommentForm taskId={id} people={people} /></CardBody>}
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Details" />
            <CardBody className="space-y-4 text-sm">
              <div><p className="mb-1 text-xs text-slate-500">Status</p>{canUpdate && !readOnly ? <StatusControl card={mover} /> : <TaskStatusBadge status={task.status} />}<p className="mt-1 text-xs text-slate-400">{TASK_STATUS_LABEL[task.status as TaskStatus]}{task.approval === "APPROVED" && task.completedAt ? ` · approved ${fmtDate(task.completedAt)}` : ""}</p></div>
              <div><p className="mb-1 text-xs text-slate-500">Progress</p>{canUpdate && !done ? <ProgressControl taskId={id} value={task.progress} disabled={task.status === "WAITING_FOR_REVIEW"} /> : <div className="flex items-center gap-2"><ProgressBar value={done ? 100 : task.progress} tone={done ? "green" : "blue"} /><span className="text-sm">{done ? 100 : task.progress}%</span></div>}</div>
              <div><p className="mb-1.5 text-xs text-slate-500">Assignees</p>{task.assignees.length ? <ul className="space-y-1.5">{task.assignees.map((a) => <li key={a.userId} className="flex items-center gap-2"><Avatar name={a.user.name} src={a.user.avatarUrl} size={24} />{a.user.name}</li>)}</ul> : <p className="text-slate-400">Unassigned</p>}</div>
              <dl className="grid grid-cols-2 gap-3">
                <div><dt className="text-xs text-slate-500">Start</dt><dd>{fmtDate(task.startDate)}</dd></div>
                <div><dt className="text-xs text-slate-500">Due</dt><dd className={late ? "font-medium text-red-600" : ""}>{fmtDate(task.dueDate)}</dd></div>
                <div><dt className="text-xs text-slate-500">Estimated</dt><dd>{task.estimatedHours != null ? fmtHours(task.estimatedHours) : "—"}</dd></div>
                <div><dt className="text-xs text-slate-500">Logged</dt><dd className={task.estimatedHours && task.loggedHours > task.estimatedHours ? "font-medium text-amber-700" : ""}>{fmtHours(task.loggedHours)}</dd></div>
                <div><dt className="text-xs text-slate-500">Milestone</dt><dd>{task.milestone ? <Link href={`/projects/${task.project.id}?tab=milestones`} className="hover:underline">{task.milestone.name}</Link> : "—"}</dd></div>
                <div><dt className="text-xs text-slate-500">Created by</dt><dd>{task.creator.name}</dd></div>
              </dl>
            </CardBody>
          </Card>
          {(task.dependsOn.length > 0 || task.blocks.length > 0) && (
            <Card><CardHeader title="Dependencies" /><CardBody className="space-y-3 text-sm">
              {task.dependsOn.length > 0 && <div><p className="mb-1.5 flex items-center gap-1.5 text-xs text-slate-500"><Link2 className="size-3.5" aria-hidden />Depends on</p><ul className="space-y-1.5">{task.dependsOn.map((d) => <li key={d.id} className="flex items-center justify-between gap-2"><Link href={`/tasks/${d.dependsOn.id}`} className="truncate hover:underline">{d.dependsOn.title}</Link><TaskStatusBadge status={d.dependsOn.status} /></li>)}</ul></div>}
              {task.blocks.length > 0 && <div><p className="mb-1.5 text-xs text-slate-500">Waiting on this</p><ul className="space-y-1.5">{task.blocks.map((d) => <li key={d.id} className="flex items-center justify-between gap-2"><Link href={`/tasks/${d.task.id}`} className="truncate hover:underline">{d.task.title}</Link><TaskStatusBadge status={d.task.status} /></li>)}</ul></div>}
            </CardBody></Card>
          )}
          {canComment && !done && (
            <Card><CardHeader title="Time" description={`${fmtHours(task.loggedHours)} logged${task.estimatedHours ? ` of ${fmtHours(task.estimatedHours)}` : ""}`} action={<Timer className="size-4 text-slate-400" aria-hidden />} />
              <CardBody className="space-y-4">
                <TimerButton taskId={id} running={running && running.taskId === id ? { id: running.id, startedAt: running.startedAt!.toISOString() } : null} runningElsewhere={!!running && running.taskId !== id} />
                <details className="text-sm"><summary className="cursor-pointer font-medium text-blue-700">Log time manually</summary><div className="mt-3"><TimeEntryForm taskId={id} today={today} /></div></details>
              </CardBody></Card>
          )}
          <Card><CardHeader title="Status history" />
            {history.length ? <ol className="space-y-3 p-5">{history.map((h) => { const m = h.meta as { from?: string; to?: string } | null; return (
              <li key={h.id} className="flex gap-3 text-sm"><span className="mt-1.5 size-2 shrink-0 rounded-full bg-blue-600" aria-hidden /><div><p>{m?.from && m?.to ? <><TaskStatusBadge status={m.from} /> → <TaskStatusBadge status={m.to} /></> : h.summary}</p><p className="mt-0.5 text-xs text-slate-500">{h.actor?.name ?? "System"} · {fmtDateTime(h.createdAt)}</p></div></li>); })}</ol> : <p className="px-5 py-6 text-sm text-slate-500">No status changes yet.</p>}
          </Card>
          <Card><CardHeader title="Activity" /><ActivityFeed items={activity.slice(0, 10)} /></Card>
        </div>
      </div>
    </>
  );
}
