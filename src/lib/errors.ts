import { unstable_rethrow } from "next/navigation";
import { ZodError } from "zod";

export class AppError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}
export const forbidden = (msg = "You don’t have permission to do that.") => new AppError(msg, 403);
export const notFoundError = (what = "That item") => new AppError(`${what} could not be found.`, 404);

export type ActionResult<T = unknown> =
  | { ok: true; data?: T; message?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

/** Wrap a server action body: convert validation/permission errors into a result the UI can show. */
export async function run<T>(fn: () => Promise<T>, message?: string): Promise<ActionResult<T>> {
  try {
    const data = await fn();
    return { ok: true, data, message };
  } catch (e) {
    unstable_rethrow(e); // let redirect()/notFound() through
    if (e instanceof AppError) return { ok: false, error: e.message };
    if (e instanceof ZodError) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of e.issues) (fieldErrors[String(issue.path[0] ?? "form")] ||= []).push(issue.message);
      return { ok: false, error: e.issues[0]?.message ?? "Please check the form.", fieldErrors };
    }
    console.error("[action error]", e);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}
