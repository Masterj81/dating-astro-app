"use client";

// ProgressChecklistCard.tsx — renders the result of
// `buildProgressChecklist(...)` as a 7-row checklist with green / grey
// dots plus a short `detail` sentence per row.

import type { ProgressChecklistItem } from "@/types/onboarding";

export interface ProgressChecklistCardProps {
  items: ProgressChecklistItem[];
}

export function ProgressChecklistCard({ items }: ProgressChecklistCardProps) {
  const doneCount = items.filter((it) => it.done).length;
  return (
    <section className="hairline rounded-lg bg-ink-900 p-4">
      <div className="flex items-baseline justify-between">
        <p className="text-xxs uppercase tracking-wide text-ink-400">
          Onboarding progress
        </p>
        <p className="text-xxs text-ink-400">
          {doneCount} / {items.length} complete
        </p>
      </div>
      <ul className="mt-3 space-y-2 text-xs text-ink-200">
        {items.map((it) => (
          <li key={it.id} className="flex items-start gap-2">
            <span
              className={`mt-0.5 inline-block h-3 w-3 rounded-sm border ${
                it.done
                  ? "border-emerald-500 bg-emerald-500/40"
                  : "border-ink-600"
              }`}
              aria-hidden
            />
            <div className="flex-1">
              <p
                className={
                  it.done ? "text-ink-100 line-through" : "text-ink-100"
                }
              >
                {it.label}
              </p>
              {it.detail ? (
                <p className="text-xxs text-ink-400">{it.detail}</p>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
