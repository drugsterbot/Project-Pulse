import { ShieldAlert, Trash2 } from "lucide-react";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { Badge, Card, EmptyState, Table, Td, Th } from "@/components/ui/primitives";
import { ActionButton } from "@/components/action-form";
import { RiskModal } from "@/components/project-forms";
import { deleteRiskAction } from "@/actions/projects";
import { RISK_STATUS_LABEL, SEVERITY_LABEL } from "@/lib/constants";
import type { Ctx } from "./types";

export async function RisksTab({ ctx }: { ctx: Ctx }) {
  const { id, level, user } = ctx;
  const manage = can(level, "createRisk");
  const [risks, owners] = await Promise.all([
    db.risk.findMany({ where: { projectId: id, deletedAt: null }, orderBy: [{ status: "asc" }, { severity: "desc" }], include: { owner: { select: { name: true } } } }),
    manage ? db.user.findMany({ where: { orgId: user.orgId, status: "ACTIVE", role: { not: "CLIENT_VIEWER" } }, select: { id: true, name: true }, orderBy: { name: "asc" } }) : [],
  ]);
  return (
    <div className="space-y-4">
      {manage && <div className="flex justify-end"><RiskModal projectId={id} owners={owners} /></div>}
      <Card>
        {risks.length === 0 ? <EmptyState title="No risks logged" description="Record anything that could delay or derail the project, with a plan to reduce it." icon={<ShieldAlert className="size-5" />} /> : (
          <Table>
            <thead><tr><Th>Risk</Th><Th>Severity</Th><Th>Status</Th><Th>Owner</Th><Th>Mitigation</Th>{manage && <Th />}</tr></thead>
            <tbody>{risks.map((r) => (
              <tr key={r.id}>
                <Td className="max-w-xs"><span className="font-medium">{r.title}</span>{r.description && <p className="mt-0.5 text-xs text-slate-500">{r.description}</p>}</Td>
                <Td><Badge tone={r.severity === "CRITICAL" ? "red" : r.severity === "HIGH" ? "amber" : r.severity === "MEDIUM" ? "blue" : "slate"}>{SEVERITY_LABEL[r.severity]}</Badge></Td>
                <Td><Badge tone={r.status === "RESOLVED" ? "green" : r.status === "OPEN" ? "red" : "slate"}>{RISK_STATUS_LABEL[r.status]}</Badge></Td>
                <Td>{r.owner?.name ?? <span className="text-slate-400">None</span>}</Td>
                <Td className="max-w-xs text-slate-600">{r.mitigation ?? "—"}</Td>
                {manage && <Td><div className="flex justify-end gap-1"><RiskModal projectId={id} owners={owners} label="Edit" size="sm" initial={{ id: r.id, title: r.title, description: r.description, severity: r.severity, status: r.status, mitigation: r.mitigation, ownerId: r.ownerId }} />
                  <ActionButton action={deleteRiskAction.bind(null, r.id)} variant="ghost" aria-label={`Remove ${r.title}`} confirm={{ title: "Remove this risk?", confirmLabel: "Remove" }}><Trash2 className="size-4 text-red-600" /></ActionButton></div></Td>}
              </tr>
            ))}</tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
