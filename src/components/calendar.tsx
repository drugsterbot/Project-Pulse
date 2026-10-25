import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export type CalItem = { date: string; label: string; href: string; tone: "blue" | "red" | "green" | "amber" | "violet" | "slate"; milestone?: boolean };
const TONE = { blue: "bg-blue-50 text-blue-800", red: "bg-red-50 text-red-700", green: "bg-green-50 text-green-800", amber: "bg-amber-50 text-amber-900", violet: "bg-violet-50 text-violet-800", slate: "bg-slate-100 text-slate-700" };

/** Month grid (Monday first). `month` is YYYY-MM; prev/next links are built with hrefFor(YYYY-MM). */
export function MonthCalendar({ month, items, hrefFor }: { month: string; items: CalItem[]; hrefFor: (m: string) => string }) {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const first = new Date(Date.UTC(y, m - 1, 1));
  const lead = (first.getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells = Array.from({ length: Math.ceil((lead + days) / 7) * 7 }, (_, i) => i - lead + 1);
  const shift = (n: number) => { const d = new Date(Date.UTC(y, m - 1 + n, 1)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`; };
  const today = new Date().toISOString().slice(0, 10);
  const byDate = new Map<string, CalItem[]>();
  for (const it of items) byDate.set(it.date, [...(byDate.get(it.date) ?? []), it]);
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-base font-semibold">{new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(first)}</h3>
        <div className="flex gap-1">
          <Link href={hrefFor(shift(-1))} aria-label="Previous month" className="rounded-md p-1.5 ring-1 ring-inset ring-slate-300 hover:bg-slate-50"><ChevronLeft className="size-4" /></Link>
          <Link href={hrefFor(new Date().toISOString().slice(0, 7))} className="rounded-md px-3 py-1.5 text-sm ring-1 ring-inset ring-slate-300 hover:bg-slate-50">Today</Link>
          <Link href={hrefFor(shift(1))} aria-label="Next month" className="rounded-md p-1.5 ring-1 ring-inset ring-slate-300 hover:bg-slate-50"><ChevronRight className="size-4" /></Link>
        </div>
      </div>
      <div className="overflow-x-auto">
        <div className="grid min-w-[720px] grid-cols-7 overflow-hidden rounded-lg border border-line bg-line gap-px">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <div key={d} className="bg-slate-50 px-2 py-1.5 text-xs font-medium text-slate-500">{d}</div>)}
          {cells.map((n, i) => {
            const valid = n >= 1 && n <= days;
            const key = valid ? `${month}-${String(n).padStart(2, "0")}` : "";
            const list = (valid && byDate.get(key)) || [];
            return (
              <div key={i} className={cn("min-h-24 bg-white p-1.5", !valid && "bg-slate-50/60")}>
                {valid && <div className={cn("mb-1 inline-flex size-6 items-center justify-center rounded-full text-xs", key === today ? "bg-blue-600 font-semibold text-white" : "text-slate-600")}>{n}</div>}
                <ul className="space-y-1">
                  {list.slice(0, 3).map((it, j) => <li key={j}><Link href={it.href} className={cn("block truncate rounded px-1.5 py-0.5 text-xs font-medium", TONE[it.tone])} title={it.label}>{it.milestone ? "◆ " : ""}{it.label}</Link></li>)}
                  {list.length > 3 && <li className="px-1 text-xs text-slate-500">+{list.length - 3} more</li>}
                </ul>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
