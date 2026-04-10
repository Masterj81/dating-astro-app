import { Link } from "@/i18n/navigation";
import { SITE } from "@/lib/constants";
import { getTranslations, setRequestLocale } from "next-intl/server";

type InvitePageProps = {
  params: Promise<{ code: string; locale: string }>;
};

export default async function InvitePage({ params }: InvitePageProps) {
  const { code, locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "invite" });
  const upperCode = code.toUpperCase();

  const VALID_CODE_REGEX = /^[A-Z0-9]{4,12}$/;
  if (!VALID_CODE_REGEX.test(upperCode)) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="w-full max-w-md text-center">
          <div className="mx-auto mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-accent/15 text-5xl">
            ⚠️
          </div>
          <h1 className="text-3xl font-bold text-white">{t("invalidCode")}</h1>
          <p className="mt-3 text-lg text-text-muted">
            {t("invalidCodeDesc")}
          </p>
          <Link
            href="/"
            className="mt-8 inline-flex items-center justify-center rounded-full bg-accent px-6 py-4 text-base font-semibold text-white transition-colors hover:bg-accent-hover"
          >
            {t("goToHomepage")}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md text-center">
        {/* Icon */}
        <div className="mx-auto mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-accent/15 text-5xl">
          🎁
        </div>

        {/* Title */}
        <h1 className="text-3xl font-bold text-white">
          {t("youveBeenInvited")}
        </h1>
        <p
          className="mt-3 text-lg text-text-muted"
          dangerouslySetInnerHTML={{ __html: t("joinReward") }}
        />

        {/* Code display */}
        <div className="mt-8 rounded-2xl border border-accent/20 bg-accent/8 p-6">
          <p className="text-xs uppercase tracking-widest text-text-dim">{t("yourReferralCode")}</p>
          <p className="mt-2 text-3xl font-bold tracking-[0.2em] text-white">{upperCode}</p>
          <p className="mt-3 text-sm text-text-muted">
            {t("enterCodeAfterSignup")}
          </p>
        </div>

        {/* CTAs */}
        <div className="mt-8 space-y-3">
          <a
            href={`${SITE.links.playStore}&referrer=utm_source%3Dreferral%26utm_content%3D${upperCode}`}
            className="flex items-center justify-center gap-2 rounded-full bg-accent px-6 py-4 text-base font-semibold text-white transition-colors hover:bg-accent-hover"
          >
            📱 {t("downloadGooglePlay")}
          </a>
          <Link
            href="/auth/signup"
            className="flex items-center justify-center gap-2 rounded-full border border-border px-6 py-4 text-base font-semibold text-white transition-colors hover:bg-card-hover"
          >
            🌐 {t("signUpWeb")}
          </Link>
        </div>

        {/* How it works */}
        <div className="mt-10 space-y-4 text-left">
          <p className="text-xs uppercase tracking-widest text-text-dim">{t("howItWorks")}</p>
          <div className="flex items-start gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/10 text-sm font-bold text-white">1</span>
            <p className="text-sm text-text-muted">{t("step1")}</p>
          </div>
          <div className="flex items-start gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/10 text-sm font-bold text-white">2</span>
            <p className="text-sm text-text-muted">{t("step2")}</p>
          </div>
          <div className="flex items-start gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/10 text-sm font-bold text-white">3</span>
            <p
              className="text-sm text-text-muted"
              dangerouslySetInnerHTML={{ __html: t("step3", { code: upperCode }) }}
            />
          </div>
          <div className="flex items-start gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent/20 text-sm font-bold text-accent">✓</span>
            <p className="text-sm text-text-muted">{t("step4")}</p>
          </div>
        </div>

        {/* Footer */}
        <p className="mt-10 text-xs text-text-dim">
          {t("footer")} ✨
        </p>
      </div>
    </div>
  );
}
