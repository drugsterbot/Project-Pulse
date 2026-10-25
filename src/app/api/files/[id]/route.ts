import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { loadProjectAccess } from "@/lib/access";
import { canViewFile } from "@/lib/permissions";
import { storage } from "@/lib/storage";

export const runtime = "nodejs";

/** Authorised download/preview. ?download=1 forces a download; ?v=N serves an older version. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const { id } = await ctx.params;
  const file = await db.projectFile.findFirst({ where: { id, deletedAt: null }, include: { versions: true } });
  const access = file ? await loadProjectAccess(user, file.projectId) : null;
  if (!file || !access || !canViewFile(access.level, file)) return NextResponse.json({ error: "File not found." }, { status: 404 });

  if (file.externalUrl) return NextResponse.redirect(file.externalUrl, 302);
  const sp = new URL(req.url).searchParams;
  const v = Number(sp.get("v"));
  const version = v ? file.versions.find((x) => x.version === v) : null;
  const key = version?.storageKey ?? file.storageKey;
  if (!key) return NextResponse.json({ error: "No stored content." }, { status: 404 });
  let data: Buffer;
  try { data = await storage.get(key); } catch { return NextResponse.json({ error: "The stored file is missing." }, { status: 404 }); }

  const inlineOk = file.kind === "IMAGE" || file.kind === "PDF" || file.kind === "TEXT";
  const disposition = inlineOk && sp.get("download") !== "1" ? "inline" : "attachment";
  return new NextResponse(new Uint8Array(data), {
    headers: {
      "Content-Type": file.mimeType || "application/octet-stream",
      "Content-Length": String(data.length),
      "Content-Disposition": `${disposition}; filename*=UTF-8''${encodeURIComponent(file.name)}`,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox",
      "Cache-Control": "private, no-store",
    },
  });
}
