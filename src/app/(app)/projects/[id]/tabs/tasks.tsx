import Link from "next/link";
import { Plus } from "lucide-react";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { listTasks, qs } from "@/lib/queries";
import { PRIORITY_LABEL, TASK_STATUS_LABEL } from "@/lib/constants";
import { Card, Pagination } from "@/components/ui/primitives";
import { TaskTable } from "@/components/views";
import { Input, Select } from "@/components/ui/form";
import { buttonClass } from "@/components/ui/button";
import type { Ctx } from "./types";

export async function TasksTab({ ctx }: { ctx: Ctx }) {
  const { user, id, level, sp } = ctx;
  const page = Math.max(Number(sp.page) || 1, 1);
  const [{ rows, total, pageSize }, people] = await Promise.all([
    listTasks(user, { projectId: id, q: sp.q, status: sp.status, priority: sp.priority, assignee: sp.assignee, due: sp.due, sort: sp.sort, page }),
    db.projectMember.findMany({ where: { projectId: id, isClientAccess: false }, include: { user: { select: { id: true, name: true } } } }),
  ]);
  const filtered = !!(sp.q || sp.status || sp.priority || sp.assignee || sp.due);
  const base = { tab: "tasks", q: sp.q, status: sp.status, priority: sp.priority, assignee: sp.assignee, due: sp.due, sort: sp.sort };
  return (
    <Card>
      <form className="grid gap-3 border-b border-line p-4 sm:grid-cols-2 lg:grid-cols-7" role="search" aria-label="Filter tasks">
        <input type="hidden" name="tab" value="tasks" />
        <Input name="q" defaultValue={sp.q} placeholder="Search tasks" aria-label="Search tasks" className="lg:col-span-2" />
        <Select name="status" defaultValue={sp.status ?? ""} aria-label="Status"><option value="">Any status</option>{Object.entries(TASK_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
        <Select name="priority" defaultValue={sp.priority ?? ""} aria-label="Priority"><option value="">Any priority</option>{Object.entries(PRIORITY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
        <Select name="assignee" defaultValue={sp.assignee ?? ""} aria-label="Assignee"><option value="">Anyone</option><option value="me">Me</option><option value="none">Unassigned</option>{people.map((p) => <option key={p.userId} value={p.userId}>{p.user.name}</option>)}</Select>
        <Select name="due" defaultValue={sp.due ?? ""} aria-label="Due"><option value="">Any due date</option><option value="overdue">Overdue</option><option value="today">Due today</option><option value="week">Next 7 days</option></Select>
        <div className="flex gap-2"><button className={buttonClass("secondary", "md", "flex-1")}>Filter</button>{filtered && <Link href={`/projects/${id}?tab=tasks`} className={buttonClass("ghost")}>Clear</Link>}
          {can(level, "createTask") && <Link href={`/tasks/new?projectId=${id}`} className={buttonClass("primary", "md")}><Plus className="size-4" aria-hidden />Task</Link>}</div>
      </form>
      <TaskTable tasks={rows} showProject={false} emptyTitle={filtered ? "No tasks match those filters" : "No tasks yet"} emptyDescription={filtered ? "Try clearing a filter." : can(level, "createTask") ? "Add the first task to get this project moving." : "Tasks assigned to you will show up here."} />
      <Pagination page={page} pageSize={pageSize} total={total} hrefFor={(n) => `/projects/${id}${qs(base, { page: n === 1 ? undefined : String(n) })}`} />
    </Card>
  );
}
