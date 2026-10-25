"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { actionUser } from "@/lib/auth";
import { assertProject, assertTask, runningEntry, finishedEntry } from "@/lib/access";
import { syncTaskHours } from "@/lib/activity";
import { AppError, run, type ActionResult } from "@/lib/errors";
import { atLeast } from "@/lib/permissions";
import { formObject, timeEntrySchema } from "@/lib/validators";
import { DAY_MS, parseDateOnly, todayUTC } from "@/lib/utils";

const refresh = () => { revalidatePath("/timesheet"); revalidatePath("/dashboard"); revalidatePath("/tasks"); };

async function finishTimer(entry: { id: string; startedAt: Date | null; taskId: string }) {
  const hours = Math.max(0.01, Math.round(((Date.now() - entry.startedAt!.getTime()) / 3_600_000) * 100) / 100);
  await db.$transaction(async (tx) => {
    await tx.timeEntry.update({ where: { id: entry.id }, data: { hours, endedAt: new Date() } });
    await syncTaskHours(tx, entry.taskId);
  });
}

export async function startTimerAction(taskId: string): Promise<ActionResult> {
  return run(async () => {
    const user = await actionUser();
    const { task } = await assertTask(user, taskId, "comment");
    if (task.status === "COMPLETED") throw new AppError("This task is completed.");
    for (const running of await db.timeEntry.findMany({ where: { userId: user.id, ...runningEntry } })) await finishTimer(running);
    await db.timeEntry.create({ data: { userId: user.id, taskId, projectId: task.projectId, date: todayUTC(), hours: 0, startedAt: new Date() } });
    if (task.status === "NOT_STARTED") await db.task.update({ where: { id: taskId }, data: { status: "IN_PROGRESS" } });
    refresh();
  }, "Timer started.");
}

export async function stopTimerAction(entryId: string): Promise<ActionResult> {
  return run(async () => {
    const user = await actionUser();
    const entry = await db.timeEntry.findFirst({ where: { id: entryId, userId: user.id, ...runningEntry } });
    if (!entry) throw new AppError("That timer isn’t running.", 404);
    await finishTimer(entry);
    refresh();
  }, "Timer stopped and time logged.");
}

export async function addTimeEntryAction(fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const user = await actionUser();
    const input = timeEntrySchema.parse(formObject(fd));
    const { task } = await assertTask(user, input.taskId, "comment");
    const date = parseDateOnly(input.date);
    if (date > todayUTC()) throw new AppError("You can’t log time in the future.");
    if (todayUTC().getTime() - date.getTime() > 60 * DAY_MS) throw new AppError("Time can be logged for the last 60 days only.");
    const day = await db.timeEntry.aggregate({ where: { userId: user.id, date, ...finishedEntry }, _sum: { hours: true } });
    if ((day._sum.hours ?? 0) + input.hours > 24) throw new AppError("That would be more than 24 hours on one day.");
    await db.$transaction(async (tx) => {
      await tx.timeEntry.create({ data: { userId: user.id, taskId: task.id, projectId: task.projectId, date, hours: Math.round(input.hours * 100) / 100, note: input.note } });
      await syncTaskHours(tx, task.id);
    });
    refresh();
  }, "Time logged.");
}

export async function deleteTimeEntryAction(entryId: string): Promise<ActionResult> {
  return run(async () => {
    const user = await actionUser();
    const entry = await db.timeEntry.findFirst({ where: { id: entryId, deletedAt: null, project: { orgId: user.orgId } } });
    if (!entry) throw new AppError("Entry not found.", 404);
    if (entry.reportId) throw new AppError("This entry comes from a daily report. Edit the report instead.");
    if (entry.userId !== user.id) {
      const { level } = await assertProject(user, entry.projectId, "view");
      if (!atLeast(level, "manage")) throw new AppError("You can only delete your own entries.", 403);
    }
    await db.$transaction(async (tx) => {
      await tx.timeEntry.update({ where: { id: entryId }, data: { deletedAt: new Date() } });
      await syncTaskHours(tx, entry.taskId);
    });
    refresh();
  }, "Entry deleted.");
}
