// breakeven.ts — pure breakeven-ROAS math for the Offer Architect.
//
// The contribution model is intentionally simple and transparent: every
// dollar of revenue first has to cover the cost of goods, the target
// margin we want to preserve, and any discount the offer is giving
// away. What's left is the contribution per revenue dollar — and the
// inverse of that is the ROAS we must hit just to break even.
//
// All inputs are percents in [0, 100]. Returns null when the inputs are
// missing or when the offer leaves no positive contribution (i.e. the
// math is undefined or non-sensical at this discount level).

export interface BreakevenInput {
  cogsPercent?: number;
  targetMarginPercent?: number;
  discountPercent?: number;
}

export function computeBreakevenROAS(opts: BreakevenInput): number | null {
  const cogs = opts.cogsPercent;
  const margin = opts.targetMarginPercent;
  const discount = opts.discountPercent ?? 0;

  // We require both COGS and target margin to compute a meaningful
  // breakeven — otherwise the equation is missing a fixed cost.
  if (typeof cogs !== "number" || typeof margin !== "number") return null;
  if (!Number.isFinite(cogs) || !Number.isFinite(margin) || !Number.isFinite(discount)) {
    return null;
  }
  if (cogs < 0 || cogs > 100) return null;
  if (margin < 0 || margin > 100) return null;
  if (discount < 0 || discount > 100) return null;

  const contributionPercent = 100 - cogs - margin - discount;
  if (contributionPercent <= 0) return null;

  const contributionFraction = contributionPercent / 100;
  return 1 / contributionFraction;
}
