"use client";

import { ActionForm } from "./action-form";
import { Field, Input, Select } from "./ui/form";
import { changePasswordAction, updateProfileAction } from "@/actions/auth";

export function ProfileForm({ user, zones, readOnly }: { user: { name: string; phone: string | null; timezone: string; skills: string[]; avatarUrl: string | null }; zones: string[]; readOnly: { email: string; role: string; department: string } }) {
  return (
    <ActionForm action={updateProfileAction} submitLabel="Save profile">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name" name="name"><Input name="name" defaultValue={user.name} required maxLength={100} /></Field>
        <Field label="Email"><Input value={readOnly.email} disabled readOnly /></Field>
        <Field label="Role"><Input value={readOnly.role} disabled readOnly /></Field>
        <Field label="Department"><Input value={readOnly.department} disabled readOnly /></Field>
        <Field label="Phone" name="phone"><Input name="phone" type="tel" defaultValue={user.phone ?? ""} /></Field>
        <Field label="Timezone" name="timezone"><Select name="timezone" defaultValue={user.timezone}>{[...new Set([user.timezone, ...zones])].map((z) => <option key={z} value={z}>{z}</option>)}</Select></Field>
        <Field label="Skills" name="skills" hint="Comma separated"><Input name="skills" defaultValue={user.skills.join(", ")} /></Field>
        <Field label="Avatar URL" name="avatarUrl" hint="Link to an image. Leave blank to use initials."><Input name="avatarUrl" type="url" defaultValue={user.avatarUrl ?? ""} /></Field>
      </div>
    </ActionForm>
  );
}

export function PasswordForm() {
  return (
    <ActionForm action={changePasswordAction} submitLabel="Change password" resetOnSuccess>
      <Field label="Current password" name="current"><Input name="current" type="password" autoComplete="current-password" required /></Field>
      <Field label="New password" name="password" hint="At least 10 characters, with upper and lower case letters and a number"><Input name="password" type="password" autoComplete="new-password" required /></Field>
      <Field label="Confirm new password" name="confirm"><Input name="confirm" type="password" autoComplete="new-password" required /></Field>
    </ActionForm>
  );
}
