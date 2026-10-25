"use client";

import { ActionForm } from "@/components/action-form";
import { Field, Input } from "@/components/ui/form";
import { loginAction } from "@/actions/auth";

export function LoginForm({ next }: { next?: string }) {
  return (
    <ActionForm action={loginAction} submitLabel="Sign in">
      <input type="hidden" name="next" value={next ?? ""} />
      <Field label="Email" name="email"><Input name="email" type="email" autoComplete="username" autoFocus required /></Field>
      <Field label="Password" name="password"><Input name="password" type="password" autoComplete="current-password" required /></Field>
    </ActionForm>
  );
}
