import { describe, expect, it } from "vitest";
import {
  canReviewStatus, capacityStatus, classifyLink, createsCycle, delayRisk, extractMentions, guessFileKind, isOverdue, milestoneHealth,
  milestoneProgress, renderMentions, scheduleElapsedPct, unmetDependencies, validateCompletion, validateReviewDecision,
} from "@/lib/business";
import { toCsv } from "@/lib/csv";
import { validateUpload } from "@/lib/storage";

const day = (n: number) => new Date(Date.UTC(2026, 5, 15 + n));
const now = day(0);

describe("task completion rules", () => {
  it("requires completion notes", () => {
    expect(validateCompletion({ notes: "", requiredEvidence: false, evidenceCount: 0 })).toMatch(/notes/i);
    expect(validateCompletion({ notes: "  ", requiredEvidence: false, evidenceCount: 0 })).toMatch(/notes/i);
    expect(validateCompletion({ notes: "Done and tested", requiredEvidence: false, evidenceCount: 0 })).toBeNull();
  });
  it("requires evidence only when the task asks for it", () => {
    expect(validateCompletion({ notes: "Done", requiredEvidence: true, evidenceCount: 0 })).toMatch(/evidence/i);
    expect(validateCompletion({ notes: "Done", requiredEvidence: true, evidenceCount: 1 })).toBeNull();
  });
  it("lists dependencies that are not completed", () => {
    const deps = [{ status: "COMPLETED" as const }, { status: "IN_PROGRESS" as const }, { status: "BLOCKED" as const }];
    expect(unmetDependencies(deps)).toHaveLength(2);
  });
  it("flags only open tasks that are past due", () => {
    expect(isOverdue({ status: "IN_PROGRESS", dueDate: day(-1) }, now)).toBe(true);
    expect(isOverdue({ status: "COMPLETED", dueDate: day(-5) }, now)).toBe(false);
    expect(isOverdue({ status: "IN_PROGRESS", dueDate: day(0) }, now)).toBe(false);
    expect(isOverdue({ status: "IN_PROGRESS", dueDate: null }, now)).toBe(false);
  });
});

describe("dependency cycles", () => {
  const edges = [{ taskId: "b", dependsOnId: "a" }, { taskId: "c", dependsOnId: "b" }];
  it("rejects self and circular dependencies", () => {
    expect(createsCycle(edges, "a", "a")).toBe(true);
    expect(createsCycle(edges, "a", "c")).toBe(true); // a -> c -> b -> a
    expect(createsCycle(edges, "d", "c")).toBe(false);
    expect(createsCycle(edges, "c", "a")).toBe(false);
  });
});

describe("milestones", () => {
  it("averages task progress and counts completed tasks as 100", () => {
    expect(milestoneProgress([])).toBe(0);
    expect(milestoneProgress([{ status: "COMPLETED", progress: 40 }, { status: "IN_PROGRESS", progress: 50 }, { status: "NOT_STARTED", progress: 0 }])).toBe(50);
  });
  it("derives health from due date, progress and blockers", () => {
    expect(milestoneHealth({ dueDate: day(-1), progress: 80, blockedCount: 0, overdueTaskCount: 0, now })).toBe("DELAYED");
    expect(milestoneHealth({ dueDate: day(-1), progress: 100, blockedCount: 0, overdueTaskCount: 0, now })).toBe("HEALTHY");
    expect(milestoneHealth({ dueDate: day(20), progress: 10, blockedCount: 1, overdueTaskCount: 0, now })).toBe("AT_RISK");
    expect(milestoneHealth({ dueDate: day(5), progress: 40, blockedCount: 0, overdueTaskCount: 0, now })).toBe("AT_RISK");
    expect(milestoneHealth({ dueDate: day(30), progress: 10, blockedCount: 0, overdueTaskCount: 0, now })).toBe("HEALTHY");
  });
});

