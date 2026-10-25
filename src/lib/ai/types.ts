export type InsightSeverity = "info" | "low" | "medium" | "high";
export type InsightKind = "stalled" | "milestone" | "priority" | "workload" | "evidence" | "dependency" | "review" | "action";

/** Where an insight came from, so users can see why it was generated. */
export interface InsightSource { type: "task" | "milestone" | "report" | "user" | "project"; id: string; label: string; href?: string }

export interface Insight {
  id: string;
  kind: InsightKind;
  severity: InsightSeverity;
  title: string;
  detail: string;
  /** Plain-language rule + data that triggered the insight. */
  reason: string;
  sources: InsightSource[];
  projectId: string;
}

export interface ProjectSummary {
  projectId: string;
  projectName: string;
  headline: string;
  paragraphs: string[];
  stats: { total: number; completed: number; inProgress: number; blocked: number; overdue: number; awaitingReview: number; hoursLast7d: number; completedLast7d: number; reportsLast7d: number };
  risk: { score: number; level: "Low" | "Medium" | "High"; reasons: string[] };
}

/**
 * The contract the UI depends on. The default implementation is deterministic and needs no API key.
 * Callers must check project access before calling; the service itself does not authorize.
 */
export interface AIInsightsService {
  generateProjectSummary(projectId: string): Promise<ProjectSummary>;
  detectStalledTasks(projectId: string): Promise<Insight[]>;
  assessMilestoneHealth(projectId: string): Promise<Insight[]>;
  recommendPriorities(projectId: string): Promise<Insight[]>;
  analyzeTeamWorkload(projectId: string): Promise<Insight[]>;
  findMissingEvidence(projectId: string): Promise<Insight[]>;
  findBlockedDependencies(projectId: string): Promise<Insight[]>;
  suggestManagerActions(projectId: string): Promise<Insight[]>;
}

/** Optional: swap in a real model to rewrite the deterministic findings as prose. */
export interface LlmClient {
  complete(prompt: string): Promise<string>;
}
