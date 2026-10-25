import { loadBoardCards } from "@/lib/page-access";
import { Kanban } from "@/components/kanban";
import type { Ctx } from "./types";

export async function BoardTab({ ctx }: { ctx: Ctx }) {
  const cards = await loadBoardCards(ctx.user, { projectId: ctx.id });
  return (
    <>
      <p className="mb-3 text-sm text-slate-600">{ctx.level === "client" ? "A read-only view of work in progress." : "Drag cards between columns, or use the menu on a card. Blocking or completing a task asks for a reason or notes."}</p>
      <Kanban cards={cards} readOnly={ctx.level === "client"} />
    </>
  );
}
