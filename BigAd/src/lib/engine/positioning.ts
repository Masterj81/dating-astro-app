import type { Positioning, ProductInput } from "@/types/strategy";

// generatePositioning — produces a positioning statement plus the four
// components used for the "for / category / unlike / unique" frame.
// Everything is derived from the inputs so the output cannot be reused
// verbatim across products.

export function generatePositioning(input: ProductInput): Positioning {
  const name = input.name || "Your product";
  const audience = input.audience || "your audience";
  const category = input.category || "your category";
  const competitors = input.competitors || "existing options";
  const differentiator = input.differentiator || "your differentiator";
  const pain = input.audiencePain || "their core frustration";

  const statement =
    `${name} is the ${category} for ${audience} who are tired of ${pain.toLowerCase()}. ` +
    `Unlike ${shortenCompetitors(competitors)}, ${name} uses ${differentiator} so the experience finally fits how they actually decide.`;

  return {
    statement,
    forWhom: audience,
    category,
    unlike: shortenCompetitors(competitors),
    unique: differentiator,
  };
}

export function generateCentralPromise(input: ProductInput): string {
  const audience = input.audience || "you";
  const pain = input.audiencePain || "the frustration";
  const differentiator = input.differentiator || "a different approach";
  return `${capitalize(audience)} stop ${gerund(pain)} — and start making progress — using ${differentiator}.`;
}

export function generateUniqueMechanism(input: ProductInput): string {
  const differentiator = input.differentiator || "a new method";
  const category = input.category || "this category";
  return `The unique mechanism: ${differentiator}. It works because most ${category} treat the problem at the surface; this one changes the underlying signal users actually respond to.`;
}

function shortenCompetitors(s: string): string {
  const parts = s
    .split(/[,\n]/)
    .map((x) => x.trim())
    .filter(Boolean);
  if (parts.length === 0) return "the obvious alternatives";
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, 2).join(", ")}, and the rest of the field`;
}

function capitalize(s: string): string {
  if (!s) return s;
  return s[0].toUpperCase() + s.slice(1);
}

function gerund(s: string): string {
  const trimmed = (s || "").trim().toLowerCase();
  if (!trimmed) return "spinning their wheels";
  if (/^(struggling|trying|stuck|tired|lost)\b/.test(trimmed)) return trimmed;
  return trimmed;
}
