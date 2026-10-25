"use client";

import { ActionForm } from "./action-form";
import { Check, Field, Input, Select, Textarea } from "./ui/form";
import { PRIORITY_LABEL, PROJECT_STATUS_LABEL, ROLE_LABEL, type Role } from "@/lib/constants";
import { saveProjectAction } from "@/actions/projects";

type P = { id: string; name: string; role: Role };
export type ProjectInitial = {
  id?: string; name?: string; code?: string; description?: string; category?: string; status?: string; priority?: string; startDate?: string; endDate?: string; managerId?: string;
  memberIds?: string[]; clientIds?: string[]; budget?: string; estimatedHours?: number | null; goals?: string; clientName?: string;
};

export function ProjectForm({ people, initial = {}, canPickManager, currentUserId }: { people: P[]; initial?: ProjectInitial; canPickManager: boolean; currentUserId: string }) {
  const editing = !!initial.id;
  const managers = people.filter((p) => ["PROJECT_MANAGER", "ADMIN", "SUPER_ADMIN"].includes(p.role));
  const staff = people.filter((p) => p.role !== "CLIENT_VIEWER");
  const clients = people.filter((p) => p.role === "CLIENT_VIEWER");
  return (
    <ActionForm action={saveProjectAction} submitLabel={editing ? "Save project" : "Create project"} redirectTo={(d: { id: string } | undefined) => `/projects/${d?.id ?? initial.id}`}>
      <input type="hidden" name="id" value={initial.id ?? ""} />
      <div className="grid gap-4 md:grid-cols-3">
        <Field label="Project name" name="name" className="md:col-span-2"><Input name="name" defaultValue={initial.name} required maxLength={120} /></Field>
        <Field label="Project code" name="code" hint="Short, unique, e.g. ATLAS"><Input name="code" defaultValue={initial.code} required maxLength={12} className="uppercase" /></Field>
      </div>
      <Field label="Description" name="description"><Textarea name="description" rows={3} defaultValue={initial.description} /></Field>
      <div className="grid gap-4 md:grid-cols-4">
        <Field label="Category" name="category"><Input name="category" defaultValue={initial.category} placeholder="e.g. Web platform" /></Field>
        <Field label="Status" name="status"><Select name="status" defaultValue={initial.status ?? "PLANNING"}>{Object.entries(PROJECT_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
        <Field label="Priority" name="priority"><Select name="priority" defaultValue={initial.priority ?? "MEDIUM"}>{Object.entries(PRIORITY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
        <Field label="Client name" name="clientName"><Input name="clientName" defaultValue={initial.clientName} /></Field>
      </div>
      <div className="grid gap-4 md:grid-cols-4">
        <Field label="Start date" name="startDate"><Input name="startDate" type="date" defaultValue={initial.startDate} /></Field>
        <Field label="End date" name="endDate"><Input name="endDate" type="date" defaultValue={initial.endDate} /></Field>
        <Field label="Estimated hours" name="estimatedHours"><Input name="estimatedHours" type="number" min={0} defaultValue={initial.estimatedHours ?? ""} /></Field>
        <Field label="Budget (optional)" name="budget"><Input name="budget" type="number" min={0} step="0.01" defaultValue={initial.budget} /></Field>
      </div>
      <Field label="Project manager" name="managerId" hint={canPickManager ? undefined : "Project managers manage the projects they create."}>
        {canPickManager
          ? <Select name="managerId" defaultValue={initial.managerId ?? ""}><option value="">Unassigned</option>{managers.map((m) => <option key={m.id} value={m.id}>{m.name} ({ROLE_LABEL[m.role]})</option>)}</Select>
          : <><input type="hidden" name="managerId" value={initial.managerId ?? currentUserId} /><Select disabled value={initial.managerId ?? currentUserId} onChange={() => {}}>{managers.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</Select></>}
      </Field>
      <Field label="Goals" name="goals"><Textarea name="goals" rows={2} defaultValue={initial.goals} placeholder="What does success look like?" /></Field>
      <fieldset><legend className="mb-2 text-sm font-medium text-slate-800">Team members</legend>
        <div className="grid gap-2 rounded-md border border-line p-3 sm:grid-cols-2 lg:grid-cols-3">{staff.map((p) => <Check key={p.id} name="memberIds[]" value={p.id} defaultChecked={initial.memberIds?.includes(p.id)} label={<>{p.name} <span className="text-xs text-slate-500">{ROLE_LABEL[p.role]}</span></>} />)}</div>
      </fieldset>
      {clients.length > 0 && (
        <fieldset><legend className="mb-1 text-sm font-medium text-slate-800">Client viewers</legend><p className="mb-2 text-xs text-slate-500">Read-only access to this project and the files you share with them.</p>
          <div className="grid gap-2 rounded-md border border-line p-3 sm:grid-cols-2">{clients.map((p) => <Check key={p.id} name="clientIds[]" value={p.id} defaultChecked={initial.clientIds?.includes(p.id)} label={p.name} />)}</div>
        </fieldset>
      )}
    </ActionForm>
  );
}
