"use client";

import { FormEvent, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import {
  buildPasswordResetCallbackUrl,
  normalizeAuthNext,
  persistAuthNext,
  readPersistedAuthNext,
} from "@/lib/auth-redirect";
import { getSupabaseBrowser } from "@/lib/supabase-browser";

export function ForgotPasswordCard() {
  const t = useTranslations("webApp");
  const locale = useLocale();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [pendingNext, setPendingNext] = useState("/app");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submittedEmail, setSubmittedEmail] = useState<string | null>(null);

  useEffect(() => {
    const storedNext = readPersistedAuthNext();
    setPendingNext(normalizeAuthNext(searchParams.get("next") || storedNext));
  }, [searchParams]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const normalizedEmail = email.trim().toLowerCase();
    persistAuthNext(pendingNext);

    const { error: resetError } = await getSupabaseBrowser().auth.resetPasswordForEmail(
      normalizedEmail,
      {
        redirectTo: buildPasswordResetCallbackUrl(locale),
      }
    );

    setLoading(false);

    if (resetError) {
      setError(resetError.message);
      return;
    }

    setSubmittedEmail(normalizedEmail);
  };

  const loginHref = {
    pathname: "/auth/login" as const,
    query: pendingNext !== "/app" ? { next: pendingNext } : undefined,
  };

  return (
    <div className="mx-auto w-full max-w-md rounded-[2rem] border border-border bg-card/90 p-8 shadow-2xl shadow-black/30 backdrop-blur-md">
      <div className="mb-8 text-center">
        <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full border border-accent/30 bg-accent/8 text-3xl text-white shadow-[0_0_30px_rgba(201,134,146,0.12)]">
          &#9993;
        </div>
        <h1 className="text-3xl font-semibold text-white">
          {submittedEmail ? t("resetEmailSent") : t("forgotPassword")}
        </h1>
        <p className="mt-2 text-sm leading-7 text-text-muted">
          {submittedEmail
            ? t("resetEmailSentDesc", { email: submittedEmail })
            : t("forgotPasswordSubtitle")}
        </p>
      </div>

      {submittedEmail ? (
        <div className="space-y-3">
          <div className="rounded-2xl border border-border bg-bg px-4 py-3 text-sm text-white">
            {submittedEmail}
          </div>
          <Link
            href={loginHref}
            className="flex w-full items-center justify-center rounded-full bg-gold px-5 py-3.5 text-sm font-semibold text-bg transition-colors hover:bg-gold-soft"
          >
            {t("backToLogin")}
          </Link>
          <Link
            href="/"
            className="flex w-full items-center justify-center rounded-full border border-border px-5 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-card-hover"
          >
            {t("backToMarketing")}
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5">
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-text-muted">{t("email")}</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder={t("emailPlaceholder")}
              className="w-full rounded-2xl border border-border bg-bg px-4 py-3 text-white outline-none transition-colors placeholder:text-text-dim focus:border-accent"
              autoComplete="email"
              autoFocus
              required
            />
          </label>

          {error ? (
            <div
              role="alert"
              className="flex items-start gap-3 rounded-2xl border border-accent/40 bg-accent/10 px-4 py-3 text-sm text-[#ffd0d7]"
            >
              <span className="mt-0.5 shrink-0" aria-hidden="true">
                &#9888;
              </span>
              <span>{error}</span>
            </div>
          ) : null}

          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-gold px-5 py-3.5 text-sm font-semibold text-bg transition-all hover:bg-gold-soft hover:shadow-[0_0_20px_rgba(201,134,146,0.3)] disabled:cursor-not-allowed disabled:opacity-70"
          >
            {loading ? (
              <>
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                {t("loading")}
              </>
            ) : (
              t("sendResetLink")
            )}
          </button>

          <Link
            href={loginHref}
            className="flex w-full items-center justify-center rounded-full border border-border px-5 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-card-hover"
          >
            {t("backToLogin")}
          </Link>
        </form>
      )}
    </div>
  );
}
