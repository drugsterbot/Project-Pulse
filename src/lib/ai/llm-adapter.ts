import type { LlmClient } from "./types";

/**
 * Placeholder adapter for a real model. Nothing calls this unless AI_PROVIDER is "openai" or "anthropic"
 * AND the matching API key is set. To enable it, implement `complete()` with the vendor SDK or fetch call
 * and keep the deterministic findings as the structured grounding passed in `prompt`.
 */
export class NotConfiguredLlm implements LlmClient {
  constructor(private provider: string) {}
  async complete(): Promise<string> {
    throw new Error(`AI provider "${this.provider}" is selected but not implemented. See src/lib/ai/llm-adapter.ts.`);
  }
}

export function getLlmClient(): LlmClient | null {
  const provider = process.env.AI_PROVIDER ?? "mock";
  if (provider === "openai" && process.env.OPENAI_API_KEY) return new NotConfiguredLlm("openai");
  if (provider === "anthropic" && process.env.ANTHROPIC_API_KEY) return new NotConfiguredLlm("anthropic");
  return null;
}
