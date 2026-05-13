import type { ProductInput } from "@/types/strategy";

// AstroDating example payload — used by the "Load example" button in the
// workspace. Numbers and claims are intentionally non-quantitative so the
// example does not invent metrics for a real product.

export const ASTRO_DATING_EXAMPLE: ProductInput = {
  name: "AstroDating",
  category: "dating app",
  description:
    "A dating app that uses astrology as a shared language, plus values, voice intros, and prompts — not a fortune-telling gimmick.",
  price: "Free with optional subscription",
  businessModel: "freemium",
  audience: "people tired of shallow swiping",
  audiencePain:
    "shallow swiping where matches never become real conversations",
  competitors: "Tinder, Hinge, Bumble",
  differentiator:
    "astrology as a language, plus values, voice intros, and prompts that surface who someone actually is",
  goal: "find a relationship with depth, not just another inbox of small talk",
  awareness: "solution-aware",
  sophistication: "mature-market",
};

// A second example, used by the test:logic script to prove that two
// different inputs produce different strategy outputs.
export const NOTION_LIKE_EXAMPLE: ProductInput = {
  name: "Plotline",
  category: "writing tool",
  description:
    "A focused writing tool for fiction authors who lose momentum in the middle of long projects.",
  price: "$12/month",
  businessModel: "subscription",
  audience: "fiction writers stuck in the middle of long drafts",
  audiencePain:
    "losing momentum and structure halfway through a novel and rewriting the same chapters forever",
  competitors: "Scrivener, Notion, plain Google Docs",
  differentiator:
    "a scene-graph view that lets writers see momentum across an entire draft in one glance",
  goal: "finish a draft they're proud of without rewriting forever",
  awareness: "problem-aware",
  sophistication: "amplified-claims",
};
