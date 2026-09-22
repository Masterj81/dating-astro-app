// JUNO-13 phase 2 (2026-09-22): this boundary exists for the CSP contract as
// much as for the UX. An unmatched /app URL previously fell through to Next's
// BUILT-IN not-found render, whose pipeline does NOT apply the request CSP
// nonce (measured: 0/13 scripts nonced while the response carried the nonce'd
// enforced policy — every script would be blocked, leaving a dead page).
// A segment not-found.tsx renders through the normal app pipeline, so its
// scripts carry the nonce like every /app page.
import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";

export default function AppNotFound() {
  const t = useTranslations("notFound");
  const c = useTranslations("common");

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <div className="mb-4 text-6xl">🌌</div>
      <h1 className="mb-2 text-3xl font-bold text-white">{t("title")}</h1>
      <p className="mb-6 text-text-muted">{t("description")}</p>
      <Link
        href="/app"
        className="rounded-full bg-gold px-6 py-2.5 text-sm font-medium text-bg transition-colors hover:bg-gold-soft"
      >
        {c("backToHome")}
      </Link>
    </div>
  );
}
