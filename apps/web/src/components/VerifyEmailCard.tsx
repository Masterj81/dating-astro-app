"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { getSupabaseBrowser } from "@/lib/supabase-browser";

export function VerifyEmailCard() {
  const t = useTranslations("webApp");
  const locale = useLocale();
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const nextEmail = window.sessionStorage.getItem("pendingSignupEmail");
    setPendingEmail(nextEmail);
  }, []);

  const handleResend = async () => {
    if (!pendingEmail) {
      setError(t("verifyEmailMissingEmail"));
      setSuccess(null);
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    const { error: resendError } = await getSupabaseBrowser().auth.resend({
      type: "signup",
      email: pendingEmail,
      options: {
        emailRedirectTo: `${window.location.origin}/${locale}/auth/login`,
      },
    });

    setLoading(false);

    if (resendError) {
      setError(resendError.message);
      return;
    }

    setSuccess(t("verifyEmailResent"));
  };

  return (
    <div className="mx-auto w-full max-w-md rounded-[2rem] border border-border bg-card/90 p-8 text-center shadow-2xl shadow-black/30 backdrop-blur-md">
      <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full border border-emerald-400/30 bg-emerald-500/10 text-3xl text-emerald-200">
        @
      </div>
      <h1 className="text-3xl font-semibold text-white">{t("checkEmail")}</h1>
      {pendingEmail ? (
        <p className="mt-4 rounded-full border border-border bg-bg px-4 py-3 text-sm text-white">
          {pendingEmail}
        </p>
      ) : null}
      <p className="mt-4 text-sm leading-7 text-text-muted">{t("verifyEmailBody")}</p>
      {error ? (
        <div className="mt-4 rounded-2xl border border-accent/40 bg-accent/10 px-4 py-3 text-sm text-[#ffd0d7]">
          {error}
        </div>
      ) : null}
      {success ? (
        <div className="mt-4 rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          {success}
        </div>
      ) : null}
      <div className="mt-6 flex flex-col gap-3">
        <button
          type="button"
          onClick={handleResend}
          disabled={loading}
          className="rounded-full border border-border px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-card-hover disabled:cursor-not-allowed disabled:opacity-70"
        >
          {loading ? t("loading") : t("verifyEmailResendButton")}
        </button>
        <Link
          href="/auth/login"
          className="rounded-full bg-accent px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-accent-hover"
        >
          {t("signIn")}
        </Link>
        <Link
          href="/"
          className="rounded-full border border-border px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-card-hover"
        >
          {t("backToMarketing")}
        </Link>
      </div>
    </div>
  );
}
