import Link from "next/link";
import { cn, DAY_MS, fmtShortDate } from "@/lib/utils";
import { EmptyState } from "./ui/primitives";

type Row = { id: string; title: string; href: string; start: Date; end: Date; progress: number; status: string; sub?: string };
type Ms = { id: string; name: string; due: Date; health: string; progress: number };

const BAR: Record<string, string> = { COMPLETED: "bg-green-500", BLOCKED: "bg-red-500", WAITING_FOR_REVIEW: "bg-violet-500", REOPENED: "bg-amber-500", IN_PROGRESS: "bg-blue-600", NOT_STARTED: "bg-slate-400" };
const HEALTH: Record<string, string> = { HEALTHY: "bg-green-600", AT_RISK: "bg-amber-500", DELAYED: "bg-red-600" };

/** Gantt-style timeline: milestones as diamonds, tasks as bars (fill = progress), a line for today. */
export function Gantt({ rows, milestones, rangeStart, rangeEnd }: { rows: Row[]; milestones: Ms[]; rangeStart?: Date | null; rangeEnd?: Date | null }) {
  if (!rows.length && !milestones.length) return <EmptyState title="Nothing to plot yet" description="Add tasks with start and due dates, or milestones, to see the timeline." />;
  const dates = [...rows.flatMap((r) => [r.start, r.end]), ...milestones.map((m) => m.due), ...(rangeStart ? [rangeStart] : []), ...(rangeEnd ? [rangeEnd] : []), new Date()];
  const min = new Date(Math.min(...dates.map((d) => d.getTime())) - 3 * DAY_MS);
  const max = new Date(Math.max(...dates.map((d) => d.getTime())) + 3 * DAY_MS);
  const span = max.getTime() - min.getTime();
  const pos = (d: Date) => ((d.getTime() - min.getTime()) / span) * 100;
  const todayPos = pos(new Date());
  const ticks: { label: string; left: number }[] = [];
  const t = new Date(Date.UTC(min.getUTCFullYear(), min.getUTCMonth() + 1, 1));
  while (t < max) { ticks.push({ label: new Intl.DateTimeFormat("en-GB", { month: "short", year: "2-digit", timeZone: "UTC" }).format(t), left: pos(t) }); t.setUTCMonth(t.getUTCMonth() + 1); }
  const Line = () => <><div className="absolute inset-y-0 w-px bg-red-400/70" style={{ left: `${todayPos}%` }} aria-hidden />{ticks.map((k) => <div key={k.label} className="absolute inset-y-0 w-px bg-slate-100" style={{ left: `${k.left}%` }} aria-hidden />)}</>;

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[860px]">
        <div className="grid grid-cols-[240px_1fr] border-b border-line text-xs text-slate-500">
          <div className="px-4 py-2 font-medium">Work item</div>
          <div className="relative h-8">{ticks.map((k) => <span key={k.label} className="absolute top-2 -translate-x-1/2" style={{ left: `${k.left}%` }}>{k.label}</span>)}
            <span className="absolute top-0.5 -translate-x-1/2 rounded bg-red-500 px-1 text-[10px] font-medium text-white" style={{ left: `${todayPos}%` }}>Today</span></div>
        </div>
        {milestones.map((m) => (
          <div key={m.id} className="grid grid-cols-[240px_1fr] border-b border-line bg-slate-50/60">
            <div className="truncate px-4 py-2.5 text-sm font-semibold">{m.name}<span className="ml-2 text-xs font-normal text-slate-500">{m.progress}%</span></div>
            <div className="relative h-10"><Line /><span className={cn("absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-sm ring-2 ring-white", HEALTH[m.health])} style={{ left: `${pos(m.due)}%` }} title={`${m.name}: due ${fmtShortDate(m.due)}`} /></div>
          </div>
        ))}
        {rows.map((r) => {
          const left = pos(r.start);
          const width = Math.max(pos(r.end) - left, 0.8);
          return (
            <div key={r.id} className="grid grid-cols-[240px_1fr] border-b border-line">
              <div className="min-w-0 px-4 py-2"><Link href={r.href} className="block truncate text-sm font-medium hover:text-blue-700 hover:underline">{r.title}</Link>{r.sub && <span className="block truncate text-xs text-slate-500">{r.sub}</span>}</div>
              <div className="relative h-11"><Line />
                <div className="absolute top-1/2 h-4 -translate-y-1/2 overflow-hidden rounded bg-slate-200" style={{ left: `${left}%`, width: `${width}%` }} title={`${r.title}: ${fmtShortDate(r.start)} to ${fmtShortDate(r.end)} · ${r.progress}%`}>
                  <div className={cn("h-full", BAR[r.status] ?? "bg-blue-600")} style={{ width: `${r.status === "COMPLETED" ? 100 : r.progress}%` }} />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
