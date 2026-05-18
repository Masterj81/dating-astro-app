"use client";

// NextBestActionCard.tsx — compact card that surfaces the current
// `getNextBestAction()` recommendation. Lives in the workspace tab
// strip; takes an optional `onNavigate(tab)` callback so the CTA stays
// decoupled from app routing.

import type { NextBestAction } from "@/types/onboarding";

export interface NextBestActionCardProps {
  action: NextBestAction;
  onNavigate?: (tab: string) => void;
}

export function NextBestActionCard({
  action,
  onNavigate,
}: NextBestActionCardProps) {
  function handleClick() {
    if (action.linkTo && onNavigate) {
      onNavigate(action.linkTo);
    }
  }
  return (
    <section className="hairline rounded-lg bg-ink-900 p-4">
      <p className="text-xxs uppercase tracking-wide text-ink-400">
        Next best action
      </p>
      <h3 className="mt-1 text-sm font-semibold text-ink-50">{action.title}</h3>
      <p className="mt-2 text-xs text-ink-300">{action.rationale}</p>
      <div className="mt-3">
        <button
          type="button"
          onClick={handleClick}
          disabled={!action.linkTo}
          className="rounded-sm border border-ink-700 bg-ink-800 px-3 py-1.5 text-xs text-ink-100 transition hover:border-accent hover:text-white disabled:opacity-50"
        >
          {action.ctaLabel}
        </button>
      </div>
    </section>
  );
}
