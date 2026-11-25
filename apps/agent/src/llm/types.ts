import type { llm } from '@livekit/agents';

/** Common surface for the direct-Anthropic and OpenRouter voice adapters. */
export type CompanionLLM = llm.LLM & {
  setTurnInstruction(instruction: string | null): void;
};
