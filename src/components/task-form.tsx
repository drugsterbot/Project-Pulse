"use client";

import { useState } from "react";
import { ActionForm } from "./action-form";
import { Check, Field, Input, Select, Textarea } from "./ui/form";
import { PRIORITY_LABEL } from "@/lib/constants";
import { saveTaskAction } from "@/actions/tasks";

export type TaskFormData = {
  projects: { id: string; name: string; code: string }[];
  members: Record<string, { id: string; name: string }[]>;
  milestones: Record<string, { id: string; name: string }[]>;
  tasks: Record<string, { id: string; title: string }[]>;
};
export type TaskInitial = {
  id?: string; projectId?: string; title?: string; description?: string; milestoneId?: string; priority?: string; startDate?: string; dueDate?: string; estimatedHours?: number | null;
  progress?: number; labels?: string[]; requiredEvidence?: boolean; assigneeIds?: string[]; dependsOnIds?: string[];
};

export function TaskForm({ data, initial = {} }: { data: TaskFormData; initial?: TaskInitial }) {
  const editing = !!initial.id;
  const [projectId, setProjectId] = useState(initial.projectId ?? data.projects[0]?.id ?? "");
  const [assignees, setAssignees] = useState<string[]>(initial.assigneeIds ?? []);
  const toggle = (id: string) => setAssignees((a) => (a.includes(id) ? a.filter((x) => x !== id) : [...a, id]));
  const members = data.members[projectId] ?? [];
  return (
    <ActionForm action={saveTaskAction} submitLabel={editing ? "Save task" : "Create task"} redirectTo={(d: { id: string } | undefined) => `/tasks/${d?.id ?? initial.id}`}>
      <input type="hidden" name="id" value={initial.id ?? ""} />
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Project" name="projectId">
          {editing ? <><input type="hidden" name="projectId" value={projectId} /><Select disabled value={projectId} onChange={() => {}}>{data.projects.map((p) => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}</Select></> :
            <Select name="projectId" value={projectId} onChange={(e) => { setProjectId(e.target.value); setAssignees([]); }}>{data.projects.map((p) => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}</Select>}
        </Field>
        <Field label="Milestone" name="milestoneId"><Select name="milestoneId" key={projectId} defaultValue={initial.milestoneId ?? ""}><option value="">No milestone</option>{(data.milestones[projectId] ?? []).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</Select></Field>
      </div>
      <Field label="Title" name="title"><Input name="title" defaultValue={initial.title} required maxLength={200} /></Field>
      <Field label="Description" name="description"><Textarea name="description" rows={4} defaultValue={initial.description} /></Field>
      <div className="grid gap-4 md:grid-cols-4">
        <Field label="Priority" name="priority"><Select name="priority" defaultValue={initial.priority ?? "MEDIUM"}>{Object.entries(PRIORITY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
        <Field label="Start date" name="startDate"><Input name="startDate" type="date" defaultValue={initial.startDate} /></Field>
        <Field label="Due date" name="dueDate"><Input name="dueDate" type="date" defaultValue={initial.dueDate} /></Field>
        <Field label="Estimated hours" name="estimatedHours"><Input name="estimatedHours" type="number" min={0} step={0.5} defaultValue={initial.estimatedHours ?? ""} /></Field>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Labels" name="labels" hint="Comma separated, e.g. backend, security"><Input name="labels" defaultValue={initial.labels?.join(", ")} /></Field>
        {editing && <Field label="Progress (%)" name="progress"><Input name="progress" type="number" min={0} max={100} defaultValue={initial.progress ?? 0} /></Field>}
      </div>
      <fieldset className="grid gap-2"><legend className="mb-1 text-sm font-medium text-slate-800">Assignees</legend>
        {members.length === 0 ? <p className="text-sm text-slate-500">This project has no team members yet. Add people from the project’s Team tab.</p> :
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{members.map((m) => <Check key={m.id} name="assigneeIds[]" value={m.id} checked={assignees.includes(m.id)} onChange={() => toggle(m.id)} label={m.name} />)}</div>}
      </fieldset>
      <fieldset className="grid gap-2"><legend className="mb-1 text-sm font-medium text-slate-800">Depends on</legend>
        {(data.tasks[projectId] ?? []).filter((t) => t.id !== initial.id).length === 0 ? <p className="text-sm text-slate-500">No other tasks in this project.</p> :
          <div className="grid max-h-44 gap-2 overflow-y-auto rounded-md border border-line p-3 sm:grid-cols-2">{(data.tasks[projectId] ?? []).filter((t) => t.id !== initial.id).map((t) => <Check key={`${projectId}-${t.id}`} name="dependsOnIds[]" value={t.id} defaultChecked={initial.dependsOnIds?.includes(t.id)} label={t.title} />)}</div>}
      </fieldset>
      <Check name="requiredEvidence" defaultChecked={initial.requiredEvidence} label="Evidence required before this task can be completed" />
    </ActionForm>
  );
}
