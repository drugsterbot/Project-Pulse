import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { projectWhere, taskWhere } from "@/lib/access";
import { flat, listTasks, qs, taskCardInclude } from "@/lib/queries";
import { isOverdue } from "@/lib/business";
import { isManagementRole } from "@/lib/permissions";
import { PRIORITY_LABEL, TASK_STATUS_LABEL } from "@/lib/constants";
import { Card, CardBody, PageHeader, Pagination } from "@/components/ui/primitives";
import { TaskTable } from "@/components/views";
import { MonthCalendar, type CalItem } from "@/components/calendar";
import { Input, Select } from "@/components/ui/form";
import { buttonClass } from "@/components/ui/button";
import { cn, isoDate } from "@/lib/utils";

export const metadata = { title: "My tasks" };
export const dynamic = "force-dynamic";

export default async function TasksPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  if (user.role === "CLIENT_VIEWER") redirect("/projects");
  const sp = flat(await searchParams);
  const mgmt = isManagementRole(user.role);
  const all = mgmt && sp.scope === "all";
  const view = sp.view === "calendar" ? "calendar" : "list";
  const page = Math.max(Number(sp.page) || 1, 1);
  const filters = { q: sp.q, status: sp.status, priority: sp.priority, projectId: sp.project, due: sp.due, sort: sp.sort, mine: !all, assignee: all ? sp.assignee : undefined };
  const projects = await db.project.findMany({ where: { AND: [projectWhere(user), { archivedAt: null }] }, select: { id: true, code: true, name: true }, orderBy: { name: "asc" } });
  const filtered = !!(sp.q || sp.status || sp.priority || sp.project || sp.due);
  const link = (patch: Record<string, string | undefined>) => `/tasks${qs(sp, { page: undefined, ...patch })}`;

  let body;
  if (view === "calendar") {
    const month = /^\d{4}-\d{2}$/.test(sp.month ?? "") ? sp.month! : new Date().toISOString().slice(0, 7);
    const start = new Date(`${month}-01T00:00:00.000Z`);
    const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
    const { rows } = await listTasks(user, { ...filters, pageSize: 500 });
    const items: CalItem[] = rows.filter((t) => t.dueDate && t.dueDate >= start && t.dueDate < end).map((t) => ({ date: isoDate(t.dueDate!), label: `${t.project.code} · ${t.title}`, href: `/tasks/${t.id}`, tone: isOverdue(t) ? "red" : t.status === "COMPLETED" ? "green" : t.status === "BLOCKED" ? "amber" : t.status === "WAITING_FOR_REVIEW" ? "violet" : "blue" }));
    body = <CardBody><MonthCalendar month={month} items={items} hrefFor={(m) => link({ view: "calendar", month: m })} /></CardBody>;
  } else {
    const { rows, total, pageSize } = await listTasks(user, { ...filters, page });
    body = <><TaskTable tasks={rows} emptyTitle={filtered ? "No tasks match those filters" : "You have no tasks"} emptyDescription={filtered ? "Try clearing a filter." : all ? "Tasks appear here once projects have work." : "When someone assigns you a task it will show up here."} />
      <Pagination page={page} pageSize={pageSize} total={total} hrefFor={(n) => link({ page: n === 1 ? undefined : String(n) })} /></>;
  }
  void taskWhere; void taskCardInclude;

  return (
    <>
      <PageHeader title={all ? "All tasks" : "My tasks"} description={all ? "Every task you can see across your projects." : "Tasks assigned to you across all projects."}
        actions={<>{mgmt && <div className="inline-flex rounded-md bg-slate-200/70 p-0.5 text-sm">{[["Mine", undefined], ["Everyone", "all"]].map(([label, v]) => <Link key={label} href={link({ scope: v })} aria-current={(all ? "all" : undefined) === v ? "true" : undefined} className={cn("rounded px-3 py-1.5 font-medium", (all ? "all" : undefined) === v ? "bg-white shadow-xs" : "text-slate-600")}>{label}</Link>)}</div>}
          {mgmt && <Link href="/tasks/new" className={buttonClass("primary")}><Plus className="size-4" aria-hidden />New task</Link>}</>} />
      <Card>
        <form className="grid gap-3 border-b border-line p-4 sm:grid-cols-2 lg:grid-cols-7" role="search" aria-label="Filter tasks">
          {sp.scope && <input type="hidden" name="scope" value={sp.scope} />}{view === "calendar" && <input type="hidden" name="view" value="calendar" />}
          <Input name="q" defaultValue={sp.q} placeholder="Search tasks" aria-label="Search tasks" className="lg:col-span-2" />
          <Select name="status" defaultValue={sp.status ?? ""} aria-label="Status"><option value="">Any status</option>{Object.entries(TASK_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
          <Select name="priority" defaultValue={sp.priority ?? ""} aria-label="Priority"><option value="">Any priority</option>{Object.entries(PRIORITY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
          <Select name="project" defaultValue={sp.project ?? ""} aria-label="Project"><option value="">All projects</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.code}</option>)}</Select>
          <Select name="due" defaultValue={sp.due ?? ""} aria-label="Due"><option value="">Any due date</option><option value="overdue">Overdue</option><option value="today">Due today</option><option value="week">Next 7 days</option></Select>
          <div className="flex gap-2"><button className={buttonClass("secondary", "md", "flex-1")}>Filter</button>{filtered && <Link href={link({ q: undefined, status: undefined, priority: undefined, project: undefined, due: undefined })} className={buttonClass("ghost")}>Clear</Link>}</div>
        </form>
        <div className="flex gap-1 border-b border-line px-4 py-2 text-sm" role="tablist" aria-label="View">
          {[["list", "List"], ["calendar", "Calendar"]].map(([k, l]) => <Link key={k} role="tab" aria-selected={view === k} href={link({ view: k === "list" ? undefined : k })} className={cn("rounded px-3 py-1 font-medium", view === k ? "bg-blue-50 text-blue-700" : "text-slate-600 hover:bg-slate-100")}>{l}</Link>)}
        </div>
        {body}
      </Card>
    </>
  );
}
