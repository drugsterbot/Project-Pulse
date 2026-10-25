"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "./ui/modal";
import { Button } from "./ui/button";
import { Field, Textarea } from "./ui/form";
import { useToast } from "./ui/toast";
import { TASK_STATUS_LABEL, type TaskStatus } from "@/lib/constants";
import { moveTaskAction } from "@/actions/tasks";

export type MoverCard = { id: string; title: string; status: TaskStatus; canMove: boolean; canReview: boolean; requiredEvidence: boolean; evidenceCount: number };

/**
 * One place for the status rules shared by the board and the task page:
 * blocked needs a reason, completing as a non-reviewer needs notes (and evidence if required) and goes to review.
 */
export function useTaskMover(opts: { onOptimistic?: (id: string, status: TaskStatus) => void; onRevert?: () => void } = {}) {
  const [dialog, setDialog] = useState<{ card: MoverCard; to: TaskStatus; kind: "blocked" | "review" } | null>(null);
  const [text, setText] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  const { toast } = useToast();

  function send(card: MoverCard, to: TaskStatus, extra?: { reason?: string; notes?: string }) {
    opts.onOptimistic?.(card.id, to);
    start(async () => {
      const res = await moveTaskAction(card.id, to, extra);
      if (!res.ok) { opts.onRevert?.(); toast(res.error, "error"); }
      else { toast(`Moved to ${TASK_STATUS_LABEL[to]}.`); setDialog(null); setText(""); router.refresh(); }
    });
  }
  function request(card: MoverCard, to: TaskStatus) {
    if (card.status === to) return;
    if (!card.canMove) return toast("You can only move tasks assigned to you.", "error");
    if (to === "BLOCKED") { setText(""); return setDialog({ card, to, kind: "blocked" }); }
    if (to === "WAITING_FOR_REVIEW" || (to === "COMPLETED" && !card.canReview)) { setText(""); return setDialog({ card, to: "WAITING_FOR_REVIEW", kind: "review" }); }
    send(card, to);
  }

  const evidenceMissing = dialog?.kind === "review" && dialog.card.requiredEvidence && dialog.card.evidenceCount === 0;
  const node = (
    <Modal open={!!dialog} onClose={() => setDialog(null)} title={dialog?.kind === "blocked" ? "What’s blocking this task?" : "Send for review"}
      description={dialog?.kind === "blocked" ? "Managers and leads are notified so they can help." : "Describe what you finished. Your manager or lead will approve it or send it back."}>
      {dialog && (
        <div className="grid gap-4">
          <p className="text-sm font-medium">{dialog.card.title}</p>
          {evidenceMissing && <p role="alert" className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">This task requires evidence. <Link href={`/tasks/${dialog.card.id}#evidence`} className="font-medium underline">Attach a file or link</Link> first.</p>}
          <Field label={dialog.kind === "blocked" ? "Blocker" : "Completion notes"}>
            <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} autoFocus placeholder={dialog.kind === "blocked" ? "e.g. Waiting for API access from the client" : "What was done and how it was checked"} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setDialog(null)}>Cancel</Button>
            <Button disabled={pending || text.trim().length < 3 || !!evidenceMissing} onClick={() => send(dialog.card, dialog.to, dialog.kind === "blocked" ? { reason: text } : { notes: text })}>
              {dialog.kind === "blocked" ? "Report blocker" : "Send for review"}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
  return { request, node, pending };
}
