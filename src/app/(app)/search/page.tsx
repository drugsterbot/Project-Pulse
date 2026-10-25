import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { projectWhere, taskWhere } from "@/lib/access";
import { flat } from "@/lib/queries";
import { Card, CardHeader, EmptyState, PageHeader } from "@/components/ui/primitives";
import { ProjectStatusBadge, TaskStatusBadge } from "@/components/ui/chips";

export const metadata = { title: "Search" };
export const dynamic = "force-dynamic";

export default async function SearchPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  const q = (flat(await searchParams).q ?? "").trim().slice(0, 100);
  const has = q.length >= 2;
  const [projects, tasks, files] = has ? await Promise.all([
    db.project.findMany({ where: { AND: [projectWhere(user), { archivedAt: null }, { OR: [{ name: { contains: q, mode: "insensitive" } }, { code: { contains: q, mode: "insensitive" } }, { description: { contains: q, mode: "insensitive" } }] }] }, take: 6, select: { id: true, name: true, code: true, status: true } }),
    user.role === "CLIENT_VIEWER" ? [] : db.task.findMany({ where: { AND: [taskWhere(user), { OR: [{ title: { contains: q, mode: "insensitive" } }, { description: { contains: q, mode: "insensitive" } }] }] }, take: 10, select: { id: true, title: true, status: true, project: { select: { code: true } } } }),
    db.projectFile.findMany({ where: { deletedAt: null, archivedAt: null, name: { contains: q, mode: "insensitive" }, project: projectWhere(user), ...(user.role === "CLIENT_VIEWER" ? { sharedWithClient: true } : {}) }, take: 8, select: { id: true, name: true, externalUrl: true, project: { select: { code: true } } } }),
  ]) : [[], [], []];
  const none = has && !projects.length && !tasks.length && !files.length;
  return (
    <>
      <PageHeader title="Search" description={has ? `Results for “${q}”` : "Type at least two characters in the search box."} />
      {none && <Card><EmptyState title="No results" description="Try a different word or check the spelling." /></Card>}
      <div className="grid gap-6 lg:grid-cols-3">
        {projects.length > 0 && <Card><CardHeader title="Projects" /><ul className="divide-y divide-line">{projects.map((p) => <li key={p.id}><Link href={`/projects/${p.id}`} className="flex items-center justify-between gap-2 px-5 py-3 hover:bg-slate-50"><span className="min-w-0 truncate text-sm font-medium">{p.name} <span className="text-xs text-slate-500">{p.code}</span></span><ProjectStatusBadge status={p.status} /></Link></li>)}</ul></Card>}
        {tasks.length > 0 && <Card><CardHeader title="Tasks" /><ul className="divide-y divide-line">{tasks.map((t) => <li key={t.id}><Link href={`/tasks/${t.id}`} className="flex items-center justify-between gap-2 px-5 py-3 hover:bg-slate-50"><span className="min-w-0 truncate text-sm font-medium">{t.title} <span className="text-xs text-slate-500">{t.project.code}</span></span><TaskStatusBadge status={t.status} /></Link></li>)}</ul></Card>}
        {files.length > 0 && <Card><CardHeader title="Files" /><ul className="divide-y divide-line">{files.map((f) => <li key={f.id}><a href={f.externalUrl ?? `/api/files/${f.id}`} target="_blank" rel="noopener noreferrer" className="block px-5 py-3 hover:bg-slate-50"><span className="block truncate text-sm font-medium">{f.name}</span><span className="text-xs text-slate-500">{f.project.code}</span></a></li>)}</ul></Card>}
      </div>
    </>
  );
}
