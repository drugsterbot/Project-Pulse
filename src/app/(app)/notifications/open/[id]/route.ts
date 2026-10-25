import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

/** Marks a notification as read and sends the user to the item it points at. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL("/login", req.url));
  const { id } = await ctx.params;
  const n = await db.notification.findFirst({ where: { id, userId: user.id } });
  if (n && !n.readAt) await db.notification.update({ where: { id }, data: { readAt: new Date() } });
  const href = n?.href && n.href.startsWith("/") && !n.href.startsWith("//") ? n.href : "/notifications";
  return NextResponse.redirect(new URL(href, req.url));
}
