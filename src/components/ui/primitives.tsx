import { cn, initials } from "@/lib/utils";
import { TONE_CLASS, type Tone } from "@/lib/constants";
import type { ReactNode } from "react";
import Link from "next/link";
import { AlertTriangle, Inbox } from "lucide-react";

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <section className={cn("rounded-xl border border-line bg-white", className)}>{children}</section>;
}
export function CardHeader({ title, description, action, className }: { title: ReactNode; description?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-3.5", className)}>
      <div className="min-w-0">
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
        {description && <p className="mt-0.5 text-xs text-slate-500">{description}</p>}
      </div>
      {action}
    </div>
  );
}
export const CardBody = ({ className, children }: { className?: string; children: ReactNode }) => <div className={cn("p-5", className)}>{children}</div>;

export function PageHeader({ title, description, actions, back }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; back?: { href: string; label: string } }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {back && <Link href={back.href} className="mb-1 inline-block text-xs font-medium text-blue-700 hover:underline">← {back.label}</Link>}
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-slate-600">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Badge({ tone = "slate", children, className, dot }: { tone?: Tone; children: ReactNode; className?: string; dot?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset", TONE_CLASS[tone], className)}>
      {dot && <span className="size-1.5 rounded-full bg-current" aria-hidden />}
      {children}
    </span>
  );
}

export function Avatar({ name, src, size = 28 }: { name: string; src?: string | null; size?: number }) {
  const hue = [...name].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" width={size} height={size} className="rounded-full object-cover" style={{ width: size, height: size }} />
  ) : (
    <span title={name} aria-hidden className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white" style={{ width: size, height: size, fontSize: size * 0.38, background: `hsl(${hue} 45% 38%)` }}>
      {initials(name)}
    </span>
  );
}
export function AvatarStack({ people, max = 4, size = 24 }: { people: { id: string; name: string; avatarUrl?: string | null }[]; max?: number; size?: number }) {
  if (!people.length) return <span className="text-xs text-slate-400">Unassigned</span>;
  const shown = people.slice(0, max);
  return (
    <span className="flex items-center" aria-label={people.map((p) => p.name).join(", ")}>
      {shown.map((p, i) => <span key={p.id} className={cn("rounded-full ring-2 ring-white", i > 0 && "-ml-1.5")}><Avatar name={p.name} src={p.avatarUrl} size={size} /></span>)}
      {people.length > max && <span className="-ml-1.5 inline-flex items-center justify-center rounded-full bg-slate-200 text-[10px] font-semibold text-slate-700 ring-2 ring-white" style={{ width: size, height: size }}>+{people.length - max}</span>}
    </span>
  );
}

export function ProgressBar({ value, tone = "blue", className, label }: { value: number; tone?: "blue" | "green" | "amber" | "red"; className?: string; label?: string }) {
  const v = Math.max(0, Math.min(100, value));
  const color = { blue: "bg-blue-600", green: "bg-green-600", amber: "bg-amber-500", red: "bg-red-600" }[tone];
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-slate-200", className)} role="progressbar" aria-valuenow={v} aria-valuemin={0} aria-valuemax={100} aria-label={label ?? "Progress"}>
      <div className={cn("h-full rounded-full", color)} style={{ width: `${v}%` }} />
    </div>
  );
}

export function Stat({ label, value, hint, tone, href }: { label: string; value: ReactNode; hint?: ReactNode; tone?: Tone; href?: string }) {
  const body = (
    <div className="rounded-xl border border-line bg-white px-4 py-3.5 transition-colors hover:border-slate-300">
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className={cn("mt-1 text-2xl font-semibold tracking-tight", tone === "red" ? "text-red-600" : tone === "amber" ? "text-amber-600" : tone === "green" ? "text-green-600" : "text-ink")}>{value}</div>
      {hint && <div className="mt-0.5 text-xs text-slate-500">{hint}</div>}
    </div>
  );
  return href ? <Link href={href} className="block">{body}</Link> : body;
}

export function EmptyState({ title, description, action, icon }: { title: string; description?: string; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <div className="mb-3 flex size-10 items-center justify-center rounded-full bg-slate-100 text-slate-500">{icon ?? <Inbox className="size-5" aria-hidden />}</div>
      <p className="text-sm font-medium text-ink">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-slate-500">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
export function ErrorState({ title = "Something went wrong", description, action }: { title?: string; description?: string; action?: ReactNode }) {
  return (
    <div role="alert" className="flex flex-col items-center justify-center rounded-xl border border-red-200 bg-red-50 px-6 py-10 text-center">
      <AlertTriangle className="mb-2 size-6 text-red-600" aria-hidden />
      <p className="text-sm font-semibold text-red-800">{title}</p>
      {description && <p className="mt-1 max-w-md text-sm text-red-700">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("overflow-x-auto", className)}><table className="w-full min-w-[640px] border-collapse text-left text-sm">{children}</table></div>;
}
export const Th = ({ children, className }: { children?: ReactNode; className?: string }) => <th scope="col" className={cn("border-b border-line bg-slate-50/70 px-4 py-2.5 text-xs font-medium text-slate-500", className)}>{children}</th>;
export const Td = ({ children, className, colSpan }: { children?: ReactNode; className?: string; colSpan?: number }) => <td colSpan={colSpan} className={cn("border-b border-line px-4 py-3 align-middle", className)}>{children}</td>;

export function Pagination({ page, pageSize, total, hrefFor }: { page: number; pageSize: number; total: number; hrefFor: (p: number) => string }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  return (
    <nav className="flex items-center justify-between border-t border-line px-4 py-3 text-sm" aria-label="Pagination">
      <span className="text-slate-500">Page {page} of {pages} · {total} items</span>
      <span className="flex gap-2">
        {page > 1 ? <Link className="rounded-md px-3 py-1.5 ring-1 ring-inset ring-slate-300 hover:bg-slate-50" href={hrefFor(page - 1)}>Previous</Link> : null}
        {page < pages ? <Link className="rounded-md px-3 py-1.5 ring-1 ring-inset ring-slate-300 hover:bg-slate-50" href={hrefFor(page + 1)}>Next</Link> : null}
      </span>
    </nav>
  );
}

export function LinkTabs({ tabs, active, hrefFor }: { tabs: readonly (readonly [string, string])[]; active: string; hrefFor: (key: string) => string }) {
  return (
    <nav aria-label="Sections" className="-mx-1 mb-5 flex gap-1 overflow-x-auto border-b border-line px-1">
      {tabs.map(([key, label]) => (
        <Link key={key} href={hrefFor(key)} aria-current={active === key ? "page" : undefined}
          className={cn("whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors", active === key ? "border-blue-600 text-blue-700" : "border-transparent text-slate-600 hover:border-slate-300 hover:text-ink")}>
          {label}
        </Link>
      ))}
    </nav>
  );
}

/** The "pulse": a strip of recent days. Bar height = value (0-1); colour encodes status. */
export function PulseStrip({ days }: { days: { label: string; value: number; tone: "ok" | "late" | "none"; title: string }[] }) {
  return (
    <div className="flex h-12 items-end gap-1" role="img" aria-label={days.map((d) => `${d.label}: ${d.title}`).join("; ")}>
      {days.map((d, i) => (
        <div key={i} title={`${d.label}: ${d.title}`} className="flex h-full flex-1 flex-col justify-end">
          <div className={cn("w-full rounded-sm", d.tone === "ok" ? "bg-blue-600" : d.tone === "late" ? "bg-amber-400" : "bg-slate-200")} style={{ height: `${Math.max(12, d.value * 100)}%` }} />
        </div>
      ))}
    </div>
  );
}
