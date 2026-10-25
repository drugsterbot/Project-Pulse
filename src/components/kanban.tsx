"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { GripVertical, Paperclip } from "lucide-react";
import { AvatarStack, Badge, ProgressBar } from "./ui/primitives";
import { PriorityBadge } from "./ui/chips";
import { Select } from "./ui/form";
import { useTaskMover } from "./task-mover";
import { useToast } from "./ui/toast";
import { BOARD_COLUMNS, TASK_STATUS_LABEL, TASK_STATUS_TONE, type TaskStatus } from "@/lib/constants";
import { cn } from "@/lib/utils";

export type KanbanCard = {
  id: string; title: string; projectCode: string; status: TaskStatus; priority: string; dueLabel: string | null; overdue: boolean; progress: number;
  assignees: { id: string; name: string; avatarUrl: string | null }[]; blockerReason: string | null; requiredEvidence: boolean; evidenceCount: number;
  checklist: [number, number]; canMove: boolean; canReview: boolean; unmetDeps: number;
};

/** Drag-and-drop board. Every card also has a "Move to" menu so keyboard and touch users can change status. */
export function Kanban({ cards: initial, columns = BOARD_COLUMNS, readOnly }: { cards: KanbanCard[]; columns?: TaskStatus[]; readOnly?: boolean }) {
  const [cards, setCards] = useState(initial);
  useEffect(() => setCards(initial), [initial]);
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<TaskStatus | null>(null);
  const { request: rawRequest, node: dialogNode, pending } = useTaskMover({
    onOptimistic: (id, status) => setCards((cs) => cs.map((c) => (c.id === id ? { ...c, status } : c))),
    onRevert: () => setCards(initial),
  });
  const { toast } = useToast();
  const request = (card: KanbanCard, to: TaskStatus) => { if (!readOnly) rawRequest(card, to); };

  return (
    <>
      <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-3 sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0" role="list" aria-label="Task board">
        {columns.map((col) => {
          const list = cards.filter((c) => c.status === col);
          return (
            <section key={col} role="listitem" aria-label={`${TASK_STATUS_LABEL[col]}, ${list.length} tasks`}
              onDragOver={(e) => { if (dragId) { e.preventDefault(); setOver(col); } }} onDragLeave={() => setOver((o) => (o === col ? null : o))}
              onDrop={(e) => { e.preventDefault(); setOver(null); const c = cards.find((x) => x.id === dragId); setDragId(null); if (c) request(c, col); }}
              className={cn("flex w-72 shrink-0 flex-col rounded-xl bg-slate-100/80 p-2 transition-colors", over === col && "bg-blue-100/70 ring-2 ring-blue-400")}>
              <header className="flex items-center justify-between px-2 py-1.5"><Badge tone={TASK_STATUS_TONE[col]} dot>{TASK_STATUS_LABEL[col]}</Badge><span className="text-xs font-medium text-slate-500">{list.length}</span></header>
              <ul className="flex min-h-24 flex-1 flex-col gap-2">
                {list.map((c) => (
                  <li key={c.id} draggable={!readOnly && c.canMove} onDragStart={(e) => { setDragId(c.id); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", c.id); }} onDragEnd={() => { setDragId(null); setOver(null); }}
                    className={cn("rounded-lg border border-line bg-white p-3 shadow-xs", !readOnly && c.canMove && "cursor-grab active:cursor-grabbing", dragId === c.id && "opacity-50")}>
                    <div className="flex items-start gap-1.5">
                      {!readOnly && c.canMove && <GripVertical className="mt-0.5 size-4 shrink-0 text-slate-300" aria-hidden />}
                      <Link href={`/tasks/${c.id}`} className="text-sm font-medium leading-snug hover:text-blue-700 hover:underline">{c.title}</Link>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5"><span className="text-xs font-medium text-slate-500">{c.projectCode}</span><PriorityBadge priority={c.priority} />
                      {c.requiredEvidence && <span title={`${c.evidenceCount} evidence item(s)`} className={cn("inline-flex items-center gap-0.5 text-xs", c.evidenceCount ? "text-green-700" : "text-amber-700")}><Paperclip className="size-3" aria-hidden />{c.evidenceCount}</span>}
                    </div>
                    {c.status === "BLOCKED" && c.blockerReason && <p className="mt-2 rounded bg-red-50 px-2 py-1 text-xs text-red-700">{c.blockerReason}</p>}
                    {c.unmetDeps > 0 && c.status !== "COMPLETED" && <p className="mt-2 text-xs text-amber-700">Waiting on {c.unmetDeps} task(s)</p>}
                    <div className="mt-2.5 flex items-center gap-2"><ProgressBar value={c.progress} tone={c.status === "COMPLETED" ? "green" : "blue"} /><span className="text-xs text-slate-500">{c.progress}%</span></div>
                    <div className="mt-2.5 flex items-center justify-between gap-2">
                      <AvatarStack people={c.assignees} size={22} max={3} />
                      <span className={cn("text-xs", c.overdue ? "font-medium text-red-600" : "text-slate-500")}>{c.dueLabel ?? ""}</span>
                    </div>
                    {!readOnly && c.canMove && (
                      <Select aria-label={`Move “${c.title}” to another column`} value={c.status} disabled={pending} className="mt-2.5 h-8 py-0 text-xs" onChange={(e) => request(c, e.target.value as TaskStatus)}>
                        {columns.map((s) => <option key={s} value={s}>{TASK_STATUS_LABEL[s]}</option>)}
                      </Select>
                    )}
                  </li>
                ))}
                {list.length === 0 && <li className="rounded-lg border border-dashed border-slate-300 px-3 py-6 text-center text-xs text-slate-400">No tasks</li>}
              </ul>
            </section>
          );
        })}
      </div>

      {dialogNode}
    </>
  );
}
