"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { ActionForm } from "./action-form";
import { Button } from "./ui/button";
import { Field, Input, Select, Textarea } from "./ui/form";
import { FileUploader } from "./file-uploader";
import { useToast } from "./ui/toast";
import { MOOD_LABEL } from "@/lib/constants";
import { reviewReportAction, saveReportAction, submitReportAction } from "@/actions/reports";

type Item = { projectId: string; taskId: string; notes: string; hoursSpent: string };
export type ReportInitial = {
  id?: string; date: string; status: string; completedToday: string; inProgress: string; progressUpdate: string; planTomorrow: string; blockers: string; mood: string;
  items: { projectId: string; taskId: string | null; notes: string | null; hoursSpent: number }[]; reviewComment?: string | null;
};

/** Daily report editor: auto-saves the draft, supports per-task time, and submits for review. */
export function ReportEditor({ initial, projects, tasksByProject, today, dates }: {
  initial: ReportInitial; projects: { id: string; name: string; code: string }[]; tasksByProject: Record<string, { id: string; title: string }[]>; today: string; dates: string[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const editableAutosave = initial.status === "DRAFT" || initial.status === "CHANGES_REQUESTED";
  const [reportId, setReportId] = useState(initial.id);
  const [f, setF] = useState({ completedToday: initial.completedToday, inProgress: initial.inProgress, progressUpdate: initial.progressUpdate, planTomorrow: initial.planTomorrow, blockers: initial.blockers, mood: initial.mood });
  const [items, setItems] = useState<Item[]>(initial.items.map((i) => ({ projectId: i.projectId, taskId: i.taskId ?? "", notes: i.notes ?? "", hoursSpent: String(i.hoursSpent) })));
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [dirty, setDirty] = useState(false);
  const first = useRef(true);

  const touch = () => setDirty(true);
  const total = items.reduce((a, i) => a + (Number(i.hoursSpent) || 0), 0);
  const hasContent = !!(f.completedToday || f.inProgress || f.progressUpdate || f.planTomorrow || f.blockers || items.some((i) => i.projectId));

  async function persist(quiet = false): Promise<string | null> {
    setSaving(true);
    const fd = new FormData();
    fd.set("reportDate", initial.date);
    for (const [k, v] of Object.entries(f)) fd.set(k, v);
    fd.set("itemsJson", JSON.stringify(items.filter((i) => i.projectId).map((i) => ({ projectId: i.projectId, taskId: i.taskId || undefined, notes: i.notes || undefined, hoursSpent: Number(i.hoursSpent) || 0 }))));
    const res = await saveReportAction(fd);
    setSaving(false);
    if (!res.ok) { toast(res.error, "error"); return null; }
    setReportId(res.data!.id); setSavedAt(new Date()); setDirty(false);
    if (!quiet) toast("Saved.");
    return res.data!.id;
  }

  // Auto-save drafts 1.5s after the last edit.
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    if (!dirty || !editableAutosave || !hasContent) return;
    const t = setTimeout(() => { persist(true); }, 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f, items, dirty]);

  async function submit() {
    setSubmitting(true);
    const id = await persist(true);
    if (id) {
      const fd = new FormData(); fd.set("reportId", id);
      const res = await submitReportAction(fd);
      if (res.ok) { toast(res.message ?? "Submitted."); router.push(`/daily-reports/${id}`); router.refresh(); return; }
      toast(res.error, "error");
    }
    setSubmitting(false);
  }

  const setItem = (i: number, patch: Partial<Item>) => { setItems((xs) => xs.map((x, j) => (j === i ? { ...x, ...patch } : x))); touch(); };
  const set = (k: keyof typeof f, v: string) => { setF((x) => ({ ...x, [k]: v })); touch(); };
  const usedProjects = projects.filter((p) => items.some((i) => i.projectId === p.id));

  return (
    <div className="grid gap-6">
      {initial.status === "CHANGES_REQUESTED" && <div role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"><p className="font-medium">Your reviewer asked for changes</p><p className="mt-0.5 whitespace-pre-wrap">{initial.reviewComment}</p></div>}
      {initial.status === "SUBMITTED" && <div role="status" className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">This report is submitted. You can still edit it until a reviewer acts on it. Use “Save changes” to update it.</div>}

      <div className="flex flex-wrap items-end justify-between gap-3">
        <label className="grid gap-1.5 text-sm font-medium">Report date
          <Select value={initial.date} onChange={(e) => router.push(`/daily-reports/new?date=${e.target.value}`)} className="w-52">{dates.map((d) => <option key={d} value={d}>{d === today ? `Today · ${d}` : d}</option>)}</Select>
        </label>
        <p className="text-xs text-slate-500" aria-live="polite">{saving ? "Saving…" : savedAt ? `Saved ${savedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : dirty ? "Unsaved changes" : editableAutosave ? "Drafts auto-save as you type" : ""}</p>
      </div>

      <section className="rounded-xl border border-line bg-white">
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5"><div><h2 className="text-sm font-semibold">Work and time</h2><p className="text-xs text-slate-500">Add each task you worked on and the hours you spent. Hours become time entries when you submit.</p></div><span className="text-sm font-medium">{Math.round(total * 10) / 10}h total</span></div>
        <div className="space-y-3 p-5">
          {items.length === 0 && <p className="text-sm text-slate-500">No tasks added yet.</p>}
          {items.map((it, i) => (
            <div key={i} className="grid gap-2 rounded-lg border border-line p-3 md:grid-cols-[1fr_1.4fr_6rem_auto]">
              <Select aria-label="Project" value={it.projectId} onChange={(e) => setItem(i, { projectId: e.target.value, taskId: "" })}><option value="">Project…</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.code}</option>)}</Select>
              <Select aria-label="Task" value={it.taskId} onChange={(e) => setItem(i, { taskId: e.target.value })} disabled={!it.projectId}><option value="">General project work</option>{(tasksByProject[it.projectId] ?? []).map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}</Select>
              <Input aria-label="Hours spent" type="number" min={0} max={24} step={0.25} placeholder="Hours" value={it.hoursSpent} onChange={(e) => setItem(i, { hoursSpent: e.target.value })} />
              <Button variant="ghost" size="icon" aria-label="Remove this line" onClick={() => { setItems((xs) => xs.filter((_, j) => j !== i)); touch(); }}><Trash2 className="size-4 text-slate-500" /></Button>
              <Input aria-label="Notes for this line" placeholder="Notes (optional)" value={it.notes} onChange={(e) => setItem(i, { notes: e.target.value })} className="md:col-span-4" />
            </div>
          ))}
          <Button variant="secondary" onClick={() => { setItems((xs) => [...xs, { projectId: projects.length === 1 ? projects[0]!.id : "", taskId: "", notes: "", hoursSpent: "" }]); touch(); }}><Plus className="size-4" aria-hidden />Add task or project</Button>
        </div>
      </section>

      <section className="grid gap-4 rounded-xl border border-line bg-white p-5 md:grid-cols-2">
        <Field label="Work completed today"><Textarea rows={4} value={f.completedToday} onChange={(e) => set("completedToday", e.target.value)} /></Field>
        <Field label="Work in progress"><Textarea rows={4} value={f.inProgress} onChange={(e) => set("inProgress", e.target.value)} /></Field>
        <Field label="Progress update"><Textarea rows={3} value={f.progressUpdate} onChange={(e) => set("progressUpdate", e.target.value)} placeholder="Where things stand against the plan" /></Field>
        <Field label="Plan for tomorrow"><Textarea rows={3} value={f.planTomorrow} onChange={(e) => set("planTomorrow", e.target.value)} /></Field>
        <Field label="Blockers or help needed" className="md:col-span-2"><Textarea rows={3} value={f.blockers} onChange={(e) => set("blockers", e.target.value)} placeholder="Anything slowing you down? Your manager is notified." /></Field>
        <Field label="How are you doing?"><Select value={f.mood} onChange={(e) => set("mood", e.target.value)} className="w-52">{Object.entries(MOOD_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
      </section>

      <section className="rounded-xl border border-line bg-white">
        <div className="border-b border-line px-5 py-3.5"><h2 className="text-sm font-semibold">Evidence</h2><p className="text-xs text-slate-500">Photos, screenshots, documents, video links, or commit and pull-request links.</p></div>
        <div className="p-5">
          {reportId ? <FileUploader target={{ reportId, projectId: usedProjects[0]?.id }} projects={usedProjects.length ? usedProjects : projects} compact /> : (
            <div className="flex flex-wrap items-center gap-3"><p className="text-sm text-slate-600">Save the draft first, then attach evidence.</p><Button variant="secondary" disabled={saving || !hasContent} onClick={() => persist()}>{saving && <Loader2 className="size-4 animate-spin" aria-hidden />}Save draft</Button></div>
          )}
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={submit} disabled={submitting || saving || !hasContent}>{submitting && <Loader2 className="size-4 animate-spin" aria-hidden />}{initial.status === "SUBMITTED" ? "Save changes" : initial.status === "CHANGES_REQUESTED" ? "Resubmit for review" : "Submit report"}</Button>
        {initial.status !== "SUBMITTED" && <Button variant="secondary" onClick={() => persist()} disabled={saving || submitting || !hasContent}>Save draft</Button>}
      </div>
    </div>
  );
}

export function ReviewReportForm({ reportId }: { reportId: string }) {
  return (
    <ActionForm action={reviewReportAction} submitLabel="Save review">
      <input type="hidden" name="reportId" value={reportId} />
      <fieldset className="grid gap-2"><legend className="mb-1 text-sm font-medium">Decision</legend>
        {[["APPROVED", "Approve"], ["CHANGES_REQUESTED", "Request changes"], ["REJECTED", "Reject"]].map(([v, l], i) => <label key={v} className="flex items-center gap-2 text-sm"><input type="radio" name="decision" value={v} defaultChecked={i === 0} className="size-4 border-slate-300 text-blue-600" />{l}</label>)}
      </fieldset>
      <Field label="Comment" name="comment" hint="Required when requesting changes or rejecting."><Textarea name="comment" rows={3} /></Field>
    </ActionForm>
  );
}
