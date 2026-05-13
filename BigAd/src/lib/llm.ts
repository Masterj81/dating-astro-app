// llm.ts — adapter interface for plugging an LLM into BigAd later.
//
// The MVP engine is fully deterministic and local (see src/lib/engine).
// When you are ready to add OpenAI / Anthropic / Mistral / etc., implement
// this interface in a new file (e.g. `llm-openai.ts`) and swap the export
// in `getLLM()`.
//
// Design intent:
//   - Section-level adapter, not single-prompt. We want to be able to
//     swap headlines, angles, landing copy independently.
//   - The deterministic engine remains the fallback when the LLM is
//     unavailable, returns malformed output, or is disabled by env.
//   - No prompt content lives here. Prompts belong next to the caller
//     so the engine stays a thin contract.

import type { ProductInput, Strategy } from "@/types/strategy";

export type StrategySection =
  | "positioning"
  | "centralPromise"
  | "uniqueMechanism"
  | "headlines"
  | "angles"
  | "landing"
  | "store"
  | "tiktokScripts"
  | "facebookAds"
  | "experiments";

export interface LLMAdapter {
  /** Human-readable adapter id, useful for logging. */
  id: string;

  /**
   * Generate one section of the strategy. Implementations must return
   * data shaped like `Strategy[section]`. On any failure, return null
   * so the caller can fall back to the local engine.
   */
  generateSection<K extends StrategySection>(
    input: ProductInput,
    section: K
  ): Promise<Strategy[K] | null>;
}

// Default: no LLM wired in. Returns null for every section, which means
// the local engine output is always used.
const noopAdapter: LLMAdapter = {
  id: "noop",
  async generateSection() {
    return null;
  },
};

let active: LLMAdapter = noopAdapter;

export function getLLM(): LLMAdapter {
  return active;
}

export function setLLM(adapter: LLMAdapter): void {
  active = adapter;
}
