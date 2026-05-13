import type { LandingCopy, ProductInput } from "@/types/strategy";

// generateLandingCopy — assembles a hero, sub-hero, value bullets,
// objection handlers, and CTA. The wording adapts to awareness and
// sophistication so the copy is appropriate to where the market is.

export function generateLandingCopy(input: ProductInput): LandingCopy {
  const name = input.name || "Your product";
  const audience = input.audience || "people who care";
  const pain = input.audiencePain || "the same old frustration";
  const differentiator = input.differentiator || "a new approach";
  const category = input.category || "this category";
  const goal = input.goal || "make progress";

  const hero =
    input.awareness === "unaware"
      ? `${capitalize(pain)} is not who you are. It is how ${category} is built.`
      : input.awareness === "product-aware" || input.awareness === "most-aware"
      ? `${name}: ${differentiator}, made for ${audience}.`
      : `${capitalize(category)}, rebuilt around ${differentiator}.`;

  const subhead =
    `For ${audience} who are tired of ${pain.toLowerCase()}. ` +
    `${name} replaces the surface-level parts of ${category} with ${differentiator}, so the next move you make actually fits.`;

  const bullets = [
    `Built specifically for ${audience}, not the average user of ${category}.`,
    `Replaces ${painSummary(pain)} with ${differentiator}.`,
    `Designed to help you ${normalizeGoal(goal)} without restarting from scratch.`,
    `No bloat. No dark patterns. No reasons to apologize for the product.`,
  ];

  const cta =
    input.awareness === "most-aware"
      ? `Start with ${name} today`
      : `Try ${name}`;

  const socialProofLine =
    input.sophistication === "skeptical-market" || input.sophistication === "mature-market"
      ? `Quietly used by ${audience} who are done with the ${category} hamster wheel.`
      : `Built with — and for — ${audience}.`;

  const objectionsHandled = [
    {
      objection: `"Is this just another ${category} product?"`,
      reply: `No. Most ${category} tools optimize ${painSummary(pain)}. ${name} replaces it with ${differentiator}.`,
    },
    {
      objection: `"I've tried tools like this before."`,
      reply: `Then you know the failure mode. ${name} is engineered around that failure — ${differentiator} is the part previous attempts skipped.`,
    },
    {
      objection: `"I'm too busy to set up another tool."`,
      reply: `Setup is one screen. ${name} starts working from the first session, then gets sharper as you use it.`,
    },
  ];

  return { hero, subhead, bullets, cta, socialProofLine, objectionsHandled };
}

function painSummary(pain: string): string {
  return pain.replace(/\.$/, "").toLowerCase();
}

function normalizeGoal(goal: string): string {
  const g = (goal || "").trim();
  if (!g) return "make real progress";
  return g.replace(/\.$/, "");
}

function capitalize(s: string): string {
  if (!s) return s;
  return s[0].toUpperCase() + s.slice(1);
}