describe("workload and risk", () => {
  it("classifies capacity", () => {
    expect(capacityStatus(10, 40)).toBe("UNDER");
    expect(capacityStatus(30, 40)).toBe("BALANCED");
    expect(capacityStatus(41, 40)).toBe("OVERLOADED");
  });
  it("scores delay risk and explains it", () => {
    const calm = delayRisk({ totalTasks: 10, openTasks: 5, overdueTasks: 0, blockedTasks: 0, stalledTasks: 0, delayedMilestones: 0, atRiskMilestones: 0, plannedPct: 40, actualPct: 42 });
    expect(calm.level).toBe("Low");
    expect(calm.reasons).toHaveLength(0);
    const bad = delayRisk({ totalTasks: 10, openTasks: 8, overdueTasks: 5, blockedTasks: 2, stalledTasks: 2, delayedMilestones: 1, atRiskMilestones: 1, plannedPct: 80, actualPct: 30 });
    expect(bad.level).toBe("High");
    expect(bad.score).toBeLessThanOrEqual(100);
    expect(bad.reasons.length).toBeGreaterThan(2);
  });
  it("computes schedule elapsed safely", () => {
    expect(scheduleElapsedPct(null, day(10), now)).toBe(0);
    expect(scheduleElapsedPct(day(-10), day(10), now)).toBe(50);
    expect(scheduleElapsedPct(day(-10), day(-5), now)).toBe(100);
  });
});

describe("report review rules", () => {
  it("only allows review of submitted (or resubmitted) reports", () => {
    expect(canReviewStatus("SUBMITTED")).toBe(true);
    expect(canReviewStatus("DRAFT")).toBe(false);
    expect(canReviewStatus("APPROVED")).toBe(false);
  });
  it("requires a comment to reject or request changes", () => {
    expect(validateReviewDecision("APPROVED", "")).toBeNull();
    expect(validateReviewDecision("REJECTED", "")).toMatch(/comment/i);
    expect(validateReviewDecision("CHANGES_REQUESTED", " please add evidence ")).toBeNull();
    expect(validateReviewDecision("CHANGES_REQUESTED", " ok ")).toMatch(/comment/i);
  });
});

describe("mentions, links and files", () => {
  it("extracts and renders @mentions", () => {
    const body = "Hi @[Ada Lovelace](clx123abc) and @[Bob](clx456def)!";
    expect(extractMentions(body)).toEqual(["clx123abc", "clx456def"]);
    expect(renderMentions(body)).toBe("Hi @Ada Lovelace and @Bob!");
  });
  it("classifies commit/PR and video links", () => {
    expect(classifyLink("https://github.com/org/repo/pull/12")).toBe("COMMIT_LINK");
    expect(classifyLink("https://gitlab.com/org/repo/-/commit/abc")).toBe("COMMIT_LINK");
    expect(classifyLink("https://www.youtube.com/watch?v=abc")).toBe("VIDEO_LINK");
    expect(classifyLink("https://example.com/spec")).toBe("LINK");
    expect(classifyLink("not a url")).toBeNull();
  });
  it("guesses file kinds", () => {
    expect(guessFileKind("shot.PNG")).toBe("IMAGE");
    expect(guessFileKind("plan.xlsx")).toBe("SPREADSHEET");
    expect(guessFileKind("deck.pptx")).toBe("PRESENTATION");
  });
  it("validates uploads by extension, size and contents", () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
    expect(validateUpload("a.png", "image/png", png)).toBeNull();
    expect(validateUpload("a.svg", "image/svg+xml", png)).toMatch(/not allowed/);
    expect(validateUpload("a.exe", "application/octet-stream", png)).toMatch(/not allowed/);
    expect(validateUpload("a.png", "image/png", Buffer.from("<html>"))).toMatch(/do not look like/);
    expect(validateUpload("a.png", "application/pdf", png)).toMatch(/does not match/);
    expect(validateUpload("a.txt", "text/plain", Buffer.alloc(0))).toMatch(/empty/);
  });
});

describe("csv export", () => {
  it("quotes values and neutralises spreadsheet formulas", () => {
    const csv = toCsv([{ a: 'He said "hi", ok', b: "=HYPERLINK(\"x\")", c: 3 }]);
    expect(csv.split("\n")[1]).toBe('"He said ""hi"", ok","\'=HYPERLINK(""x"")",3');
  });
});
