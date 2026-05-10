/**
 * Lightweight skeleton primitives used in place of plain spinners.
 *
 * Three reasons we prefer skeletons over the previous accent-color spinner:
 *   1. The shape of the final content is implied immediately, so perceived
 *      load time drops even when the underlying request hasn't sped up.
 *   2. No layout shift when data arrives — skeletons reserve the same box
 *      dimensions as the real card / row.
 *   3. The pulse animation is paused by the existing global
 *      `prefers-reduced-motion: reduce` rule in globals.css, so users with
 *      that preference still see the dimmed boxes (no flicker, no cost).
 *
 * Build skeletons by composing <Skeleton /> with utility classes for size
 * and corner radius. The primitive is purely presentational and carries
 * `role="status"` + `aria-label` so assistive tech announces the loading
 * state once per group.
 */

type SkeletonProps = {
  className?: string;
  /**
   * When true (default for a top-level skeleton), this node carries the
   * `role="status"` and `aria-label`. Set to false on inner pieces of a
   * composite skeleton so screen readers don't announce the loading state
   * once per shape.
   */
  announce?: boolean;
  ariaLabel?: string;
};

export function Skeleton({
  className = "",
  announce = false,
  ariaLabel,
}: SkeletonProps) {
  const a11y = announce
    ? { role: "status" as const, "aria-label": ariaLabel ?? "Loading" }
    : { "aria-hidden": true as const };
  return (
    <div
      {...a11y}
      className={`animate-pulse bg-white/[0.06] ${className}`}
    />
  );
}

/**
 * Convenience composites for the most repeated shapes in the app shell.
 * They all delegate the "announce" duty to a single wrapping <div role="status">
 * so screen readers hear "Loading" once per region, not per box.
 */

type ListSkeletonProps = {
  rows?: number;
  ariaLabel: string;
};

