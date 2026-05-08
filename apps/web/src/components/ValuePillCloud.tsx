/**
 * Cloud of value chips used in the "Match on values" feature card.
 *
 * Mirrors mobile `s.chip` style in
 * apps/mobile/components/profile/ProfilePublicMVPSections.tsx — small
 * rounded text chip on a glass surface. No emojis on the marketing
 * landing (per brand voice), labels stand on their own.
 */

export function ValuePillCloud({
  values,
  className = "",
}: {
  values: string[];
  className?: string;
}) {
  return (
    <ul
      className={`flex flex-wrap gap-1.5 ${className}`}
      aria-label="Personal values"
    >
      {values.map((label, i) => (
        <li
          key={`${label}-${i}`}
          className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] text-white/85"
        >
          {label}
        </li>
      ))}
    </ul>
  );
}
