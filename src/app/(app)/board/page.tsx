import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { projectWhere } from "@/lib/access";
import { loadBoardCards } from "@/lib/page-access";
import { flat } from "@/lib/queries";
import { Kanban } from "@/components/kanban";
import { PageHeader } from "@/components/ui/primitives";
import { Select } from "@/components/ui/form";
import { buttonClass } from "@/components/ui/button";
import { redirect } from "next/navigation";

export const metadata = { title: "Board" };
export const dynamic = "force-dynamic";

export default async function BoardPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  if (user.role === "CLIENT_VIEWER") redirect("/projects");
  const sp = flat(await searchParams);
  const mine = sp.scope === "mine";
  const [projects, cards] = await Promise.all([
    db.project.findMany({ where: { AND: [projectWhere(user), { archivedAt: null, status: { in: ["ACTIVE", "PLANNING", "ON_HOLD"] } }] }, select: { id: true, code: true, name: true }, orderBy: { name: "asc" } }),
    loadBoardCards(user, { ...(sp.project ? { projectId: sp.project } : {}), ...(mine ? { assignees: { some: { userId: user.id } } } : {}), project: { archivedAt: null, status: { in: ["ACTIVE", "PLANNING", "ON_HOLD"] } } }),
  ]);
  return (
    <>
      <PageHeader title="Board" description="Drag cards between columns, or use the menu on a card. Blocking or finishing a task asks for a reason or notes." />
      <form className="mb-4 flex flex-wrap items-center gap-3" aria-label="Board filters">
        <Select name="project" defaultValue={sp.project ?? ""} aria-label="Project" className="w-56"><option value="">All projects</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}</Select>
        <Select name="scope" defaultValue={sp.scope ?? ""} aria-label="Scope" className="w-44"><option value="">Everything I can see</option><option value="mine">Only my tasks</option></Select>
        <button className={buttonClass("secondary")}>Apply</button>
        {(sp.project || sp.scope) && <Link href="/board" className={buttonClass("ghost")}>Clear</Link>}
      </form>
      <Kanban cards={cards} />
    </>
  );
}
