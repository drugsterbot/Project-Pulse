import Link from "next/link";
import { db } from "@/lib/db";
import { taskWhere } from "@/lib/access";
import { Card, CardBody } from "@/components/ui/primitives";
import { Gantt } from "@/components/gantt";
import { MonthCalendar, type CalItem } from "@/components/calendar";
import { addDays, cn, isoDate } from "@/lib/utils";
import { isOverdue } from "@/lib/business";
import type { Ctx } from "./types";

export async function TimelineTab({ ctx }: { ctx: Ctx }) {
  const { user, id, project, sp } = ctx;
  const view = sp.view === "calendar" ? "calendar" : "gantt";
  const month = /^\d{4}-\d{2}$/.test(sp.month ?? "") ? sp.month! : new Date().toISOString().slice(0, 7);
  const [tasks, milestones] = await Promise.all([
    db.task.findMany({ where: { AND: [taskWhere(user), { projectId: id, dueDate: { not: null } }] }, orderBy: [{ startDate: "asc" }, { dueDate: "asc" }], include: { dependsOn: { include: { dependsOn: { select: { title: true } } } } }, take: 200 }),
    db.milestone.findMany({ where: { projectId: id, deletedAt: null }, orderBy: { dueDate: "asc" } }),
  ]);
  const tab = (v: string) => `/projects/${id}?tab=timeline&view=${v}`;
  const items: CalItem[] = [
    ...tasks.map((t) => ({ date: isoDate(t.dueDate!), label: t.title, href: `/tasks/${t.id}`, tone: (isOverdue(t) ? "red" : t.status === "COMPLETED" ? "green" : t.status === "BLOCKED" ? "amber" : "blue") as CalItem["tone"] })),
    ...milestones.map((m) => ({ date: isoDate(m.dueDate), label: m.name, href: `/projects/${id}?tab=milestones`, tone: (m.health === "DELAYED" ? "red" : m.health === "AT_RISK" ? "amber" : "violet") as CalItem["tone"], milestone: true })),
  ];
  return (
    <Card>
      <div className="flex items-center justify-between border-b border-line px-5 py-3">
        <div className="inline-flex rounded-md bg-slate-100 p-0.5 text-sm" role="tablist">
          {(["gantt", "calendar"] as const).map((v) => <Link key={v} href={tab(v)} role="tab" aria-selected={view === v} className={cn("rounded px-3 py-1 font-medium", view === v ? "bg-white shadow-xs" : "text-slate-600")}>{v === "gantt" ? "Timeline" : "Calendar"}</Link>)}
        </div>
        <p className="hidden text-xs text-slate-500 sm:block">◆ milestone · bars show task dates, fill shows progress</p>
      </div>
      {view === "gantt" ? (
        <Gantt rangeStart={project.startDate} rangeEnd={project.endDate}
          milestones={milestones.map((m) => ({ id: m.id, name: m.name, due: m.dueDate, health: m.health, progress: m.progress }))}
          rows={tasks.map((t) => ({ id: t.id, title: t.title, href: `/tasks/${t.id}`, start: t.startDate ?? addDays(t.dueDate!, -3), end: t.dueDate!, progress: t.progress, status: t.status, sub: t.dependsOn.length ? `After: ${t.dependsOn.map((d) => d.dependsOn.title).join(", ")}` : undefined }))} />
      ) : <CardBody><MonthCalendar month={month} items={items} hrefFor={(m) => `/projects/${id}?tab=timeline&view=calendar&month=${m}`} /></CardBody>}
    </Card>
  );
}
