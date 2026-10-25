import { z } from "zod";
import { ROLES, TASK_STATUSES } from "./constants";

/** FormData -> plain object. Keys ending in [] (or repeated keys) become arrays. */
export function formObject(fd: FormData) {
  const o: Record<string, unknown> = {};
  for (const key of new Set(fd.keys())) {
    const all = fd.getAll(key).filter((v): v is string => typeof v === "string");
    if (key.endsWith("[]")) o[key.slice(0, -2)] = all;
    else o[key] = all.length > 1 ? all : all[0];
  }
  return o;
}

const emptyToUndef = (v: unknown) => (v === "" || v === null ? undefined : v);
export const optStr = (max = 5000) => z.preprocess(emptyToUndef, z.string().trim().max(max).optional());
export const reqStr = (label: string, max = 200) => z.string({ error: `${label} is required.` }).trim().min(1, `${label} is required.`).max(max);
export const optDate = z.preprocess(emptyToUndef, z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date.").optional());
export const reqDate = (label: string) => z.string({ error: `${label} is required.` }).regex(/^\d{4}-\d{2}-\d{2}$/, `${label} must be a valid date.`);
export const optNum = (min: number, max: number) => z.preprocess(emptyToUndef, z.coerce.number().min(min).max(max).optional());
export const reqNum = (label: string, min: number, max: number) => z.coerce.number({ error: `${label} must be a number.` }).min(min, `${label} must be at least ${min}.`).max(max, `${label} must be at most ${max}.`);
export const bool = z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean());
export const idList = z.preprocess((v) => (v == null || v === "" ? [] : Array.isArray(v) ? v : [v]), z.array(z.string()));
export const csvList = z.preprocess((v) => (typeof v === "string" ? v.split(",").map((s) => s.trim()).filter(Boolean) : v ?? []), z.array(z.string().max(40)).max(20));

export const passwordSchema = z
  .string()
  .min(10, "Use at least 10 characters.")
  .regex(/[a-z]/, "Include a lowercase letter.")
  .regex(/[A-Z]/, "Include an uppercase letter.")
  .regex(/[0-9]/, "Include a number.");

export const loginSchema = z.object({ email: z.string().trim().toLowerCase().email("Enter a valid email."), password: z.string().min(1, "Enter your password."), next: optStr(300) });
export const forgotSchema = z.object({ email: z.string().trim().toLowerCase().email("Enter a valid email.") });
export const resetSchema = z.object({ token: z.string().min(20), password: passwordSchema, confirm: z.string() }).refine((v) => v.password === v.confirm, { path: ["confirm"], message: "Passwords do not match." });
export const changePasswordSchema = z.object({ current: z.string().min(1, "Enter your current password."), password: passwordSchema, confirm: z.string() }).refine((v) => v.password === v.confirm, { path: ["confirm"], message: "Passwords do not match." });
export const profileSchema = z.object({ name: reqStr("Name", 100), phone: optStr(40), timezone: reqStr("Timezone", 60), skills: csvList, avatarUrl: z.preprocess(emptyToUndef, z.string().url("Avatar must be a URL.").max(500).optional()) });

export const userCreateSchema = z.object({
  name: reqStr("Name", 100), email: z.string().trim().toLowerCase().email("Enter a valid email."), role: z.enum(ROLES),
  departmentId: optStr(50), password: passwordSchema, phone: optStr(40), weeklyCapacityHours: optNum(1, 80),
});
export const userUpdateSchema = z.object({
  id: z.string(), role: z.enum(ROLES), status: z.enum(["ACTIVE", "INACTIVE", "SUSPENDED"]), departmentId: optStr(50), weeklyCapacityHours: optNum(1, 80),
});

export const projectSchema = z.object({
  name: reqStr("Project name", 120), code: reqStr("Project code", 12).transform((v) => v.toUpperCase()).pipe(z.string().regex(/^[A-Z0-9-]{2,12}$/, "Use 2-12 letters, numbers or dashes.")),
  description: optStr(), category: optStr(60), status: z.enum(["PLANNING", "ACTIVE", "ON_HOLD", "COMPLETED", "CANCELLED"]),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]), startDate: optDate, endDate: optDate, managerId: optStr(50),
  memberIds: idList, clientIds: idList, budget: optNum(0, 1e12), estimatedHours: optNum(0, 1e6), goals: optStr(), clientName: optStr(120),
}).refine((v) => !v.startDate || !v.endDate || v.endDate >= v.startDate, { path: ["endDate"], message: "End date must be on or after the start date." });

export const milestoneSchema = z.object({
  projectId: z.string(), name: reqStr("Milestone name", 120), description: optStr(), ownerId: optStr(50), dueDate: reqDate("Due date"), deliverables: optStr(),
});

export const taskSchema = z.object({
  projectId: z.string(), title: reqStr("Title", 200), description: optStr(), milestoneId: optStr(50),
  status: z.enum(TASK_STATUSES as [string, ...string[]]).default("NOT_STARTED"), priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).default("MEDIUM"),
  startDate: optDate, dueDate: optDate, estimatedHours: optNum(0, 10000), progress: optNum(0, 100), labels: csvList,
  requiredEvidence: bool, assigneeIds: idList, dependsOnIds: idList,
}).refine((v) => !v.startDate || !v.dueDate || v.dueDate >= v.startDate, { path: ["dueDate"], message: "Due date must be on or after the start date." });

export const completeTaskSchema = z.object({ taskId: z.string(), notes: z.string().trim().min(3, "Add completion notes.").max(5000) });
export const reviewTaskSchema = z.object({ taskId: z.string(), decision: z.enum(["APPROVE", "REJECT", "REOPEN"]), comment: optStr(2000) });
export const commentSchema = z.object({ taskId: optStr(50), reportId: optStr(50), body: z.string().trim().min(1, "Write a comment first.").max(4000) });

export const reportSchema = z.object({
  reportDate: reqDate("Report date"), completedToday: optStr(), inProgress: optStr(), progressUpdate: optStr(), planTomorrow: optStr(), blockers: optStr(),
  mood: z.enum(["GOOD", "NORMAL", "NEED_HELP"]).default("NORMAL"),
  items: z.array(z.object({ projectId: z.string().min(1), taskId: z.string().optional(), notes: z.string().max(2000).optional(), hoursSpent: z.coerce.number().min(0).max(24) })).max(30),
});
export const reviewReportSchema = z.object({ reportId: z.string(), decision: z.enum(["APPROVED", "CHANGES_REQUESTED", "REJECTED"]), comment: optStr(2000) });

export const timeEntrySchema = z.object({ taskId: z.string().min(1, "Choose a task."), date: reqDate("Date"), hours: reqNum("Hours", 0.05, 24), note: optStr(500) });
export const riskSchema = z.object({
  projectId: z.string(), title: reqStr("Title", 160), description: optStr(), severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
  status: z.enum(["OPEN", "MITIGATING", "RESOLVED", "ACCEPTED"]).default("OPEN"), mitigation: optStr(), ownerId: optStr(50),
});
export const announcementSchema = z.object({ projectId: z.string(), title: reqStr("Title", 160), body: reqStr("Message", 4000), pinned: bool });
export const teamSchema = z.object({ name: reqStr("Team name", 80), departmentId: optStr(50), leadId: optStr(50), memberIds: idList });

/** Normalise an id coming from a form field: empty string/undefined -> null. */
export const parseId = (v: unknown) => (typeof v === "string" && v.length > 0 && v.length <= 64 ? v : null);