export function ChatListSkeleton({ rows = 4, ariaLabel }: ListSkeletonProps) {
  return (
    <div role="status" aria-label={ariaLabel} className="space-y-2">
      <div className="overflow-hidden rounded-2xl border border-border">
        {Array.from({ length: rows }).map((_, i) => (
          <div
            key={i}
            className={`flex items-center gap-4 px-5 py-4 ${
              i > 0 ? "border-t border-white/6" : ""
            }`}
          >
            <Skeleton className="h-14 w-14 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-1/3 rounded-md" />
              <Skeleton className="h-3 w-2/3 rounded-md" />
              <Skeleton className="h-3 w-1/4 rounded-md" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

type GridSkeletonProps = {
  cards?: number;
  ariaLabel: string;
};

export function DashboardGridSkeleton({
  cards = 4,
  ariaLabel,
}: GridSkeletonProps) {
  return (
    <div role="status" aria-label={ariaLabel} className="space-y-6">
      <Skeleton className="h-20 rounded-2xl" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: cards }).map((_, i) => (
          <div
            key={i}
            className={`rounded-2xl border border-border bg-white/[0.03] p-5 ${
              i === 0 ? "sm:col-span-2 xl:col-span-2 xl:row-span-2" : ""
            }`}
          >
            <div className="flex items-center gap-3">
              <Skeleton className="h-10 w-10 rounded-xl" />
              <Skeleton className="h-3 w-16 rounded-md" />
            </div>
            <Skeleton className="mt-4 h-5 w-2/3 rounded-md" />
            <Skeleton className="mt-2 h-3 w-full rounded-md" />
            <Skeleton className="mt-1 h-3 w-3/4 rounded-md" />
          </div>
        ))}
      </div>
    </div>
  );
}

type CardSkeletonProps = {
  ariaLabel: string;
  /** Height utility — pass e.g. `h-[640px]` to match a Discover card. */
  className?: string;
};

export function FullCardSkeleton({
  ariaLabel,
  className = "h-[520px]",
}: CardSkeletonProps) {
  return (
    <div
      role="status"
      aria-label={ariaLabel}
      className={`overflow-hidden rounded-[2rem] border border-border bg-white/[0.03] ${className}`}
    >
      <Skeleton className="h-2/3 w-full" />
      <div className="space-y-3 p-6">
        <Skeleton className="h-5 w-1/3 rounded-md" />
        <Skeleton className="h-3 w-2/3 rounded-md" />
        <Skeleton className="h-3 w-1/2 rounded-md" />
      </div>
    </div>
  );
}

export function ChatThreadSkeleton({ ariaLabel }: { ariaLabel: string }) {
  return (
    <div
      role="status"
      aria-label={ariaLabel}
      className="grid gap-6 xl:grid-cols-[0.55fr_1.45fr]"
    >
      <aside className="hidden rounded-[2rem] border border-border bg-card/90 p-6 xl:block">
        <Skeleton className="h-3 w-16 rounded-md" />
        <Skeleton className="mt-3 h-5 w-2/3 rounded-md" />
        <div className="mt-5 space-y-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="flex items-center gap-3 rounded-[1.25rem] border border-border bg-bg/70 px-4 py-4"
            >
              <Skeleton className="h-12 w-12 rounded-2xl" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3 w-1/2 rounded-md" />
                <Skeleton className="h-3 w-2/3 rounded-md" />
              </div>
            </div>
          ))}
        </div>
      </aside>
      <section className="rounded-[2rem] border border-border bg-card/90 p-6">
        <div className="flex flex-wrap items-center gap-4 rounded-[1.5rem] border border-border bg-bg/60 px-5 py-4">
          <Skeleton className="h-16 w-16 rounded-2xl" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3 w-20 rounded-md" />
            <Skeleton className="h-5 w-1/3 rounded-md" />
            <Skeleton className="h-3 w-1/4 rounded-md" />
          </div>
        </div>
        <div className="mt-6 space-y-4 rounded-[1.5rem] border border-border bg-bg/40 p-4">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className={`flex ${i % 2 === 0 ? "justify-start" : "justify-end"}`}
            >
              <Skeleton
                className={`h-12 ${i === 0 ? "w-3/4" : i === 1 ? "w-1/2" : i === 2 ? "w-2/3" : "w-1/3"} rounded-[1.5rem]`}
              />
            </div>
          ))}
        </div>
        <div className="mt-6 flex gap-3">
          <Skeleton className="h-24 flex-1 rounded-[1.5rem]" />
          <Skeleton className="h-12 w-24 self-end rounded-full" />
        </div>
      </section>
    </div>
  );
}

export function SynastryOverviewSkeleton({ ariaLabel }: { ariaLabel: string }) {
  return (
    <div
      role="status"
      aria-label={ariaLabel}
      className="grid gap-6 xl:grid-cols-[0.72fr_1.28fr]"
    >
      <aside className="rounded-[2rem] border border-border bg-card/90 p-6">
        <Skeleton className="h-3 w-16 rounded-md" />
        <Skeleton className="mt-3 h-5 w-2/3 rounded-md" />
        <div className="mt-5 space-y-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="flex items-center gap-3 rounded-[1.25rem] border border-border bg-bg/70 px-4 py-4"
            >
              <Skeleton className="h-12 w-12 rounded-2xl" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3 w-1/2 rounded-md" />
                <Skeleton className="h-3 w-1/3 rounded-md" />
              </div>
              <Skeleton className="h-6 w-12 rounded-full" />
            </div>
          ))}
        </div>
      </aside>
      <section className="space-y-6">
        <div className="rounded-[2rem] border border-border bg-card/90 p-6">
          <div className="grid gap-4 md:grid-cols-[1fr_auto_1fr] md:items-center">
            <Skeleton className="h-20 rounded-[1.5rem]" />
            <Skeleton className="hidden h-6 w-6 rounded-full md:block" />
            <Skeleton className="h-20 rounded-[1.5rem]" />
          </div>
          <div className="mt-6 grid gap-4 md:grid-cols-[auto_1fr] md:items-center">
            <Skeleton className="h-32 w-32 rounded-full" />
            <div className="space-y-3">
              <Skeleton className="h-3 w-full rounded-md" />
              <Skeleton className="h-3 w-2/3 rounded-md" />
            </div>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32 rounded-[1.5rem]" />
          ))}
        </div>
      </section>
    </div>
  );
}
