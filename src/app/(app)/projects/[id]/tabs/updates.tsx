import Link from "next/link";
import { db } from "@/lib/db";
import { atLeast } from "@/lib/permissions";
import { Avatar, Card, EmptyState, Table, Td, Th } from "@/components/ui/primitives";
import { MoodBadge, ReportStatusBadge } from "@/components/ui/chips";
import { fmtDate, fmtHours, sum } from "@/lib/utils";
import type { Ctx } from "./types";

export async function UpdatesTab({ ctx }: { ctx: Ctx }) {
  const { id, user, level } = ctx;
  const reports = await db.dailyReport.findMany({
    where: { status: { not: "DRAFT" }, items: { some: { projectId: id } }, ...(atLeast(level, "lead") ? {} : { authorId: user.id }) },
    orderBy: [{ reportDate: "desc" }, { submittedAt: "desc" }], take: 40,
    include: { author: { select: { name: true, avatarUrl: true } }, items: { where: { projectId: id }, select: { hoursSpent: true } } },
  });
  return (
    <Card>
      {reports.length === 0 ? <EmptyState title="No daily updates yet" description="Updates that mention this project appear here once they are submitted." /> : (
        <Table>
          <thead><tr><Th>Date</Th><Th>Person</Th><Th>Status</Th><Th>Hours here</Th><Th>Mood</Th><Th>Blockers</Th><Th /></tr></thead>
          <tbody>{reports.map((r) => (
            <tr key={r.id} className="hover:bg-slate-50/70">
              <Td className="whitespace-nowrap">{fmtDate(r.reportDate)}</Td>
              <Td><span className="flex items-center gap-2"><Avatar name={r.author.name} src={r.author.avatarUrl} size={24} />{r.author.name}</span></Td>
              <Td><ReportStatusBadge status={r.status} /></Td>
              <Td>{fmtHours(sum(r.items.map((i) => i.hoursSpent)))}</Td>
              <Td><MoodBadge mood={r.mood} /></Td>
              <Td className="max-w-xs truncate text-slate-600">{r.blockers ?? <span className="text-slate-400">None</span>}</Td>
              <Td><Link href={`/daily-reports/${r.id}`} className="text-sm font-medium text-blue-700 hover:underline">Open</Link></Td>
            </tr>
          ))}</tbody>
        </Table>
      )}
    </Card>
  );
}
