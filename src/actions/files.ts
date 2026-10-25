"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { actionUser } from "@/lib/auth";
import { assertProject } from "@/lib/access";
import { logActivity } from "@/lib/activity";
import { AppError, run, type ActionResult } from "@/lib/errors";
import { canDeleteFile, atLeast } from "@/lib/permissions";
import { fileMetaSchema, saveFileRecord } from "@/lib/files";
import { formObject } from "@/lib/validators";

async function ownFile(fileId: string) {
  const user = await actionUser();
  const file = await db.projectFile.findFirst({ where: { id: fileId, deletedAt: null, project: { orgId: user.orgId } } });
  if (!file) throw new AppError("File not found.", 404);
  const { level } = await assertProject(user, file.projectId, "upload");
  return { user, file, level };
}

export async function addLinkAction(fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const user = await actionUser();
    const meta = fileMetaSchema.parse(formObject(fd));
    if (!meta.url) throw new AppError("Paste a link first.");
    await saveFileRecord(user, meta);
    revalidatePath("/files"); revalidatePath(`/projects/${meta.projectId}`);
    if (meta.taskId) revalidatePath(`/tasks/${meta.taskId}`);
    if (meta.reportId) revalidatePath(`/daily-reports/${meta.reportId}`);
  }, "Link added.");
}

export async function archiveFileAction(fileId: string, archive: boolean): Promise<ActionResult> {
  return run(async () => {
    const { user, file, level } = await ownFile(fileId);
    if (!canDeleteFile(level, user.id, file)) throw new AppError("You can’t change this file.", 403);
    await db.$transaction(async (tx) => {
      await tx.projectFile.update({ where: { id: fileId }, data: { archivedAt: archive ? new Date() : null } });
      await logActivity(tx, { actorId: user.id, projectId: file.projectId, action: archive ? "file_archived" : "file_restored", summary: `${user.name} ${archive ? "archived" : "restored"} “${file.name}”` });
    });
    revalidatePath("/files"); revalidatePath(`/projects/${file.projectId}`);
  }, archive ? "File archived." : "File restored.");
}

/** Soft delete: the row and bytes are kept so activity history stays intact. */
export async function deleteFileAction(fileId: string): Promise<ActionResult> {
  return run(async () => {
    const { user, file, level } = await ownFile(fileId);
    if (!canDeleteFile(level, user.id, file)) throw new AppError("You can’t delete this file.", 403);
    await db.$transaction(async (tx) => {
      await tx.projectFile.update({ where: { id: fileId }, data: { deletedAt: new Date() } });
      await logActivity(tx, { actorId: user.id, projectId: file.projectId, action: "file_deleted", summary: `${user.name} deleted “${file.name}”` });
    });
    revalidatePath("/files"); revalidatePath(`/projects/${file.projectId}`);
    if (file.taskId) revalidatePath(`/tasks/${file.taskId}`);
  }, "File deleted.");
}

export async function setFileSharedAction(fileId: string, shared: boolean): Promise<ActionResult> {
  return run(async () => {
    const { file, level } = await ownFile(fileId);
    if (!atLeast(level, "manage")) throw new AppError("Only project managers can share files with clients.", 403);
    await db.projectFile.update({ where: { id: fileId }, data: { sharedWithClient: shared } });
    revalidatePath(`/projects/${file.projectId}`); revalidatePath("/files");
  }, shared ? "Shared with client." : "No longer shared with client.");
}
