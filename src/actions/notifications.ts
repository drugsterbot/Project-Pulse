"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { actionUser } from "@/lib/auth";
import { run, type ActionResult } from "@/lib/errors";

export async function markNotificationReadAction(id: string): Promise<ActionResult> {
  return run(async () => {
    const user = await actionUser();
    await db.notification.updateMany({ where: { id, userId: user.id, readAt: null }, data: { readAt: new Date() } });
    revalidatePath("/", "layout");
  });
}
export async function markAllNotificationsReadAction(): Promise<ActionResult> {
  return run(async () => {
    const user = await actionUser();
    await db.notification.updateMany({ where: { userId: user.id, readAt: null }, data: { readAt: new Date() } });
    revalidatePath("/", "layout");
  }, "All caught up.");
}
