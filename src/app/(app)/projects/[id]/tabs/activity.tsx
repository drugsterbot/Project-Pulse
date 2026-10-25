import { db } from "@/lib/db";
import { qs } from "@/lib/queries";
import { Card, Pagination } from "@/components/ui/primitives";
import { ActivityFeed } from "@/components/views";
import type { Ctx } from "./types";

export async function ActivityTab({ ctx }: { ctx: Ctx }) {
  const { id, sp } = ctx;
  const page = Math.max(Number(sp.page) || 1, 1);
  const size = 20;
  const [rows, total] = await Promise.all([
    db.activityLog.findMany({ where: { projectId: id }, orderBy: { createdAt: "desc" }, skip: (page - 1) * size, take: size, include: { actor: { select: { name: true, avatarUrl: true } } } }),
    db.activityLog.count({ where: { projectId: id } }),
  ]);
  return <Card><ActivityFeed items={rows} /><Pagination page={page} pageSize={size} total={total} hrefFor={(n) => `/projects/${id}${qs({ tab: "activity" }, { page: n === 1 ? undefined : String(n) })}`} /></Card>;
}
