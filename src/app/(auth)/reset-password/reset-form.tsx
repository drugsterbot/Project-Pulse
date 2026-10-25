"use client";

import { ActionForm } from "@/components/action-form";
import { Field, Input } from "@/components/ui/form";
import { resetPasswordAction } from "@/actions/auth";

export function ResetForm({ token }: { token: string }) {
  return (
    <ActionForm action={resetPasswordAction} submitLabel="Update password" redirectTo="/login">
      <input type="hidden" name="token" value={token} />
      <Field label="New password" name="password"><Input name="password" type="password" autoComplete="new-password" required /></Field>
      <Field label="Confirm new password" name="confirm"><Input name="confirm" type="password" autoComplete="new-password" required /></Field>
    </ActionForm>
  );
}
