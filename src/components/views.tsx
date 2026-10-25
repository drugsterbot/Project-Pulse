import Link from "next/link";
import { AlertTriangle, CheckCircle2, ChevronRight, Info, Lightbulb } from "lucide-react";
import { Avatar, AvatarStack, Badge, EmptyState, ProgressBar, Table, Td, Th } from "./ui/primitives";
import { PriorityBadge, TaskStatusBadge } from "./ui/chips";
import { isOverdue } from "@/lib/business";
import { cn, fmtShortDate, timeAgo } from "@/lib/utils";
import type { TaskCard } from "@/lib/queries";
import type { Insight } from "@/lib/ai/types";
import type { TaskStatus } from "@/lib/constants";

export function DueCell({ task }: { task: { status: string; dueDate: Date | null } }) {
  if (!task.dueDate) return <span className="text-slate-400">No date</span>;
  const late = isOverdue({ status: task.status as TaskStatus, dueDate: task.dueDate });
  return <span className={cn("whitespace-nowrap", late && "font-medium text-red-600")}>{fmtShortDate(task.dueDate)}{late && <span className="ml-1.5 text-xs">overdue</span>}</span>;
}

export function TaskTable({ tasks, showProject = true, emptyTitle = "No tasks here", emptyDescription }: { tasks: TaskCard[]; showProject?: boolean; emptyTitle?: string; emptyDescription?: string }) {
  if (!tasks.length) return <EmptyState title={emptyTitle} description={emptyDescription} />;
  return (
    <Table>
      <thead><tr><Th>Task</Th><Th>Status</Th><Th>Priority</Th><Th>Assignees</Th><Th>Due</Th><Th className="w-32">Progress</Th></tr></thead>
      <tbody>
        {tasks.map((t) => (
          <tr key={t.id} className="hover:bg-slate-50/70">
            <Td className="max-w-md">
              <Link href={`/tasks/${t.id}`} className="font-medium text-ink hover:text-blue-700 hover:underline">{t.title}</Link>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-slate-500">
                {showProject && <span className="font-medium text-slate-600">{t.project.code}</span>}
                {t.milestone && <span>{t.milestone.name}</span>}
                {t.subtasks.length > 0 && <span>{t.subtasks.filter((s) => s.done).length}/{t.subtasks.length} checklist</span>}
              </div>
              {t.status === "BLOCKED" && t.blockerReason && <p className="mt-1 text-xs text-red-700">Blocked: {t.blockerReason}</p>}
            </Td>
            <Td><TaskStatusBadge status={t.status} /></Td>
            <Td><PriorityBadge priority={t.priority} /></Td>
            <Td><AvatarStack people={t.assignees.map((a) => a.user)} /></Td>
            <Td><DueCell task={t} /></Td>
            <Td><div className="flex items-center gap-2"><ProgressBar value={t.status === "COMPLETED" ? 100 : t.progress} tone={t.status === "COMPLETED" ? "green" : "blue"} /><span className="w-8 text-xs text-slate-500">{t.status === "COMPLETED" ? 100 : t.progress}%</span></div></Td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}

/** Compact one-line task rows for dashboard lists. */
export function TaskList({ tasks, empty }: { tasks: TaskCard[]; empty: string }) {
  if (!tasks.length) return <p className="px-5 py-6 text-sm text-slate-500">{empty}</p>;
  return (
    <ul className="divide-y divide-line">
      {tasks.map((t) => (
        <li key={t.id}>
          <Link href={`/tasks/${t.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{t.title}</p>
              <p className="truncate text-xs text-slate-500">{t.project.code} · <DueCell task={t} /></p>
            </div>
            <PriorityBadge priority={t.priority} />
            <ChevronRight className="size-4 shrink-0 text-slate-400" aria-hidden />
          </Link>
        </li>
      ))}
    </ul>
  );
}

export type ActivityRow = { id: string; summary: string; createdAt: Date; actor: { name: string; avatarUrl: string | null } | null; project?: { id: string; code: string } | null; taskId?: string | null };
export function ActivityFeed({ items, empty = "No activity yet." }: { items: ActivityRow[]; empty?: string }) {
  if (!items.length) return <p className="px-5 py-6 text-sm text-slate-500">{empty}</p>;
  return (
    <ul className="divide-y divide-line">
      {items.map((a) => (
        <li key={a.id} className="flex items-start gap-3 px-5 py-3">
          <Avatar name={a.actor?.name ?? "System"} src={a.actor?.avatarUrl} size={28} />
          <div className="min-w-0 flex-1">
            <p className="text-sm text-slate-800">
              {a.taskId ? <Link href={`/tasks/${a.taskId}`} className="hover:underline">{a.summary}</Link> : a.summary}
            </p>
            <p className="mt-0.5 text-xs text-slate-500">{timeAgo(a.createdAt)}{a.project && <> · <Link href={`/projects/${a.project.id}`} className="hover:underline">{a.project.code}</Link></>}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

const SEV = { high: ["red", AlertTriangle], medium: ["amber", AlertTriangle], low: ["blue", Lightbulb], info: ["slate", Info] } as const;
/** An insight with the data that produced it, so people can judge whether to trust it. */
export function InsightCard({ insight, projectLabel }: { insight: Insight; projectLabel?: string }) {
  const [tone, Icon] = SEV[insight.severity];
  return (
    <li className="rounded-lg border border-line bg-white p-4">
      <div className="flex items-start gap-3">
        <span className={cn("mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full", { red: "bg-red-50 text-red-600", amber: "bg-amber-50 text-amber-600", blue: "bg-blue-50 text-blue-600", slate: "bg-slate-100 text-slate-600" }[tone])}><Icon className="size-4" aria-hidden /></span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2"><p className="text-sm font-medium text-ink">{insight.title}</p>{projectLabel && <Badge>{projectLabel}</Badge>}</div>
          <p className="mt-0.5 text-sm text-slate-600">{insight.detail}</p>
          <details className="group mt-2 text-xs text-slate-500">
            <summary className="cursor-pointer select-none font-medium text-blue-700 hover:underline">Why am I seeing this?</summary>
            <p className="mt-1.5 text-slate-600">{insight.reason}</p>
            {insight.sources.length > 0 && (
              <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">Source data:{insight.sources.map((s) => s.href ? <Link key={s.type + s.id} href={s.href} className="font-medium text-blue-700 hover:underline">{s.label}</Link> : <span key={s.type + s.id} className="font-medium text-slate-700">{s.label}</span>)}</p>
            )}
          </details>
        </div>
      </div>
    </li>
  );
}
export const AllClear = ({ text }: { text: string }) => <p className="flex items-center gap-2 px-5 py-6 text-sm text-slate-600"><CheckCircle2 className="size-4 text-green-600" aria-hidden />{text}</p>;
