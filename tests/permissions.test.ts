import { describe, expect, it } from "vitest";
import {
  assignableRoles, atLeast, can, canDeleteFile, canEditReport, canModifyUser, canReviewReport, canUpdateTask, canViewFile, canViewTask, projectLevel,
} from "@/lib/permissions";
import { ROLES } from "@/lib/constants";

const project = { managerId: "pm1" };

describe("projectLevel", () => {
  it("gives admins full access to every project", () => {
    expect(projectLevel({ id: "a", role: "ADMIN" }, project, null)).toBe("manage");
    expect(projectLevel({ id: "s", role: "SUPER_ADMIN" }, project, null)).toBe("manage");
  });
  it("lets a project manager manage only projects they manage", () => {
    expect(projectLevel({ id: "pm1", role: "PROJECT_MANAGER" }, project, null)).toBe("manage");
    expect(projectLevel({ id: "pm2", role: "PROJECT_MANAGER" }, project, null)).toBeNull();
    expect(projectLevel({ id: "pm2", role: "PROJECT_MANAGER" }, project, { isClientAccess: false })).toBe("member");
  });
  it("treats team leads and members as lead / member when assigned, and denies strangers", () => {
    expect(projectLevel({ id: "l", role: "TEAM_LEAD" }, project, { isClientAccess: false })).toBe("lead");
    expect(projectLevel({ id: "m", role: "TEAM_MEMBER" }, project, { isClientAccess: false })).toBe("member");
    expect(projectLevel({ id: "m", role: "TEAM_MEMBER" }, project, null)).toBeNull();
  });
  it("only gives clients read access to projects explicitly shared with them", () => {
    expect(projectLevel({ id: "c", role: "CLIENT_VIEWER" }, project, { isClientAccess: true })).toBe("client");
    expect(projectLevel({ id: "c", role: "CLIENT_VIEWER" }, project, { isClientAccess: false })).toBeNull();
    expect(projectLevel({ id: "c", role: "CLIENT_VIEWER" }, project, null)).toBeNull();
  });
});

describe("project actions", () => {
  it("restricts editing and member management to managers", () => {
    expect(can("manage", "edit")).toBe(true);
    for (const l of ["lead", "member", "client"] as const) expect(can(l, "edit")).toBe(false);
    expect(can(null, "view")).toBe(false);
  });
  it("lets leads create and review tasks but not create milestones", () => {
    expect(can("lead", "createTask")).toBe(true);
    expect(can("lead", "review")).toBe(true);
    expect(can("lead", "createMilestone")).toBe(false);
  });
  it("keeps clients strictly read-only", () => {
    for (const a of ["comment", "logTime", "upload", "createTask", "review", "viewUpdates"] as const) expect(can("client", a)).toBe(false);
    expect(can("client", "view")).toBe(true);
  });
  it("ranks levels", () => {
    expect(atLeast("manage", "lead")).toBe(true);
    expect(atLeast("member", "lead")).toBe(false);
    expect(atLeast(null, "client")).toBe(false);
  });
});

describe("task permissions", () => {
  const task = { assigneeIds: ["m1"], creatorId: "pm1" };
  it("lets members update only their own tasks", () => {
    expect(canUpdateTask("member", "m1", task)).toBe(true);
    expect(canUpdateTask("member", "m2", task)).toBe(false);
    expect(canUpdateTask("lead", "m2", task)).toBe(true);
    expect(canUpdateTask("client", "c", task)).toBe(false);
  });
  it("hides other people’s tasks from team members by default", () => {
    expect(canViewTask("member", "TEAM_MEMBER", "m1", task)).toBe(true);
    expect(canViewTask("member", "TEAM_MEMBER", "m2", task)).toBe(false);
    expect(canViewTask("lead", "TEAM_LEAD", "l1", task)).toBe(true);
    expect(canViewTask(null, "TEAM_LEAD", "l1", task)).toBe(false);
  });
});

describe("user administration", () => {
  it("prevents admins from modifying or creating super admins", () => {
    expect(canModifyUser("ADMIN", "SUPER_ADMIN")).toBe(false);
    expect(canModifyUser("ADMIN", "TEAM_MEMBER")).toBe(true);
    expect(canModifyUser("SUPER_ADMIN", "SUPER_ADMIN")).toBe(true);
    expect(canModifyUser("PROJECT_MANAGER", "TEAM_MEMBER")).toBe(false);
    expect(assignableRoles("ADMIN", ROLES)).not.toContain("SUPER_ADMIN");
    expect(assignableRoles("SUPER_ADMIN", ROLES)).toContain("SUPER_ADMIN");
    expect(assignableRoles("TEAM_LEAD", ROLES)).toEqual([]);
  });
});

describe("daily reports and files", () => {
  it("never lets people review their own report", () => {
    expect(canReviewReport({ id: "a", role: "ADMIN" }, "a", [])).toBe(false);
    expect(canReviewReport({ id: "a", role: "ADMIN" }, "x", [])).toBe(true);
  });
  it("lets PMs and leads review only people they share a project with at lead+ level", () => {
    expect(canReviewReport({ id: "pm", role: "PROJECT_MANAGER" }, "m", ["manage"])).toBe(true);
    expect(canReviewReport({ id: "pm", role: "PROJECT_MANAGER" }, "m", ["member"])).toBe(false);
    expect(canReviewReport({ id: "l", role: "TEAM_LEAD" }, "m", ["lead", null])).toBe(true);
    expect(canReviewReport({ id: "m2", role: "TEAM_MEMBER" }, "m", ["manage"])).toBe(false);
  });
  it("allows editing only before a reviewer has acted", () => {
    expect(canEditReport("u", { authorId: "u", status: "SUBMITTED" })).toBe(true);
    expect(canEditReport("u", { authorId: "u", status: "CHANGES_REQUESTED" })).toBe(true);
    expect(canEditReport("u", { authorId: "u", status: "APPROVED" })).toBe(false);
    expect(canEditReport("x", { authorId: "u", status: "DRAFT" })).toBe(false);
  });
  it("shows clients only files shared with them", () => {
    expect(canViewFile("client", { sharedWithClient: false })).toBe(false);
    expect(canViewFile("client", { sharedWithClient: true })).toBe(true);
    expect(canViewFile("member", { sharedWithClient: false })).toBe(true);
    expect(canViewFile(null, { sharedWithClient: true })).toBe(false);
  });
  it("lets uploaders and managers delete files", () => {
    expect(canDeleteFile("member", "u", { uploaderId: "u" })).toBe(true);
    expect(canDeleteFile("member", "u", { uploaderId: "x" })).toBe(false);
    expect(canDeleteFile("manage", "u", { uploaderId: "x" })).toBe(true);
    expect(canDeleteFile("client", "u", { uploaderId: "u" })).toBe(false);
  });
});
