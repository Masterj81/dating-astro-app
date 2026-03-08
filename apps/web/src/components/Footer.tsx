import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { SITE } from "@/lib/constants";
import { DownloadButtons } from "./DownloadButtons";

export function Footer() {
  const t = useTranslations("footer");
  const c = useTranslations("common");

  return (
    <footer className="border-t border-border bg-bg-secondary">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:grid-cols-3">
        {/* Brand */}
        <div>
          <h3 className="mb-3 text-lg font-bold text-white">{SITE.name}</h3>
          <p className="text-sm text-text-muted">{c("madeWith")}</p>
        </div>

        {/* Links */}
        <div>
          <h4 className="mb-3 text-sm font-semibold uppercase tracking-wider text-text-dim">
            {t("links")}
          </h4>
          <ul className="space-y-2 text-sm">
            <li>
              <Link href="/help" className="text-text-muted transition-colors hover:text-white">
                {t("helpCenter")}
              </Link>
            </li>
            <li>
              <Link href="/contact" className="text-text-muted transition-colors hover:text-white">
                {t("contactUs")}
              </Link>
            </li>
            <li>
              <Link href="/privacy" className="text-text-muted transition-colors hover:text-white">
                {t("privacyPolicy")}
              </Link>
            </li>
            <li>
              <Link href="/terms" className="text-text-muted transition-colors hover:text-white">
                {t("termsOfService")}
              </Link>
            </li>
            <li>
              <Link href="/safety" className="text-text-muted transition-colors hover:text-white">
                {t("safetyStandards")}
              </Link>
            </li>
            <li>
              <Link href="/account/delete" className="text-text-muted transition-colors hover:text-white">
                {t("deleteAccount")}
              </Link>
            </li>
          </ul>
        </div>

        {/* Download */}
        <div>
          <h4 className="mb-3 text-sm font-semibold uppercase tracking-wider text-text-dim">
            {t("download")}
          </h4>
          <DownloadButtons size="sm" />
        </div>
      </div>

      <div className="border-t border-border px-4 py-4 text-center text-xs text-text-dim">
        {c("copyright", { year: new Date().getFullYear() })}
      </div>
    </footer>
  );
}
