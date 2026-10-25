"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Link2, Loader2, Upload } from "lucide-react";
import { ActionForm } from "./action-form";
import { Button } from "./ui/button";
import { Check, Field, Input, Select, inputCls } from "./ui/form";
import { useToast } from "./ui/toast";
import { FILE_CATEGORY_LABEL } from "@/lib/constants";
import { addLinkAction } from "@/actions/files";

type Target = { projectId: string; taskId?: string; milestoneId?: string; reportId?: string };

/** Upload a file (multipart POST /api/files) or attach a link (GitHub/GitLab commit or PR, video, any URL). */
export function FileUploader({ target, projects, canShare, defaultCategory = "DEVELOPMENT", compact }: {
  target: Omit<Target, "projectId"> & { projectId?: string }; projects?: { id: string; name: string; code: string }[]; canShare?: boolean; defaultCategory?: string; compact?: boolean;
}) {
  const [mode, setMode] = useState<"file" | "link">("file");
  const [busy, setBusy] = useState(false);
  const [projectId, setProjectId] = useState(target.projectId ?? projects?.[0]?.id ?? "");
  const fileRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const { toast } = useToast();

  const hidden = (
    <>
      <input type="hidden" name="projectId" value={projectId} />
      {target.taskId && <input type="hidden" name="taskId" value={target.taskId} />}
      {target.milestoneId && <input type="hidden" name="milestoneId" value={target.milestoneId} />}
      {target.reportId && <input type="hidden" name="reportId" value={target.reportId} />}
    </>
  );
  const projectPicker = !target.projectId && projects && (
    <Field label="Project"><Select value={projectId} onChange={(e) => setProjectId(e.target.value)}>{projects.map((p) => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}</Select></Field>
  );
  const categoryPicker = !compact && (
    <Field label="Folder"><Select name="category" defaultValue={defaultCategory}>{Object.entries(FILE_CATEGORY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
  );

  async function upload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const file = fd.get("file");
    if (!(file instanceof File) || file.size === 0) return toast("Choose a file first.", "error");
    setBusy(true);
    try {
      const res = await fetch("/api/files", { method: "POST", body: fd });
      const json = await res.json();
      if (!json.ok) toast(json.error ?? "Upload failed.", "error");
      else { toast(`Uploaded ${json.file.name}.`); form.reset(); router.refresh(); }
    } catch { toast("Upload failed. Check your connection and try again.", "error"); }
    setBusy(false);
  }

  return (
    <div className="rounded-lg border border-line bg-slate-50/60 p-4">
      <div className="mb-3 flex gap-1" role="tablist" aria-label="Add evidence">
        <Button size="sm" variant={mode === "file" ? "subtle" : "ghost"} onClick={() => setMode("file")} role="tab" aria-selected={mode === "file"}><Upload className="size-3.5" aria-hidden />Upload file</Button>
        <Button size="sm" variant={mode === "link" ? "subtle" : "ghost"} onClick={() => setMode("link")} role="tab" aria-selected={mode === "link"}><Link2 className="size-3.5" aria-hidden />Add link</Button>
      </div>
      {mode === "file" ? (
        <form onSubmit={upload} className="grid gap-3">
          {hidden}{projectPicker}
          <Field label="File" hint="Images, PDF, Word, Excel, PowerPoint, text. Max 15 MB."><input ref={fileRef} name="file" type="file" accept=".png,.jpg,.jpeg,.gif,.webp,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.md,.csv,.json,.log" className={`${inputCls} file:mr-3 file:rounded file:border-0 file:bg-blue-50 file:px-3 file:py-1 file:text-sm file:font-medium file:text-blue-700`} /></Field>
          {categoryPicker}
          {canShare && <Check name="sharedWithClient" label="Share with client viewers" />}
          <div><Button type="submit" disabled={busy}>{busy && <Loader2 className="size-4 animate-spin" aria-hidden />}Upload</Button></div>
        </form>
      ) : (
        <ActionForm action={addLinkAction} submitLabel="Add link" resetOnSuccess className="grid gap-3">
          {hidden}{projectPicker}
          <Field label="URL" name="url" hint="GitHub/GitLab commit or PR, video (YouTube, Loom, Vimeo) or any document link"><Input name="url" type="url" placeholder="https://github.com/org/repo/pull/42" required /></Field>
          <Field label="Name (optional)" name="name"><Input name="name" placeholder="e.g. PR #42: offline queue" /></Field>
          {categoryPicker}
          {canShare && <Check name="sharedWithClient" label="Share with client viewers" />}
        </ActionForm>
      )}
    </div>
  );
}
