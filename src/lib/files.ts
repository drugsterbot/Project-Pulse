import "server-only";
import { z } from "zod";
import { db, type Prisma } from "./db";
import type { SessionUser } from "./auth";
import { assertProject, assertTask, projectWhere } from "./access";
import { logActivity } from "./activity";
import { classifyLink, guessFileKind } from "./business";
import { FILE_CATEGORY_LABEL, FILE_KIND_LABEL, type FileCategory } from "./constants";
import { AppError, forbidden } from "./errors";
import { atLeast, canEditReport } from "./permissions";
import { newStorageKey, storage, validateUpload } from "./storage";
import { bool, optStr } from "./validators";

const categories = Object.keys(FILE_CATEGORY_LABEL) as [FileCategory, ...FileCategory[]];
export const fileMetaSchema = z.object({
  projectId: z.string().min(1, "Choose a project."), taskId: optStr(50), milestoneId: optStr(50), reportId: optStr(50), fileId: optStr(50),
  category: z.enum(categories).default("DEVELOPMENT"), sharedWithClient: bool, note: optStr(300), url: optStr(1000), name: optStr(200),
});
export type FileMeta = z.infer<typeof fileMetaSchema>;

/** Validates the target (project/task/milestone/report), stores the bytes, and records file + version + links in one transaction. */
export async function saveFileRecord(user: SessionUser, meta: FileMeta, upload?: { name: string; mime: string; data: Buffer }) {
  const { level } = await assertProject(user, meta.projectId, "upload");
  if (meta.taskId) {
    const { task } = await assertTask(user, meta.taskId, "comment");
    if (task.projectId !== meta.projectId) throw new AppError("That task is not in this project.");
  }
  if (meta.milestoneId && !(await db.milestone.findFirst({ where: { id: meta.milestoneId, projectId: meta.projectId, deletedAt: null } }))) throw new AppError("That milestone is not in this project.");
  if (meta.reportId) {
    const report = await db.dailyReport.findFirst({ where: { id: meta.reportId } });
    if (!report || !canEditReport(user.id, report)) throw forbidden("You can only attach evidence to your own open report.");
  }

  let name: string, kind: keyof typeof FILE_KIND_LABEL, mimeType: string | null = null, sizeBytes = 0, storageKey: string | null = null, externalUrl: string | null = null;
  if (upload) {
    const problem = validateUpload(upload.name, upload.mime, upload.data);
    if (problem) throw new AppError(problem);
    name = upload.name.replace(/[\\/\x00-\x1f]/g, "_").slice(0, 200);
    kind = guessFileKind(name, upload.mime); mimeType = upload.mime || null; sizeBytes = upload.data.length;
    storageKey = newStorageKey(meta.projectId, name);
    await storage.put(storageKey, upload.data);
  } else {
    if (!meta.url) throw new AppError("Choose a file or paste a link.");
    let u: URL;
    try { u = new URL(meta.url); } catch { throw new AppError("That link is not a valid URL."); }
    if (!["http:", "https:"].includes(u.protocol)) throw new AppError("Only http(s) links are allowed.");
    kind = classifyLink(meta.url) ?? "LINK"; externalUrl = u.toString(); name = meta.name || u.hostname + u.pathname.slice(0, 60);
  }
  const shared = atLeast(level, "manage") ? meta.sharedWithClient : false;

  return db.$transaction(async (tx) => {
    let file;
    if (meta.fileId) {
      const prev = await tx.projectFile.findFirst({ where: { id: meta.fileId, projectId: meta.projectId, deletedAt: null } });
      if (!prev || !storageKey) throw new AppError("The file to replace could not be found.");
      if (!(atLeast(level, "lead") || prev.uploaderId === user.id)) throw forbidden();
      const version = prev.currentVersion + 1;
      await tx.fileVersion.create({ data: { fileId: prev.id, version, storageKey, sizeBytes, uploaderId: user.id, note: meta.note } });
      file = await tx.projectFile.update({ where: { id: prev.id }, data: { currentVersion: version, storageKey, sizeBytes, mimeType, kind } });
    } else {
      file = await tx.projectFile.create({ data: { projectId: meta.projectId, taskId: meta.taskId ?? null, milestoneId: meta.milestoneId ?? null, uploaderId: user.id, name, kind, category: meta.category, mimeType, sizeBytes, storageKey, externalUrl, sharedWithClient: shared } });
      await tx.fileVersion.create({ data: { fileId: file.id, version: 1, storageKey, sizeBytes, uploaderId: user.id, note: meta.note } });
    }
    if (meta.taskId) await tx.taskAttachment.upsert({ where: { taskId_fileId: { taskId: meta.taskId, fileId: file.id } }, update: {}, create: { taskId: meta.taskId, fileId: file.id, uploaderId: user.id } });
    if (meta.reportId) await tx.dailyReportAttachment.upsert({ where: { reportId_fileId: { reportId: meta.reportId, fileId: file.id } }, update: {}, create: { reportId: meta.reportId, fileId: file.id, uploaderId: user.id } });
    await logActivity(tx, { actorId: user.id, projectId: meta.projectId, taskId: meta.taskId, action: meta.fileId ? "file_version" : "file_added", summary: `${user.name} ${meta.fileId ? "uploaded a new version of" : "added"} ${externalUrl ? "link" : "file"} “${file.name}”` });
    return file;
  });
}

export type FileFilters = { projectId?: string; q?: string; kind?: string; category?: string; uploaderId?: string; taskId?: string; from?: string; to?: string; archived?: boolean; page?: number; pageSize?: number };
export async function listFiles(user: SessionUser, f: FileFilters) {
  const where: Prisma.ProjectFileWhereInput = {
    deletedAt: null, archivedAt: f.archived ? { not: null } : null, project: { AND: [projectWhere(user), { archivedAt: null }] },
    ...(user.role === "CLIENT_VIEWER" ? { sharedWithClient: true } : {}),
    ...(f.projectId ? { projectId: f.projectId } : {}), ...(f.kind ? { kind: f.kind as "IMAGE" } : {}), ...(f.category ? { category: f.category as "DESIGN" } : {}),
    ...(f.uploaderId ? { uploaderId: f.uploaderId } : {}), ...(f.taskId ? { taskId: f.taskId } : {}),
    ...(f.q ? { name: { contains: f.q, mode: "insensitive" as const } } : {}),
    ...((f.from || f.to) ? { createdAt: { ...(f.from ? { gte: new Date(f.from) } : {}), ...(f.to ? { lte: new Date(`${f.to}T23:59:59.999Z`) } : {}) } } : {}),
  };
  const pageSize = Math.min(f.pageSize ?? 20, 100);
  const page = Math.max(f.page ?? 1, 1);
  const [rows, total] = await Promise.all([
    db.projectFile.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize, include: { uploader: { select: { id: true, name: true } }, project: { select: { id: true, name: true, code: true, managerId: true } }, task: { select: { id: true, title: true } }, milestone: { select: { id: true, name: true } } } }),
    db.projectFile.count({ where }),
  ]);
  return { rows, total, page, pageSize };
}
