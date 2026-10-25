"use client";

import { useState } from "react";
import { ActionForm } from "@/components/action-form";
import { Field, Input } from "@/components/ui/form";
import { forgotPasswordAction } from "@/actions/auth";

export function ForgotForm() {
  const [sent, setSent] = useState<string | null>(null);
  if (sent) return <div role="status" className="rounded-md border border-green-200 bg-green-50 px-3 py-3 text-sm text-green-800">{sent}</div>;
  return (
    <ActionForm action={forgotPasswordAction} submitLabel="Send reset link" onSuccess={(r) => setSent(r.message ?? "Check your email.")}>
      <Field label="Email" name="email"><Input name="email" type="email" autoComplete="username" required autoFocus /></Field>
    </ActionForm>
  );
}
