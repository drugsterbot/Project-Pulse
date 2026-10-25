"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Circle, Loader2, Play, Square, Trash2 } from "lucide-react";
import { ActionButton, ActionForm, ModalForm } from "./action-form";
import { Button } from "./ui/button";
import { Field, Select, Textarea } from "./ui/form";
import { useToast } from "./ui/toast";
import { useTaskMover, type MoverCard } from "./task-mover";
import { TASK_STATUS_LABEL, BOARD_COLUMNS, type TaskStatus } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { addSubtaskAction, completeTaskAction, deleteSubtaskAction, deleteTaskAction, reviewTaskAction, setProgressAction, toggleSubtaskAction } from "@/actions/tasks";
import { startTimerAction, stopTimerAction } from "@/actions/time";

export function StatusControl({ card }: { card: MoverCard }) {
  const { request, node, pending } = useTaskMover();
  return (
    <>
      <Select aria-label="Task status" value={card.status} disabled={!card.canMove || pending} onChange={(e) => request(card, e.target.value as TaskStatus)} className="h-9 py-0">
        {BOARD_COLUMNS.map((s) => <option key={s} value={s}>{TASK_STATUS_LABEL[s]}</option>)}
      </Select>
      {node}
    </>
  );
}

/** Member action: mark finished. Requires notes, and evidence when the task demands it. */
export function CompleteTaskButton({ taskId, requiredEvidence, evidenceCount }: { taskId: string; requiredEvidence: boolean; evidenceCount: number }) {
  const blocked = requiredEvidence && evidenceCount === 0;
  return (
    <ModalForm trigger="Mark ready for review" triggerVariant="primary" title="Send for review" description="Describe what you finished. Your manager or lead will approve it or send it back.">
      {(close) => (
        <ActionForm action={completeTaskAction} submitLabel="Send for review" onSuccess={close}>
          <input type="hidden" name="taskId" value={taskId} />
          {blocked && <p role="alert" className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">This task requires evidence. Attach a file or link in the Evidence section first. <Link href="#evidence" onClick={close} className="font-medium underline">Go to evidence</Link></p>}
          <Field label="Completion notes" name="notes"><Textarea name="notes" rows={4} required autoFocus placeholder="What was done and how it was checked" /></Field>
        </ActionForm>
      )}
    </ModalForm>
  );
}

/** Reviewer controls for a task waiting for review (or a completed task that needs reopening). */
export function ReviewPanel({ taskId, status }: { taskId: string; status: string }) {
  if (status === "COMPLETED") {
    return (
      <ModalForm trigger="Reopen task" title="Reopen this task" description="The assignees are notified. Add a note so they know what changed." triggerSize="sm">
        {(close) => (
          <ActionForm action={reviewTaskAction} submitLabel="Reopen" onSuccess={close}>
            <input type="hidden" name="taskId" value={taskId} /><input type="hidden" name="decision" value="REOPEN" />
            <Field label="Note (optional)" name="comment"><Textarea name="comment" rows={3} /></Field>
          </ActionForm>
        )}
      </ModalForm>
    );
  }
  return (
    <div className="flex flex-wrap gap-2">
      <ModalForm trigger="Approve" triggerVariant="success" title="Approve this task" description="Marks the task as completed and notifies the assignees.">
        {(close) => (
          <ActionForm action={reviewTaskAction} submitLabel="Approve" submitVariant="success" onSuccess={close}>
            <input type="hidden" name="taskId" value={taskId} /><input type="hidden" name="decision" value="APPROVE" />
            <Field label="Comment (optional)" name="comment"><Textarea name="comment" rows={3} /></Field>
          </ActionForm>
        )}
      </ModalForm>
      <ModalForm trigger="Reject" triggerVariant="danger" title="Reject this task" description="The task is reopened for the assignees. Explain what needs to change.">
        {(close) => (
          <ActionForm action={reviewTaskAction} submitLabel="Reject and reopen" submitVariant="danger" onSuccess={close}>
            <input type="hidden" name="taskId" value={taskId} /><input type="hidden" name="decision" value="REJECT" />
            <Field label="What needs to change?" name="comment"><Textarea name="comment" rows={4} required autoFocus /></Field>
          </ActionForm>
        )}
      </ModalForm>
    </div>
  );
}

export function SubtaskList({ taskId, subtasks, canEdit }: { taskId: string; subtasks: { id: string; title: string; done: boolean }[]; canEdit: boolean }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const { toast } = useToast();
  const done = subtasks.filter((s) => s.done).length;
  const run = (fn: () => Promise<{ ok: boolean } & { error?: string }>) => start(async () => { const r = await fn(); if (!r.ok) toast(r.error ?? "Couldn’t update.", "error"); router.refresh(); });
  return (
    <div>
      {subtasks.length > 0 && <p className="mb-2 text-xs text-slate-500">{done} of {subtasks.length} done</p>}
      <ul className="space-y-1">
        {subtasks.map((s) => (
          <li key={s.id} className="group flex items-center gap-2 rounded-md px-1 py-1 hover:bg-slate-50">
            <button disabled={!canEdit || pending} onClick={() => run(() => toggleSubtaskAction(s.id))} aria-pressed={s.done} aria-label={`${s.done ? "Mark not done" : "Mark done"}: ${s.title}`} className="shrink-0 text-slate-400 hover:text-blue-600 disabled:cursor-default disabled:hover:text-slate-400">
              {s.done ? <CheckCircle2 className="size-5 text-green-600" /> : <Circle className="size-5" />}
            </button>
            <span className={cn("flex-1 text-sm", s.done && "text-slate-400 line-through")}>{s.title}</span>
            {canEdit && <button aria-label={`Delete ${s.title}`} disabled={pending} onClick={() => run(() => deleteSubtaskAction(s.id))} className="rounded p-1 text-slate-400 opacity-0 hover:bg-red-50 hover:text-red-600 focus:opacity-100 group-hover:opacity-100"><Trash2 className="size-4" /></button>}
          </li>
        ))}
        {subtasks.length === 0 && <li className="text-sm text-slate-500">No checklist items yet.</li>}
      </ul>
      {canEdit && (
        <ActionForm action={addSubtaskAction} hideSubmit resetOnSuccess className="mt-3 flex gap-2">
          <input type="hidden" name="taskId" value={taskId} />
          <input name="title" aria-label="New checklist item" placeholder="Add a checklist item" maxLength={200} className="h-9 min-w-0 flex-1 rounded-md border border-slate-300 px-3 text-sm focus-visible:border-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30" />
          <Button type="submit" variant="secondary">Add</Button>
        </ActionForm>
      )}
    </div>
  );
}

export function ProgressControl({ taskId, value, disabled }: { taskId: string; value: number; disabled?: boolean }) {
  const [v, setV] = useState(value);
  const [pending, start] = useTransition();
  const router = useRouter();
  const { toast } = useToast();
  useEffect(() => setV(value), [value]);
  const commit = () => { if (v !== value) start(async () => { const r = await setProgressAction(taskId, v); if (!r.ok) { toast(r.error, "error"); setV(value); } router.refresh(); }); };
  return (
    <div className="flex items-center gap-3">
      <input type="range" min={0} max={100} step={5} value={v} disabled={disabled || pending} onChange={(e) => setV(Number(e.target.value))} onMouseUp={commit} onTouchEnd={commit} onKeyUp={commit} aria-label="Progress percentage" className="h-2 flex-1 accent-blue-600" />
      <span className="w-10 text-right text-sm font-medium tabular-nums">{v}%</span>
    </div>
  );
}

export function TimerButton({ taskId, running, runningElsewhere }: { taskId: string; running: { id: string; startedAt: string } | null; runningElsewhere?: boolean }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { if (!running) return; const i = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(i); }, [running]);
  if (running) {
    const s = Math.max(0, Math.floor((now - new Date(running.startedAt).getTime()) / 1000));
    const fmt = `${String(Math.floor(s / 3600)).padStart(2, "0")}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
    return (
      <div className="flex items-center gap-3">
        <span className="font-mono text-lg font-semibold tabular-nums text-blue-700" role="timer" aria-live="off">{fmt}</span>
        <ActionButton action={stopTimerAction.bind(null, running.id)} variant="danger" size="md" successMessage="Timer stopped and time logged."><Square className="size-4" aria-hidden />Stop</ActionButton>
      </div>
    );
  }
  return <ActionButton action={startTimerAction.bind(null, taskId)} variant="secondary" size="md" successMessage="Timer started."><Play className="size-4" aria-hidden />{runningElsewhere ? "Switch timer to this task" : "Start timer"}</ActionButton>;
}
void Loader2;

export function DeleteTaskButton({ taskId, projectId }: { taskId: string; projectId: string }) {
  const router = useRouter();
  return (
    <ActionButton action={deleteTaskAction.bind(null, taskId)} variant="ghost" size="md" className="text-red-600 hover:bg-red-50" onDone={() => router.push(`/projects/${projectId}?tab=tasks`)}
      confirm={{ title: "Delete this task?", description: "The task is removed from boards and reports. Its activity history is kept.", confirmLabel: "Delete task" }}>
      <Trash2 className="size-4" aria-hidden />Delete
    </ActionButton>
  );
}
