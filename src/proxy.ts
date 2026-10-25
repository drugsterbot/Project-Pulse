import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

const PUBLIC = ["/login", "/forgot-password", "/reset-password"];

async function isValid(token: string | undefined) {
  if (!token) return false;
  const raw = process.env.AUTH_SECRET;
  const secret = new TextEncoder().encode(raw && raw.length >= 32 ? raw : "dev-only-insecure-secret-do-not-use-in-prod-0000");
  try { await jwtVerify(token, secret); return true; } catch { return false; }
}

/** Redirect unauthenticated visitors to /login. Every page, action and API route still authorizes on the server. */
export async function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const authed = await isValid(req.cookies.get("pp_session")?.value);
  const isPublic = PUBLIC.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (!authed && !isPublic) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }
  if (authed && pathname === "/login") return NextResponse.redirect(new URL("/dashboard", req.url));
  return NextResponse.next();
}

export const config = { matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"] };
