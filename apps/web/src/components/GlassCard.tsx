import type { ReactNode } from "react";

/**
 * Glass-surface card matching the mobile AppTheme look:
 *   bg: rgba(255,255,255,0.05)
 *   border: rgba(255,255,255,0.10)
 *   backdrop-blur for the slight depth without committing to heavy glass.
 *
 * Use as the default container for any premium card on the marketing
 * landing — feature cards, bento cells, profile-depth previews, etc.
 */
export function GlassCard({
  children,
  className = "",
  as: Tag = "div",
}: {
  children: ReactNode;
  className?: string;
  as?: "div" | "article" | "section" | "li";
}) {
  return (
    <Tag
      className={`group relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.05] backdrop-blur-sm transition-colors duration-300 hover:border-white/15 hover:bg-white/[0.07] ${className}`}
    >
      {children}
    </Tag>
  );
}
