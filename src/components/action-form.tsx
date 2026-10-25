"use client";

import { useState, useTransition, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button, type ButtonVariant } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { FormErrors } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import type { ActionResult } from "@/lib/errors";

/** A form that calls a server action, shows field + form errors, toasts on success and refreshes the page. */
export function ActionForm<T = unknown>({
  action, children, submitLabel = "Save", submitVariant = "primary", successMessage, redirectTo, onSuccess, resetOnSuccess, className, hideSubmit, footer,
}: {
  action: (fd: FormData) => Promise<ActionResult<T>>;
  children: ReactNode; submitLabel?: string; submitVariant?: ButtonVariant; successMessage?: string; redirectTo?: string | ((data: T | undefined) => string);
  onSuccess?: (res: Extract<ActionResult<T>, { ok: true }>) => void; resetOnSuccess?: boolean; className?: string; hideSubmit?: boolean; footer?: ReactNode;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const router = useRouter();
  const { toast } = useToast();

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    start(async () => {
      const res = await action(fd);
      if (!res) return;
      if (res.ok) {
        setError(null); setFieldErrors({});
        const msg = successMessage ?? res.message;
        if (msg) toast(msg);
        if (resetOnSuccess) form.reset();
        onSuccess?.(res);
        if (redirectTo) router.push(typeof redirectTo === "function" ? redirectTo(res.data) : redirectTo);
        else router.refresh();
      } else {
        setError(res.error); setFieldErrors(res.fieldErrors ?? {});
        toast(res.error, "error");
      }
    });
  }
  return (
    <FormErrors.Provider value={fieldErrors}>
      <form onSubmit={onSubmit} className={className ?? "grid gap-4"} noValidate>
        {error && <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
        {children}
        {!hideSubmit && (
          <div className="flex items-center gap-2">
            <Button type="submit" variant={submitVariant} disabled={pending}>
              {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}{submitLabel}
            </Button>
            {footer}
          </div>
        )}
      </form>
    </FormErrors.Provider>
  );
}

/** One-click server action button with an optional confirmation dialog. Pass the action pre-bound: `action.bind(null, id)`. */
export function ActionButton({
  action, children, variant = "secondary", size = "sm", successMessage, confirm, className, onDone, "aria-label": ariaLabel,
}: {
  action: () => Promise<ActionResult<unknown>>; children: ReactNode; variant?: ButtonVariant; size?: "sm" | "md" | "icon"; successMessage?: string;
  confirm?: { title: string; description?: string; confirmLabel?: string }; className?: string; onDone?: () => void; "aria-label"?: string;
}) {
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { toast } = useToast();
  const run = () => start(async () => {
    const res = await action();
    setOpen(false);
    if (!res) return;
    if (res.ok) { const m = successMessage ?? res.message; if (m) toast(m); onDone?.(); router.refresh(); } else toast(res.error, "error");
  });
  return (
    <>
      <Button variant={variant} size={size} className={className} aria-label={ariaLabel} disabled={pending} onClick={() => (confirm ? setOpen(true) : run())}>
        {pending && !confirm && <Loader2 className="size-3.5 animate-spin" aria-hidden />}{children}
      </Button>
      {confirm && (
        <Modal open={open} onClose={() => setOpen(false)} title={confirm.title} description={confirm.description}>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant={variant === "secondary" ? "danger" : variant} onClick={run} disabled={pending}>
              {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}{confirm.confirmLabel ?? "Confirm"}
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}

/** Button + modal wrapper for forms that live in a dialog (e.g. "Add milestone"). */
export function ModalForm({ trigger, title, description, children, triggerVariant = "secondary", triggerSize = "md", wide }: {
  trigger: ReactNode; title: string; description?: string; children: (close: () => void) => ReactNode; triggerVariant?: ButtonVariant; triggerSize?: "sm" | "md" | "icon"; wide?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant={triggerVariant} size={triggerSize} onClick={() => setOpen(true)}>{trigger}</Button>
      <Modal open={open} onClose={() => setOpen(false)} title={title} description={description} wide={wide}>{children(() => setOpen(false))}</Modal>
    </>
  );
}
