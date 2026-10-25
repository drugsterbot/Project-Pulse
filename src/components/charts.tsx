"use client";

import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const AXIS = { fontSize: 12, fill: "#64748b" };
const GRID = "#e3e8ef";

export function BarsChart({ data, xKey, bars, stacked, height = 260, horizontal, unit }: {
  data: Record<string, string | number>[]; xKey: string; bars: { key: string; label: string; color: string }[]; stacked?: boolean; height?: number; horizontal?: boolean; unit?: string;
}) {
  return (
    <div style={{ height }} role="img" aria-label={`Chart: ${bars.map((b) => b.label).join(", ")} by ${xKey}`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout={horizontal ? "vertical" : "horizontal"} margin={{ top: 8, right: 8, left: horizontal ? 24 : -16, bottom: 0 }}>
          <CartesianGrid stroke={GRID} vertical={horizontal} horizontal={!horizontal} />
          {horizontal ? <><XAxis type="number" tick={AXIS} axisLine={false} tickLine={false} /><YAxis type="category" dataKey={xKey} tick={AXIS} axisLine={false} tickLine={false} width={96} /></>
            : <><XAxis dataKey={xKey} tick={AXIS} axisLine={false} tickLine={false} interval={0} /><YAxis tick={AXIS} axisLine={false} tickLine={false} /></>}
          <Tooltip cursor={{ fill: "#f1f5f9" }} formatter={(v) => (unit ? `${v}${unit}` : v)} contentStyle={{ borderRadius: 8, border: "1px solid #e3e8ef", fontSize: 12 }} />
          {bars.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
          {bars.map((b) => <Bar key={b.key} dataKey={b.key} name={b.label} fill={b.color} stackId={stacked ? "s" : undefined} radius={stacked ? 0 : [3, 3, 0, 0]} maxBarSize={36} />)}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function DonutChart({ data, height = 220 }: { data: { name: string; value: number; color: string }[]; height?: number }) {
  const total = data.reduce((a, d) => a + d.value, 0);
  return (
    <div className="flex flex-wrap items-center gap-4">
      <div style={{ height, width: height }} role="img" aria-label={`Distribution: ${data.map((d) => `${d.name} ${d.value}`).join(", ")}`}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart><Pie data={data} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="92%" paddingAngle={2} stroke="none">{data.map((d) => <Cell key={d.name} fill={d.color} />)}</Pie>
            <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #e3e8ef", fontSize: 12 }} /></PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="min-w-[8rem] flex-1 space-y-1.5 text-sm">
        {data.map((d) => <li key={d.name} className="flex items-center gap-2"><span className="size-2.5 rounded-sm" style={{ background: d.color }} aria-hidden /><span className="flex-1 text-slate-700">{d.name}</span><span className="font-medium">{d.value}</span><span className="w-9 text-right text-xs text-slate-500">{total ? Math.round((d.value / total) * 100) : 0}%</span></li>)}
      </ul>
    </div>
  );
}

export function TrendChart({ data, xKey, lines, height = 240 }: { data: Record<string, string | number>[]; xKey: string; lines: { key: string; label: string; color: string }[]; height?: number }) {
  return (
    <div style={{ height }} role="img" aria-label={`Trend: ${lines.map((l) => l.label).join(", ")}`}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey={xKey} tick={AXIS} axisLine={false} tickLine={false} /><YAxis tick={AXIS} axisLine={false} tickLine={false} />
          <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #e3e8ef", fontSize: 12 }} />
          {lines.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
          {lines.map((l) => <Line key={l.key} type="monotone" dataKey={l.key} name={l.label} stroke={l.color} strokeWidth={2.5} dot={{ r: 3 }} />)}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
