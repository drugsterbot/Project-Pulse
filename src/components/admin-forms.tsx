"use client";

import { useState } from "react";
import { ActionForm, ModalForm } from "./action-form";
import { Check, Field, Input, Select } from "./ui/form";
import { ROLE_LABEL, type Role } from "@/lib/constants";
import { createDepartmentAction, createUserAction, saveTeamAction, updateUserAction } from "@/actions/admin";

type Dept = { id: string; name: string };
export function CreateUserModal({ roles, departments }: { roles: Role[]; departments: Dept[] }) {
  return (
    <ModalForm trigger="Add user" triggerVariant="primary" title="Add a user" description="Share the temporary password securely. They can change it from their profile." wide>
      {(close) => (
        <ActionForm action={createUserAction} submitLabel="Create user" onSuccess={close}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Full name" name="name"><Input name="name" required maxLength={100} /></Field>
            <Field label="Email" name="email"><Input name="email" type="email" required /></Field>
            <Field label="Role" name="role"><Select name="role" defaultValue="TEAM_MEMBER">{roles.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</Select></Field>
            <Field label="Department" name="departmentId"><Select name="departmentId" defaultValue=""><option value="">None</option>{departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select></Field>
            <Field label="Temporary password" name="password" hint="10+ characters with upper, lower and a number"><Input name="password" type="text" autoComplete="off" required /></Field>
            <Field label="Weekly capacity (hours)" name="weeklyCapacityHours"><Input name="weeklyCapacityHours" type="number" min={1} max={80} defaultValue={40} /></Field>
          </div>
        </ActionForm>
      )}
    </ModalForm>
  );
}

export function EditUserModal({ user, roles, departments, self, locked }: { user: { id: string; name: string; role: Role; status: string; departmentId: string | null; weeklyCapacityHours: number }; roles: Role[]; departments: Dept[]; self: boolean; locked: boolean }) {
  return (
    <ModalForm trigger={locked ? "View" : "Edit"} triggerVariant="ghost" triggerSize="sm" title={`Edit ${user.name}`} description={locked ? "Admins can’t modify Super Admin accounts." : undefined}>
      {(close) => (
        <ActionForm action={updateUserAction} submitLabel="Save changes" onSuccess={close} hideSubmit={locked}>
          <input type="hidden" name="id" value={user.id} />
          <Field label="Role" name="role"><Select name="role" defaultValue={user.role} disabled={locked || self}>{[...new Set([user.role, ...roles])].map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</Select></Field>
          {(locked || self) && <input type="hidden" name="role" value={user.role} />}
          <Field label="Account status" name="status" hint={self ? "You can’t change your own status." : "Inactive and suspended accounts can’t sign in."}><Select name="status" defaultValue={user.status} disabled={locked || self}><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option><option value="SUSPENDED">Suspended</option></Select></Field>
          {(locked || self) && <input type="hidden" name="status" value={user.status} />}
          <Field label="Department" name="departmentId"><Select name="departmentId" defaultValue={user.departmentId ?? ""} disabled={locked}><option value="">None</option>{departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select></Field>
          <Field label="Weekly capacity (hours)" name="weeklyCapacityHours"><Input name="weeklyCapacityHours" type="number" min={1} max={80} defaultValue={user.weeklyCapacityHours} disabled={locked} /></Field>
        </ActionForm>
      )}
    </ModalForm>
  );
}

export function DepartmentForm() {
  return (
    <ActionForm action={createDepartmentAction} submitLabel="Add department" resetOnSuccess className="flex flex-wrap items-end gap-3">
      <Field label="New department" name="name" className="min-w-56 flex-1"><Input name="name" required maxLength={80} placeholder="e.g. Customer Success" /></Field>
    </ActionForm>
  );
}

export function TeamModal({ people, departments, initial }: { people: { id: string; name: string }[]; departments: Dept[]; initial?: { id: string; name: string; departmentId: string | null; leadId: string | null; memberIds: string[] } }) {
  const [members, setMembers] = useState<string[]>(initial?.memberIds ?? []);
  return (
    <ModalForm trigger={initial ? "Edit" : "New team"} triggerVariant={initial ? "ghost" : "primary"} triggerSize={initial ? "sm" : "md"} title={initial ? `Edit ${initial.name}` : "New team"} wide>
      {(close) => (
        <ActionForm action={saveTeamAction} submitLabel="Save team" onSuccess={close}>
          <input type="hidden" name="id" value={initial?.id ?? ""} />
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Team name" name="name"><Input name="name" defaultValue={initial?.name} required /></Field>
            <Field label="Department" name="departmentId"><Select name="departmentId" defaultValue={initial?.departmentId ?? ""}><option value="">None</option>{departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select></Field>
            <Field label="Team lead" name="leadId"><Select name="leadId" defaultValue={initial?.leadId ?? ""}><option value="">None</option>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
          </div>
          <fieldset><legend className="mb-2 text-sm font-medium">Members</legend>
            <div className="grid max-h-56 gap-2 overflow-y-auto rounded-md border border-line p-3 sm:grid-cols-2">{people.map((p) => <Check key={p.id} name="memberIds[]" value={p.id} checked={members.includes(p.id)} onChange={() => setMembers((m) => (m.includes(p.id) ? m.filter((x) => x !== p.id) : [...m, p.id]))} label={p.name} />)}</div></fieldset>
        </ActionForm>
      )}
    </ModalForm>
  );
}
