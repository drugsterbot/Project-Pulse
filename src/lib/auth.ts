import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import { db } from "./db";
import type { Role } from "./constants";
import { forbidden } from "./errors";
import { isAdminRole, isManagementRole } from "./permissions";

export const SESSION_COOKIE = "pp_session";
const MAX_AGE = 60 * 60 * 24 * 7;

function secret() {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32) {
    if (process.env.NODE_ENV === "production") throw new Error("AUTH_SECRET must be set (32+ characters) in production.");
    return new TextEncoder().encode("dev-only-insecure-secret-do-not-use-in-prod-0000");
  }
  return new TextEncoder().encode(s);
}

/** Secure cookies need https. Tie the flag to APP_URL so `next start` on http://localhost works in every browser. */
const useSecureCookie = () => (process.env.APP_URL ?? "").startsWith("https://");

export async function createSession(userId: string) {
  const token = await new SignJWT({}).setProtectedHeader({ alg: "HS256" }).setSubject(userId).setIssuedAt().setExpirationTime(`${MAX_AGE}s`).sign(secret());
  (await cookies()).set(SESSION_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: useSecureCookie(), path: "/", maxAge: MAX_AGE });
}
export async function destroySession() {
  (await cookies()).delete(SESSION_COOKIE);
}
export async function verifyToken(token: string) {
  try {
    const { payload } = await jwtVerify(token, secret());
    return payload.sub ?? null;
  } catch {
    return null;
  }
}

/** The signed-in user, re-read from the database on every request so suspensions apply immediately. */
export const getCurrentUser = cache(async () => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const userId = await verifyToken(token);
  if (!userId) return null;
  const user = await db.user.findFirst({
    where: { id: userId, deletedAt: null, status: "ACTIVE" },
    select: { id: true, orgId: true, name: true, email: true, role: true, avatarUrl: true, timezone: true, departmentId: true, weeklyCapacityHours: true, phone: true, skills: true },
  });
  return user ? { ...user, role: user.role as Role } : null;
});
export type SessionUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}
/** For pages: send people without the right role to the unauthorized page. */
export async function requireManagement() {
  const user = await requireUser();
  if (!isManagementRole(user.role)) redirect("/unauthorized");
  return user;
}
export async function requireAdmin() {
  const user = await requireUser();
  if (!isAdminRole(user.role)) redirect("/unauthorized");
  return user;
}
/** For server actions: throw instead of redirecting. */
export async function actionUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw forbidden("Your session has expired. Please sign in again.");
  return user;
}
