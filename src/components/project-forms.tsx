"use client";

import { ActionForm, ModalForm } from "./action-form";
import { Check, Field, Input, Select, Textarea } from "./ui/form";
import { PRIORITY_LABEL, RISK_STATUS_LABEL } from "@/lib/constants";
import { addProjectMemberAction, postAnnouncementAction, saveMilestoneAction, saveRiskAction } from "@/actions/projects";

type Person = { id: string; name: string };

export function MilestoneModal({ projectId, owners, initial, label = "Add milestone", size = "md" }: {
  projectId: string; owners: Person[]; label?: string; size?: "sm" | "md";
  initial?: { id: string; name: string; description: string | null; ownerId: string | null; dueDate: string; deliverables: string | null };
}) {
  return (
    <ModalForm trigger={label} triggerSize={size} triggerVariant={initial ? "ghost" : "secondary"} title={initial ? "Edit milestone" : "Add milestone"} wide>
      {(close) => (
        <ActionForm action={saveMilestoneAction} submitLabel={initial ? "Save milestone" : "Add milestone"} onSuccess={close}>
          <input type="hidden" name="projectId" value={projectId} /><input type="hidden" name="id" value={initial?.id ?? ""} />
          <Field label="Name" name="name"><Input name="name" defaultValue={initial?.name} required maxLength={120} /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Due date" name="dueDate"><Input name="dueDate" type="date" defaultValue={initial?.dueDate} required /></Field>
            <Field label="Owner" name="ownerId"><Select name="ownerId" defaultValue={initial?.ownerId ?? ""}><option value="">No owner</option>{owners.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</Select></Field>
          </div>
          <Field label="Description" name="description"><Textarea name="description" defaultValue={initial?.description ?? ""} /></Field>
          <Field label="Deliverables" name="deliverables"><Textarea name="deliverables" rows={2} defaultValue={initial?.deliverables ?? ""} /></Field>
        </ActionForm>
      )}
    </ModalForm>
  );
}

export function RiskModal({ projectId, owners, initial, label = "Log risk", size = "md" }: {
  projectId: string; owners: Person[]; label?: string; size?: "sm" | "md";
  initial?: { id: string; title: string; description: string | null; severity: string; status: string; mitigation: string | null; ownerId: string | null };
}) {
  return (
    <ModalForm trigger={label} triggerSize={size} triggerVariant={initial ? "ghost" : "secondary"} title={initial ? "Edit risk" : "Log a risk"} wide>
      {(close) => (
        <ActionForm action={saveRiskAction} submitLabel={initial ? "Save risk" : "Log risk"} onSuccess={close}>
          <input type="hidden" name="projectId" value={projectId} /><input type="hidden" name="id" value={initial?.id ?? ""} />
          <Field label="Title" name="title"><Input name="title" defaultValue={initial?.title} required maxLength={160} /></Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Severity" name="severity"><Select name="severity" defaultValue={initial?.severity ?? "MEDIUM"}>{Object.entries(PRIORITY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
            <Field label="Status" name="status"><Select name="status" defaultValue={initial?.status ?? "OPEN"}>{Object.entries(RISK_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
            <Field label="Owner" name="ownerId"><Select name="ownerId" defaultValue={initial?.ownerId ?? ""}><option value="">No owner</option>{owners.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</Select></Field>
          </div>
          <Field label="Description" name="description"><Textarea name="description" defaultValue={initial?.description ?? ""} /></Field>
          <Field label="Mitigation" name="mitigation"><Textarea name="mitigation" rows={2} defaultValue={initial?.mitigation ?? ""} /></Field>
        </ActionForm>
      )}
    </ModalForm>
  );
}

export function AnnouncementForm({ projectId }: { projectId: string }) {
  return (
    <ActionForm action={postAnnouncementAction} submitLabel="Post announcement" resetOnSuccess>
      <input type="hidden" name="projectId" value={projectId} />
      <Field label="Title" name="title"><Input name="title" required maxLength={160} /></Field>
      <Field label="Message" name="body"><Textarea name="body" rows={3} required /></Field>
      <Check name="pinned" label="Pin to the top" />
    </ActionForm>
  );
}

export function AddMemberForm({ projectId, candidates }: { projectId: string; candidates: (Person & { roleLabel: string })[] }) {
  if (!candidates.length) return <p className="text-sm text-slate-500">Everyone in the organization is already on this project.</p>;
  return (
    <ActionForm action={addProjectMemberAction} submitLabel="Add to project" className="flex flex-wrap items-end gap-3" resetOnSuccess>
      <input type="hidden" name="projectId" value={projectId} />
      <Field label="Add a person" name="userId" className="min-w-56 flex-1"><Select name="userId" defaultValue=""><option value="" disabled>Choose a person</option>{candidates.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.roleLabel})</option>)}</Select></Field>
    </ActionForm>
  );
}

export function AnnouncementModal({ projectId }: { projectId: string }) {
  return (
    <ModalForm trigger="New announcement" triggerSize="sm" title="Post an announcement" description="Everyone on the project is notified.">
      {(close) => (
        <ActionForm action={postAnnouncementAction} submitLabel="Post announcement" onSuccess={close}>
          <input type="hidden" name="projectId" value={projectId} />
          <Field label="Title" name="title"><Input name="title" required maxLength={160} /></Field>
          <Field label="Message" name="body"><Textarea name="body" rows={3} required /></Field>
          <Check name="pinned" label="Pin to the top" />
        </ActionForm>
      )}
    </ModalForm>
  );
}
