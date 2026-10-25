"use client";

import { createContext, useContext, type ComponentProps, type InputHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export const FormErrors = createContext<Record<string, string[]>>({});

export const inputCls =
  "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-ink shadow-xs placeholder:text-slate-400 focus-visible:border-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30 disabled:bg-slate-100 disabled:text-slate-500";

export function Field({ label, name, hint, children, className }: { label: string; name?: string; hint?: string; children: ReactNode; className?: string }) {
  const errors = useContext(FormErrors);
  const err = name ? errors[name]?.[0] : undefined;
  return (
    <label className={cn("grid gap-1.5", className)}>
      <span className="text-sm font-medium text-slate-800">{label}</span>
      {children}
      {hint && !err && <span className="text-xs text-slate-500">{hint}</span>}
      {err && <span role="alert" className="text-xs font-medium text-red-600">{err}</span>}
    </label>
  );
}
export const Input = ({ className, ...p }: ComponentProps<"input">) => <input className={cn(inputCls, className)} {...p} />;
export const Textarea = ({ className, rows = 3, ...p }: ComponentProps<"textarea">) => <textarea rows={rows} className={cn(inputCls, "resize-y", className)} {...p} />;
export const Select = ({ className, children, ...p }: ComponentProps<"select">) => <select className={cn(inputCls, "pr-8", className)} {...p}>{children}</select>;
export function Check({ label, className, ...p }: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode }) {
  return (
    <label className={cn("flex items-center gap-2 text-sm text-slate-800", className)}>
      <input type="checkbox" className="size-4 rounded border-slate-300 text-blue-600" {...p} />
      {label}
    </label>
  );
}
