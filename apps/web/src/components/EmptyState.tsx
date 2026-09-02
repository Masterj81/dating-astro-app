import type { ReactNode } from "react";

/**
 * Shared empty-state surface for post-load "nothing here yet" screens.
 *
 * Loading skeletons live in `Skeleton.tsx` — this primitive is strictly for
 * the case where the request resolved with zero rows (or the user lacks
 * the entitlement to see them). The shape is always: soft glyph chip,
 * optional eyebrow, title, optional body, optional row of CTAs — centered
 * in a card-bordered panel that survives mobile widths down to 320px.
 *
 * Pass `eyebrow` for premium-locked / category contexts ("LIKES",
 * "PREMIUM"), and use plain text — the component handles the typography.
 * Pass `action` as the literal CTA cluster so callers stay free to mix
 * <Link>, <button>, primary/secondary styles, etc.
 */

type EmptyStateProps = {
  icon?: ReactNode;
  eyebrow?: string;
  title: string;
  body?: string;
  action?: ReactNode;
  className?: string;
};

export function EmptyState({
  icon,
  eyebrow,
  title,
  body,
  action,
  className = "",
}: EmptyStateProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex flex-col items-center justify-center rounded-[2rem] border border-border bg-card/80 px-6 py-12 text-center sm:px-10 sm:py-14 ${className}`}
    >
      {icon ? (
        <div
          aria-hidden="true"
          className="mb-5 flex h-16 w-16 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-2xl text-white/90"
        >
          {icon}
        </div>
      ) : null}
      {eyebrow ? (
        <p className="text-xs uppercase tracking-[0.24em] text-gold-muted">
          {eyebrow}
        </p>
      ) : null}
      <h2 className="mt-2 text-2xl font-semibold tracking-[-0.01em] text-white sm:text-[1.6rem]">
        {title}
      </h2>
      {body ? (
        <p className="mx-auto mt-3 max-w-md text-sm leading-7 text-text-muted">
          {body}
        </p>
      ) : null}
      {action ? (
        <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
          {action}
        </div>
      ) : null}
    </div>
  );
}
