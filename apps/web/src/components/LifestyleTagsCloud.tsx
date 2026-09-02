/**
 * Lifestyle tags cloud with optional "shared" highlighting.
 *
 * Mirrors mobile `ProfilePublicMVPSections` lifestyle block — chips for
 * each tag, plus an "in common" badge counting tags shared with the viewer.
 *
 * On the marketing landing, used in the "See what you share" feature card
 * to demo the in-common mechanic with a fixed set of example tags.
 */

export function LifestyleTagsCloud({
  tags,
  sharedTags = [],
  showInCommonBadge = true,
  className = "",
}: {
  tags: string[];
  sharedTags?: string[];
  showInCommonBadge?: boolean;
  className?: string;
}) {
  const sharedSet = new Set(sharedTags);
  const sharedCount = tags.filter((t) => sharedSet.has(t)).length;

  return (
    <div className={className}>
      {showInCommonBadge && sharedCount > 0 && (
        <p className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent/10 px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-accent">
          <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-gold" />
          {sharedCount} in common
        </p>
      )}
      <ul className="flex flex-wrap gap-1.5" aria-label="Lifestyle tags">
        {tags.map((label, i) => {
          const shared = sharedSet.has(label);
          return (
            <li
              key={`${label}-${i}`}
              className={
                shared
                  ? "rounded-full border border-accent/40 bg-accent/15 px-2.5 py-1 text-[11px] font-medium text-white"
                  : "rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] text-white/85"
              }
            >
              {label}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
