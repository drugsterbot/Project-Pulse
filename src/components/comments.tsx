"use client";

import { useRef, useState, type ReactNode } from "react";
import { AtSign } from "lucide-react";
import { ActionForm } from "./action-form";
import { Textarea } from "./ui/form";
import { Button } from "./ui/button";
import { addCommentAction } from "@/actions/tasks";

/** Comment box with a simple mention picker. Mentions are stored as @[Name](userId). */
export function CommentForm({ taskId, reportId, people, placeholder = "Write a comment. Use the @ button to mention a teammate." }: { taskId?: string; reportId?: string; people: { id: string; name: string }[]; placeholder?: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const list = people.filter((p) => p.name.toLowerCase().includes(filter.toLowerCase())).slice(0, 8);
  function insert(p: { id: string; name: string }) {
    const el = ref.current; if (!el) return;
    const token = `@[${p.name}](${p.id}) `;
    const s = el.selectionStart ?? el.value.length;
    el.value = el.value.slice(0, s) + token + el.value.slice(el.selectionEnd ?? s);
    el.focus(); el.selectionStart = el.selectionEnd = s + token.length;
    setOpen(false); setFilter("");
  }
  return (
    <ActionForm action={addCommentAction} submitLabel="Post comment" resetOnSuccess
      footer={
        <div className="relative">
          <Button variant="ghost" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-haspopup="listbox"><AtSign className="size-4" aria-hidden />Mention</Button>
          {open && (
            <div className="absolute bottom-full left-0 z-20 mb-2 w-60 rounded-lg border border-line bg-white p-2 shadow-xl">
              <input autoFocus value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Find a teammate" aria-label="Find a teammate" className="mb-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm" />
              <ul role="listbox" className="max-h-48 overflow-y-auto">{list.length === 0 && <li className="px-2 py-2 text-sm text-slate-500">No matches</li>}
                {list.map((p) => <li key={p.id} role="option" aria-selected={false}><button type="button" onClick={() => insert(p)} className="w-full rounded px-2 py-1.5 text-left text-sm hover:bg-slate-100">{p.name}</button></li>)}</ul>
            </div>
          )}
        </div>
      }>
      {taskId && <input type="hidden" name="taskId" value={taskId} />}
      {reportId && <input type="hidden" name="reportId" value={reportId} />}
      <Textarea ref={ref} name="body" rows={3} required placeholder={placeholder} aria-label="Comment" />
    </ActionForm>
  );
}

export function CommentBody({ body }: { body: string }) {
  const parts: ReactNode[] = [];
  const re = /@\[([^\]]+)\]\(([a-z0-9]+)\)/gi;
  let last = 0, m: RegExpExecArray | null, i = 0;
  while ((m = re.exec(body))) {
    if (m.index > last) parts.push(body.slice(last, m.index));
    parts.push(<span key={i++} className="rounded bg-blue-50 px-1 font-medium text-blue-700">@{m[1]}</span>);
    last = m.index + m[0].length;
  }
  parts.push(body.slice(last));
  return <p className="whitespace-pre-wrap text-sm text-slate-800">{parts}</p>;
}
