"use server";

import bcrypt from "bcryptjs";
import { createHash, randomBytes } from "node:crypto";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { actionUser, createSession, destroySession } from "@/lib/auth";
import { AppError, run, type ActionResult } from "@/lib/errors";
import { changePasswordSchema, forgotSchema, formObject, loginSchema, profileSchema, resetSchema } from "@/lib/validators";

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
let dummyHash: string | null = null;
const safeNext = (n?: string) => (n && n.startsWith("/") && !n.startsWith("//") && !n.startsWith("/login") ? n : "/dashboard");

export async function loginAction(fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const input = loginSchema.parse(formObject(fd));
    const h = await headers();
    const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
    const userAgent = h.get("user-agent")?.slice(0, 300) ?? null;
    const audit = (userId: string | null, success: boolean, reason?: string) =>
      db.loginAudit.create({ data: { userId, email: input.email, success, reason, ip, userAgent } });

    const recentFails = await db.loginAudit.count({ where: { email: input.email, success: false, createdAt: { gte: new Date(Date.now() - 15 * 60_000) } } });
    if (recentFails >= 5) throw new AppError("Too many failed attempts. Try again in 15 minutes.", 429);

    const user = await db.user.findUnique({ where: { email: input.email } });
    dummyHash ??= await bcrypt.hash("not-a-real-password", 10);
    const valid = await bcrypt.compare(input.password, user?.passwordHash ?? dummyHash);
    if (!user || user.deletedAt || !valid) {
      await audit(user?.id ?? null, false, "bad credentials");
      throw new AppError("Incorrect email or password.");
    }
    if (user.status !== "ACTIVE") {
      await audit(user.id, false, `account ${user.status.toLowerCase()}`);
      throw new AppError(`This account is ${user.status.toLowerCase()}. Contact an administrator.`, 403);
    }
    await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await audit(user.id, true);
    await createSession(user.id);
    redirect(safeNext(input.next));
  });
}

export async function logoutAction() {
  await destroySession();
  redirect("/login");
}

export async function forgotPasswordAction(fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const { email } = forgotSchema.parse(formObject(fd));
    const user = await db.user.findUnique({ where: { email } });
    if (user && user.status === "ACTIVE" && !user.deletedAt) {
      const token = randomBytes(32).toString("hex");
      await db.passwordResetToken.create({ data: { userId: user.id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + 60 * 60_000) } });
      // Development: no email provider needed. Replace this log with a real email send in production.
      const link = `${process.env.APP_URL ?? "http://localhost:3000"}/reset-password?token=${token}`;
      console.info(`\n[password reset] ${email}\n  ${link}\n  (valid for 1 hour)\n`);
    }
    // Same response whether or not the account exists, so emails can't be enumerated.
  }, "If that email has an account, a reset link has been sent. In development the link is printed in the server console.");
}

export async function resetPasswordAction(fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const input = resetSchema.parse(formObject(fd));
    const row = await db.passwordResetToken.findUnique({ where: { tokenHash: sha256(input.token) } });
    if (!row || row.usedAt || row.expiresAt < new Date()) throw new AppError("This reset link is invalid or has expired. Request a new one.");
    const passwordHash = await bcrypt.hash(input.password, 12);
    await db.$transaction([
      db.user.update({ where: { id: row.userId }, data: { passwordHash } }),
      db.passwordResetToken.updateMany({ where: { userId: row.userId, usedAt: null }, data: { usedAt: new Date() } }),
    ]);
  }, "Password updated. You can sign in now.");
}

export async function changePasswordAction(fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const user = await actionUser();
    const input = changePasswordSchema.parse(formObject(fd));
    const row = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    if (!(await bcrypt.compare(input.current, row.passwordHash))) throw new AppError("Your current password is incorrect.");
    await db.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(input.password, 12) } });
  }, "Password changed.");
}

export async function updateProfileAction(fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const user = await actionUser();
    const input = profileSchema.parse(formObject(fd));
    try { Intl.DateTimeFormat(undefined, { timeZone: input.timezone }); } catch { throw new AppError("Unknown timezone."); }
    await db.user.update({ where: { id: user.id }, data: { name: input.name, phone: input.phone ?? null, timezone: input.timezone, skills: input.skills, avatarUrl: input.avatarUrl ?? null } });
  }, "Profile saved.");
}
