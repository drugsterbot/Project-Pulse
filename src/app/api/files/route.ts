import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { fileMetaSchema, listFiles, saveFileRecord } from "@/lib/files";
import { formObject } from "@/lib/validators";
import { ZodError } from "zod";
import { revalidatePath } from "next/cache";

export const runtime = "nodejs";

/** List files (supports q, projectId, kind, category, uploaderId, taskId, from, to, archived, page, pageSize). */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });
  const sp = new URL(req.url).searchParams;
  const get = (k: string) => sp.get(k) || undefined;
  const res = await listFiles(user, {
    projectId: get("projectId"), q: get("q"), kind: get("kind"), category: get("category"), uploaderId: get("uploaderId"), taskId: get("taskId"),
    from: get("from"), to: get("to"), archived: sp.get("archived") === "1", page: Number(get("page") ?? 1), pageSize: Number(get("pageSize") ?? 20),
  });
  return NextResponse.json({ ok: true, ...res });
}

/** Multipart upload: fields file + projectId (+ taskId, milestoneId, reportId, category, fileId, sharedWithClient, note) or url (+ name) for links. */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });
  try {
    const fd = await req.formData();
    const meta = fileMetaSchema.parse(formObject(fd));
    const f = fd.get("file");
    const upload = f instanceof File && f.size > 0 ? { name: f.name, mime: f.type, data: Buffer.from(await f.arrayBuffer()) } : undefined;
    const file = await saveFileRecord(user, meta, upload);
    revalidatePath("/files"); revalidatePath(`/projects/${meta.projectId}`);
    if (meta.taskId) revalidatePath(`/tasks/${meta.taskId}`);
    if (meta.reportId) revalidatePath(`/daily-reports/${meta.reportId}`);
    return NextResponse.json({ ok: true, file: { id: file.id, name: file.name } });
  } catch (e) {
    if (e instanceof AppError) return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    if (e instanceof ZodError) return NextResponse.json({ ok: false, error: e.issues[0]?.message ?? "Invalid upload." }, { status: 400 });
    console.error("[upload]", e);
    return NextResponse.json({ ok: false, error: "Upload failed." }, { status: 500 });
  }
}
