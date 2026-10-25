"use client";

import { ActionForm } from "./action-form";
import { Field, Input, Select } from "./ui/form";
import { addTimeEntryAction, startTimerAction } from "@/actions/time";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Play } from "lucide-react";
import { Button } from "./ui/button";
import { useToast } from "./ui/toast";

/** Manual time entry. Pass `taskId` to lock it to one task, or `tasks` to show a task picker. */
export function TimeEntryForm({ taskId, tasks, today }: { taskId?: string; tasks?: { id: string; label: string }[]; today: string }) {
  return (
    <ActionForm action={addTimeEntryAction} submitLabel="Log time" resetOnSuccess className="grid gap-3">
      {taskId ? <input type="hidden" name="taskId" value={taskId} /> : (
        <Field label="Task" name="taskId"><Select name="taskId" defaultValue=""><option value="" disabled>Choose a task</option>{tasks?.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</Select></Field>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date" name="date"><Input name="date" type="date" defaultValue={today} max={today} required /></Field>
        <Field label="Hours" name="hours"><Input name="hours" type="number" min={0.25} max={24} step={0.25} placeholder="1.5" required /></Field>
      </div>
      <Field label="Note (optional)" name="note"><Input name="note" maxLength={500} /></Field>
    </ActionForm>
  );
}


/** Pick a task and start the timer. Starting a new timer stops any running one. */
export function TimerStarter({ tasks }: { tasks: { id: string; label: string }[] }) {
  const [taskId, setTaskId] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  const { toast } = useToast();
  return (
    <div className="flex flex-wrap items-end gap-3">
      <label className="grid min-w-56 flex-1 gap-1.5 text-sm font-medium">Task
        <Select value={taskId} onChange={(e) => setTaskId(e.target.value)}><option value="">Choose a task to track…</option>{tasks.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</Select>
      </label>
      <Button disabled={!taskId || pending} onClick={() => start(async () => { const r = await startTimerAction(taskId); if (r.ok) { toast("Timer started."); router.refresh(); } else toast(r.error, "error"); })}><Play className="size-4" aria-hidden />Start timer</Button>
    </div>
  );
}
