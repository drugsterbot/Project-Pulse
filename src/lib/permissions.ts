import type { Role } from "./constants";

/**
 * Pure permission rules. No database access here so the rules are easy to unit-test.
 * Server code loads the facts (membership, assignees...) and asks these functions.
 */
export type Level = "manage" | "lead" | "member" | "client";
export type Actor = { id: string; role: Role };

const RANK: Record<Level, number> = { client: 0, member: 1, lead: 2, manage: 3 };

export const isAdminRole = (r: Role) => r === "SUPER_ADMIN" || r === "ADMIN";
/** Roles that can see team-wide screens (reports, workload, insights, team activity). */
export const isManagementRole = (r: Role) => isAdminRole(r) || r === "PROJECT_MANAGER" || r === "TEAM_LEAD";

export function projectLevel(
  user: Actor,
  project: { managerId: string | null },
  membership: { isClientAccess: boolean } | null,
): Level | null {
  if (isAdminRole(user.role)) return "manage";
  if (user.role === "CLIENT_VIEWER") return membership?.isClientAccess ? "client" : null;
  if (user.role === "PROJECT_MANAGER" && project.managerId === user.id) return "manage";
  if (!membership) return null;
  if (membership.isClientAccess) return "client";
  return user.role === "TEAM_LEAD" ? "lead" : "member";
}

export const atLeast = (level: Level | null, min: Level) => level !== null && RANK[level] >= RANK[min];

export type ProjectAction =
  | "view" | "edit" | "manageMembers" | "archive" | "createMilestone" | "createTask" | "assignTask" | "editAnyTask"
  | "review" | "comment" | "logTime" | "upload" | "createRisk" | "announce" | "viewUpdates";

const MIN_LEVEL: Record<ProjectAction, Level> = {
  view: "client", edit: "manage", manageMembers: "manage", archive: "manage", createMilestone: "manage",
  createTask: "lead", assignTask: "lead", editAnyTask: "lead", review: "lead", comment: "member",
  logTime: "member", upload: "member", createRisk: "lead", announce: "lead", viewUpdates: "member",
};

export const can = (level: Level | null, action: ProjectAction) => atLeast(level, MIN_LEVEL[action]);

/** Members update only tasks they are assigned to or created; leads and managers update any task in the project. */
export function canUpdateTask(level: Level | null, userId: string, task: { assigneeIds: string[]; creatorId: string }) {
  if (atLeast(level, "lead")) return true;
  if (level === "member") return task.assigneeIds.includes(userId) || task.creatorId === userId;
  return false;
}

/** Team members only see tasks assigned to or created by them. Everyone else sees their projects' tasks. */
export function canViewTask(level: Level | null, role: Role, userId: string, task: { assigneeIds: string[]; creatorId: string }) {
  if (level === null) return false;
  if (role === "TEAM_MEMBER") return task.assigneeIds.includes(userId) || task.creatorId === userId;
  return true;
}

export const canManageUsers = (role: Role) => isAdminRole(role);
/** Admins cannot modify Super Admin accounts. */
export function canModifyUser(actor: Role, target: Role) {
  if (actor === "SUPER_ADMIN") return true;
  if (actor === "ADMIN") return target !== "SUPER_ADMIN";
  return false;
}
export function assignableRoles(actor: Role, all: readonly Role[]): Role[] {
  if (actor === "SUPER_ADMIN") return [...all];
  if (actor === "ADMIN") return all.filter((r) => r !== "SUPER_ADMIN");
  return [];
}

/** A report can be reviewed by admins, or by someone with lead+ access on a project the author shares. Never your own report. */
export function canReviewReport(reviewer: Actor, authorId: string, sharedLevels: (Level | null)[]) {
  if (reviewer.id === authorId) return false;
  if (isAdminRole(reviewer.role)) return true;
  if (!(reviewer.role === "PROJECT_MANAGER" || reviewer.role === "TEAM_LEAD")) return false;
  return sharedLevels.some((l) => atLeast(l, "lead"));
}

/** Authors can edit until a reviewer has acted on the report. */
export function canEditReport(userId: string, report: { authorId: string; status: string }) {
  return report.authorId === userId && ["DRAFT", "SUBMITTED", "CHANGES_REQUESTED"].includes(report.status);
}

export function canViewFile(level: Level | null, file: { sharedWithClient: boolean }) {
  if (level === null) return false;
  return level === "client" ? file.sharedWithClient : true;
}
export function canDeleteFile(level: Level | null, userId: string, file: { uploaderId: string }) {
  return atLeast(level, "manage") || (atLeast(level, "member") && file.uploaderId === userId);
}
