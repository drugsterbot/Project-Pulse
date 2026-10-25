import "server-only";
import { DeterministicInsightsService } from "./deterministic";
import { getLlmClient } from "./llm-adapter";
import type { AIInsightsService } from "./types";

export type { AIInsightsService, Insight, ProjectSummary, InsightSource } from "./types";

/**
 * Returns the insights service. The deterministic analyzer is always the source of findings.
 * When a real provider is configured, `getLlmClient()` can be used to rewrite summaries as prose.
 */
export function getInsightsService(): AIInsightsService {
  void getLlmClient(); // hook point: pass the client into a wrapper that narrates ProjectSummary.paragraphs
  return new DeterministicInsightsService();
}
