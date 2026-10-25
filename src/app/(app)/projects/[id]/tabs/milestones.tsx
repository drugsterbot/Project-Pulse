import Link from "next/link";
import { Flag, Trash2 } from "lucide-react";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { Avatar, Card, EmptyState, ProgressBar } from "@/components/ui/primitives";
import { HealthBadge, TaskStatusBadge } from "@/components/ui/chips";
import { ActionButton } from "@/components/action-form";
import { MilestoneModal } from "@/components/project-forms";
import { deleteMilestoneAction } from "@/actions/projects";
import { MILESTONE_STATUS_LABEL } from "@/lib/constants";
import { DAY_MS, cn, fmtDate, isoDate, todayUTC } from "@/lib/utils";
import type { Ctx } from "./types";

export async function MilestonesTab({ ctx }: { ctx: Ctx }) {
  const { id, level, user } = ctx;
  const [milestones, owners] = await Promise.all([
    db.milestone.findMany({ where: { projectId: id, deletedAt: null }, orderBy: { dueDate: "asc" }, include: { owner: { select: { name: true, avatarUrl: true } }, tasks: { where: { deletedAt: null }, select: { id: true, title: true, status: true, progress: true } } } }),
    can(level, "createMilestone") ? db.user.findMany({ where: { orgId: user.orgId, status: "ACTIVE", role: { not: "CLIENT_VIEWER" } }, select: { id: true, name: true }, orderBy: { name: "asc" } }) : [],
  ]);
  const today = todayUTC();
  const manage = can(level, "createMilestone");
  return (
    <div className="space-y-4">
      {manage && <div className="flex justify-end"><MilestoneModal projectId={id} owners={owners} /></div>}
      {milestones.length === 0 ? <Card><EmptyState title="No milestones yet" description="Milestones group tasks into deliverables. Progress and health update automatically from their tasks." icon={<Flag className="size-5" />} action={manage ? <MilestoneModal projectId={id} owners={owners} /> : undefined} /></Card> : (
        <ul className="space-y-4">
          {milestones.map((m) => {
            const late = m.status !== "COMPLETED" && m.dueDate < today;
            const days = Math.ceil((today.getTime() - m.dueDate.getTime()) / DAY_MS);
            return (
              <li key={m.id}>
                <Card className={cn(late && "border-red-300")}>
                  <div className="flex flex-wrap items-start justify-between gap-3 p-5">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2"><h3 className="text-base font-semibold">{m.name}</h3><HealthBadge health={m.health} /><span className="text-xs text-slate-500">{MILESTONE_STATUS_LABEL[m.status]}</span></div>
                      {m.description && <p className="mt-1 text-sm text-slate-600">{m.description}</p>}
                      <p className={cn("mt-2 text-sm", late ? "font-medium text-red-600" : "text-slate-600")}>{late ? `Overdue by ${days} day${days === 1 ? "" : "s"} (was due ${fmtDate(m.dueDate)})` : `Due ${fmtDate(m.dueDate)}`}</p>
                      {m.deliverables && <p className="mt-1 text-sm text-slate-600"><span className="font-medium text-slate-800">Deliverables:</span> {m.deliverables}</p>}
                      {m.owner && <p className="mt-2 flex items-center gap-2 text-sm text-slate-600"><Avatar name={m.owner.name} src={m.owner.avatarUrl} size={20} />Owner: {m.owner.name}</p>}
                    </div>
                    <div className="flex items-center gap-1">
                      {manage && <MilestoneModal projectId={id} owners={owners} label="Edit" size="sm" initial={{ id: m.id, name: m.name, description: m.description, ownerId: m.ownerId, dueDate: isoDate(m.dueDate), deliverables: m.deliverables }} />}
                      {manage && <ActionButton action={deleteMilestoneAction.bind(null, m.id)} variant="ghost" aria-label={`Delete ${m.name}`} confirm={{ title: "Delete this milestone?", description: "Its tasks stay in the project but are no longer grouped under it.", confirmLabel: "Delete milestone" }}><Trash2 className="size-4 text-red-600" /></ActionButton>}
                    </div>
                  </div>
                  <div className="border-t border-line px-5 py-3">
                    <div className="flex items-center gap-3"><ProgressBar value={m.progress} tone={m.health === "DELAYED" ? "red" : m.health === "AT_RISK" ? "amber" : m.progress >= 100 ? "green" : "blue"} /><span className="w-10 text-right text-sm font-medium">{m.progress}%</span></div>
                    <details className="mt-3"><summary className="cursor-pointer text-sm font-medium text-blue-700">{m.tasks.length} related task{m.tasks.length === 1 ? "" : "s"}</summary>
                      <ul className="mt-2 divide-y divide-line rounded-md border border-line">{m.tasks.map((t) => <li key={t.id} className="flex items-center justify-between gap-3 px-3 py-2"><Link href={`/tasks/${t.id}`} className="truncate text-sm hover:underline">{t.title}</Link><TaskStatusBadge status={t.status} /></li>)}{m.tasks.length === 0 && <li className="px-3 py-2 text-sm text-slate-500">No tasks linked yet. Choose this milestone when creating a task.</li>}</ul>
                    </details>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
void Trash2;
