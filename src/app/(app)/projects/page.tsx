import Link from "next/link";
import { Plus } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { projectWhere } from "@/lib/access";
import { flat, qs } from "@/lib/queries";
import { isAdminRole } from "@/lib/permissions";
import { PRIORITY_LABEL, PROJECT_STATUS_LABEL } from "@/lib/constants";
import { Avatar, Card, EmptyState, PageHeader, Pagination, ProgressBar, Table, Td, Th } from "@/components/ui/primitives";
import { PriorityBadge, ProjectStatusBadge } from "@/components/ui/chips";
import { buttonClass } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/form";
import { fmtDate, pct } from "@/lib/utils";
import type { Prisma } from "@/lib/db";

export const metadata = { title: "Projects" };
export const dynamic = "force-dynamic";
const PAGE = 15;

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  const sp = flat(await searchParams);
  const page = Math.max(Number(sp.page) || 1, 1);
  const where: Prisma.ProjectWhereInput = {
    AND: [projectWhere(user), { archivedAt: sp.archived === "1" ? { not: null } : null },
      sp.q ? { OR: [{ name: { contains: sp.q, mode: "insensitive" } }, { code: { contains: sp.q, mode: "insensitive" } }, { clientName: { contains: sp.q, mode: "insensitive" } }] } : {},
      sp.status ? { status: sp.status as "ACTIVE" } : {}, sp.priority ? { priority: sp.priority as "HIGH" } : {}],
  };
  const [projects, total] = await Promise.all([
    db.project.findMany({ where, orderBy: [{ status: "asc" }, { updatedAt: "desc" }], skip: (page - 1) * PAGE, take: PAGE, include: { manager: { select: { name: true, avatarUrl: true } }, _count: { select: { members: true } } } }),
    db.project.count({ where }),
  ]);
  const counts = await db.task.groupBy({ by: ["projectId", "status"], where: { projectId: { in: projects.map((p) => p.id) }, deletedAt: null }, _count: true });
  const canCreate = isAdminRole(user.role) || user.role === "PROJECT_MANAGER";
  const filtered = !!(sp.q || sp.status || sp.priority || sp.archived);

  return (
    <>
      <PageHeader title="Projects" description={user.role === "CLIENT_VIEWER" ? "Projects shared with you." : "Everything you manage or contribute to."}
        actions={canCreate && <Link href="/projects/new" className={buttonClass("primary")}><Plus className="size-4" aria-hidden />New project</Link>} />
      <Card>
        <form className="grid gap-3 border-b border-line p-4 sm:grid-cols-2 lg:grid-cols-5" role="search" aria-label="Filter projects">
          <Input name="q" defaultValue={sp.q} placeholder="Search name, code or client" aria-label="Search projects" className="lg:col-span-2" />
          <Select name="status" defaultValue={sp.status ?? ""} aria-label="Status"><option value="">All statuses</option>{Object.entries(PROJECT_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
          <Select name="priority" defaultValue={sp.priority ?? ""} aria-label="Priority"><option value="">All priorities</option>{Object.entries(PRIORITY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
          <div className="flex items-center gap-3"><label className="flex items-center gap-2 text-sm"><input type="checkbox" name="archived" value="1" defaultChecked={sp.archived === "1"} className="size-4 rounded border-slate-300" />Archived</label>
            <button className={buttonClass("secondary")}>Filter</button>{filtered && <Link href="/projects" className={buttonClass("ghost")}>Clear</Link>}</div>
        </form>
        {projects.length === 0 ? (
          <EmptyState title={filtered ? "No projects match those filters" : "No projects yet"} description={filtered ? "Try clearing a filter." : canCreate ? "Create your first project to start planning work." : "You haven’t been added to a project yet. Ask your project manager."}
            action={!filtered && canCreate ? <Link href="/projects/new" className={buttonClass("primary")}>New project</Link> : undefined} />
        ) : (
          <Table>
            <thead><tr><Th>Project</Th><Th>Status</Th><Th>Priority</Th><Th>Manager</Th><Th className="w-44">Tasks complete</Th><Th>End date</Th></tr></thead>
            <tbody>
              {projects.map((p) => {
                const rows = counts.filter((c) => c.projectId === p.id);
                const all = rows.reduce((a, r) => a + r._count, 0);
                const done = rows.find((r) => r.status === "COMPLETED")?._count ?? 0;
                return (
                  <tr key={p.id} className="hover:bg-slate-50/70">
                    <Td><Link href={`/projects/${p.id}`} className="font-medium hover:text-blue-700 hover:underline">{p.name}</Link><div className="text-xs text-slate-500">{p.code}{p.category && <> · {p.category}</>}{p.clientName && <> · {p.clientName}</>}</div></Td>
                    <Td><ProjectStatusBadge status={p.status} /></Td>
                    <Td><PriorityBadge priority={p.priority} /></Td>
                    <Td>{p.manager ? <span className="flex items-center gap-2"><Avatar name={p.manager.name} src={p.manager.avatarUrl} size={22} />{p.manager.name}</span> : <span className="text-slate-400">Unassigned</span>}</Td>
                    <Td><div className="flex items-center gap-2"><ProgressBar value={pct(done, all)} tone={done === all && all > 0 ? "green" : "blue"} /><span className="w-16 text-xs text-slate-500">{done}/{all}</span></div></Td>
                    <Td className="whitespace-nowrap text-slate-600">{fmtDate(p.endDate)}</Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
        <Pagination page={page} pageSize={PAGE} total={total} hrefFor={(n) => `/projects${qs(sp, { page: n === 1 ? undefined : String(n) })}`} />
      </Card>
    </>
  );
}
