import Link from "next/link";
import { db } from "@/lib/db";
import { requireManagement } from "@/lib/auth";
import { projectWhere } from "@/lib/access";
import { flat, getWorkload, weekOf } from "@/lib/queries";
import { CAPACITY_LABEL } from "@/lib/business";
import { ROLE_LABEL, type Role } from "@/lib/constants";
import { Avatar, Badge, Card, CardBody, CardHeader, EmptyState, PageHeader, ProgressBar, Stat, Table, Td, Th } from "@/components/ui/primitives";
import { BarsChart } from "@/components/charts";
import { Select } from "@/components/ui/form";
import { buttonClass } from "@/components/ui/button";
import { addDays, fmtDate, isoDate } from "@/lib/utils";

export const metadata = { title: "Workload" };
export const dynamic = "force-dynamic";

export default async function WorkloadPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireManagement();
  const sp = flat(await searchParams);
  const week = weekOf(sp.week);
  const [rows, projects, teams] = await Promise.all([
    getWorkload(user, week, { projectId: sp.project, teamId: sp.team }),
    db.project.findMany({ where: { AND: [projectWhere(user), { archivedAt: null }] }, select: { id: true, code: true, name: true }, orderBy: { code: "asc" } }),
    db.team.findMany({ where: { orgId: user.orgId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const over = rows.filter((r) => r.status === "OVERLOADED"), under = rows.filter((r) => r.status === "UNDER");
  const tone = { OVERLOADED: "red", BALANCED: "green", UNDER: "amber" } as const;
  const wk = (d: Date) => `/workload?${new URLSearchParams({ ...sp, week: isoDate(d) })}`;

  return (
    <>
      <PageHeader title="Team workload" description={`Week of ${fmtDate(week)}. Planned work is the remaining estimate on open tasks due this week or earlier, split across assignees.`}
        actions={<><Link href={wk(addDays(week, -7))} className={buttonClass("secondary")}>← Previous</Link><Link href={wk(weekOf())} className={buttonClass("secondary")}>This week</Link><Link href={wk(addDays(week, 7))} className={buttonClass("secondary")}>Next →</Link></>} />
      <Card className="mb-6">
        <form className="flex flex-wrap items-center gap-3 p-4" role="search" aria-label="Filter workload">
          <input type="hidden" name="week" value={isoDate(week)} />
          <Select name="project" defaultValue={sp.project ?? ""} aria-label="Project" className="w-56"><option value="">All projects</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}</Select>
          <Select name="team" defaultValue={sp.team ?? ""} aria-label="Team" className="w-52"><option value="">All teams</option>{teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select>
          <button className={buttonClass("secondary")}>Apply</button>{(sp.project || sp.team) && <Link href={`/workload?week=${isoDate(week)}`} className={buttonClass("ghost")}>Clear</Link>}
        </form>
      </Card>
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="People" value={rows.length} /><Stat label="Overloaded" value={over.length} tone={over.length ? "red" : undefined} /><Stat label="Under capacity" value={under.length} tone={under.length ? "amber" : undefined} /><Stat label="Balanced" value={rows.length - over.length - under.length} tone="green" />
      </div>
      {rows.length === 0 ? <Card><EmptyState title="No one to show" description="Add people to your projects, or clear the filters." /></Card> : (
        <>
          <Card className="mb-6"><CardHeader title="Planned, logged and capacity (hours)" /><CardBody><BarsChart unit="h" xKey="name" data={rows.map((r) => ({ name: r.name.split(" ")[0]!, Planned: r.planned, Logged: r.logged, Capacity: r.weeklyCapacityHours }))} bars={[{ key: "Planned", label: "Planned", color: "#2563eb" }, { key: "Logged", label: "Logged", color: "#16a34a" }, { key: "Capacity", label: "Capacity", color: "#cbd5e1" }]} /></CardBody></Card>
          <Card>
            <Table>
              <thead><tr><Th>Person</Th><Th>Open tasks</Th><Th className="w-56">Planned vs capacity</Th><Th>Logged</Th><Th>Status</Th></tr></thead>
              <tbody>{rows.map((r) => (
                <tr key={r.id}>
                  <Td><span className="flex items-center gap-2.5"><Avatar name={r.name} src={r.avatarUrl} size={28} /><span><span className="font-medium">{r.name}</span><span className="block text-xs text-slate-500">{ROLE_LABEL[r.role as Role]}{r.department && ` · ${r.department.name}`}</span></span></span></Td>
                  <Td><Link href={`/tasks?scope=all&assignee=${r.id}`} className="hover:underline">{r.openTasks}</Link></Td>
                  <Td><div className="flex items-center gap-2"><ProgressBar value={(r.planned / r.weeklyCapacityHours) * 100} tone={r.status === "OVERLOADED" ? "red" : r.status === "UNDER" ? "amber" : "green"} /><span className="w-24 text-xs text-slate-600">{r.planned}h / {r.weeklyCapacityHours}h</span></div></Td>
                  <Td>{r.logged}h</Td><Td><Badge tone={tone[r.status]} dot>{CAPACITY_LABEL[r.status]}</Badge></Td>
                </tr>
              ))}</tbody>
            </Table>
          </Card>
        </>
      )}
    </>
  );
}
