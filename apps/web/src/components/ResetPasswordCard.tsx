"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import {
  normalizeAuthNext,
  readPersistedAuthNext,
} from "@/lib/auth-redirect";
import {
  getPasswordStrength,
  getPasswordValidationError,
} from "@/lib/auth-password";
import { getSupabaseBrowser } from "@/lib/supabase-browser";

export function ResetPasswordCard() {
  const t = useTranslations("webApp");
  const searchParams = useSearchParams();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [pendingNext, setPendingNext] = useState("/app");
  const [checkingSession, setCheckingSession] = useState(true);
  const [hasRecoverySession, setHasRecoverySession] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const passwordStrength = useMemo(() => getPasswordStrength(password), [password]);
  const passwordStrengthLabel = useMemo(() => {
    if (!password) return "";
    const labels = [
      t("passwordWeak"),
      t("passwordFair"),
      t("passwordGood"),
      t("passwordStrong"),
      t("passwordStrong"),
    ];
    return labels[passwordStrength] ?? "";
  }, [password, passwordStrength, t]);
  const passwordStrengthColor = useMemo(() => {
    const colors = ["bg-red-500", "bg-orange-400", "bg-yellow-400", "bg-emerald-400", "bg-emerald-400"];
    return colors[passwordStrength] ?? "bg-white/10";
  }, [passwordStrength]);

  useEffect(() => {
    let cancelled = false;

    const loadSession = async () => {
      setPendingNext(normalizeAuthNext(searchParams.get("next") || readPersistedAuthNext()));

      const supabase = getSupabaseBrowser();
      const { data: { session } } = await supabase.auth.getSession();
      if (cancelled) return;

      if (session) {
        setHasRecoverySession(true);
        setCheckingSession(false);
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, 600));
      const { data: { session: retrySession } } = await supabase.auth.getSession();
      if (cancelled) return;

      setHasRecoverySession(!!retrySession);
      setCheckingSession(false);
    };

    loadSession().catch(() => {
      if (cancelled) return;
      setHasRecoverySession(false);
      setCheckingSession(false);
    });

    return () => {
      cancelled = true;
    };
  }, [searchParams]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const validationErrorKey = getPasswordValidationError(password);
    if (validationErrorKey) {
      setError(t(validationErrorKey));
      setLoading(false);
      return;
    }

    if (password !== confirmPassword) {
      setError(t("passwordsDontMatch"));
      setLoading(false);
      return;
    }

    const supabase = getSupabaseBrowser();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      setHasRecoverySession(false);
      setError(t("resetPasswordInvalidSession"));
      setLoading(false);
      return;
    }

    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) {
      const normalizedMessage = updateError.message.toLowerCase();
      setError(
        normalizedMessage.includes("session") || normalizedMessage.includes("token")
          ? t("resetPasswordInvalidSession")
          : updateError.message
      );
      setLoading(false);
      return;
    }

    await supabase.auth.signOut();
    setLoading(false);
    setSuccess(true);
  };

  const loginHref = {
    pathname: "/auth/login" as const,
    query: pendingNext !== "/app" ? { next: pendingNext } : undefined,
  };

  const forgotPasswordHref = {
    pathname: "/auth/forgot-password" as const,
    query: pendingNext !== "/app" ? { next: pendingNext } : undefined,
  };

  if (checkingSession) {
    return (
      <div className="mx-auto w-full max-w-md rounded-[2rem] border border-border bg-card/90 p-8 text-center shadow-2xl shadow-black/30 backdrop-blur-md">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-accent/20 bg-accent/8">
          <div className="h-7 w-7 animate-spin rounded-full border-2 border-accent border-t-transparent" />
        </div>
        <h1 className="mt-5 text-3xl font-semibold text-white">{t("resetPassword")}</h1>
        <p className="mt-3 text-sm text-text-muted">{t("callbackWait")}</p>
      </div>
    );
  }

  if (success) {
    return (
      <div className="mx-auto w-full max-w-md rounded-[2rem] border border-border bg-card/90 p-8 text-center shadow-2xl shadow-black/30 backdrop-blur-md">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border border-emerald-400/30 bg-emerald-500/10 text-3xl text-emerald-200">
          &#10003;
        </div>
        <h1 className="mt-5 text-3xl font-semibold text-white">{t("passwordUpdated")}</h1>
        <p className="mt-3 text-sm leading-7 text-text-muted">{t("passwordUpdatedDesc")}</p>
        <div className="mt-6 flex flex-col gap-3">
          <Link
            href={loginHref}
            className="flex w-full items-center justify-center rounded-full bg-gold px-5 py-3.5 text-sm font-semibold text-bg transition-colors hover:bg-gold-soft"
          >
            {t("signIn")}
          </Link>
          <Link
            href="/"
            className="flex w-full items-center justify-center rounded-full border border-border px-5 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-card-hover"
          >
            {t("backToMarketing")}
          </Link>
        </div>
      </div>
    );
  }

  if (!hasRecoverySession) {
    return (
      <div className="mx-auto w-full max-w-md rounded-[2rem] border border-border bg-card/90 p-8 text-center shadow-2xl shadow-black/30 backdrop-blur-md">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border border-accent/30 bg-accent/10 text-3xl text-white">
          &#9888;
        </div>
        <h1 className="mt-5 text-3xl font-semibold text-white">{t("resetPassword")}</h1>
        <p className="mt-3 text-sm leading-7 text-text-muted">{t("resetPasswordInvalidSession")}</p>
        <div className="mt-6 flex flex-col gap-3">
          <Link
            href={forgotPasswordHref}
            className="flex w-full items-center justify-center rounded-full bg-gold px-5 py-3.5 text-sm font-semibold text-bg transition-colors hover:bg-gold-soft"
          >
            {t("sendResetLink")}
          </Link>
          <Link
            href={loginHref}
            className="flex w-full items-center justify-center rounded-full border border-border px-5 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-card-hover"
          >
            {t("backToLogin")}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-md rounded-[2rem] border border-border bg-card/90 p-8 shadow-2xl shadow-black/30 backdrop-blur-md">
      <div className="mb-8 text-center">
        <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full border border-accent/30 bg-accent/8 text-3xl text-white shadow-[0_0_30px_rgba(201,134,146,0.12)]">
          &#128274;
        </div>
        <h1 className="text-3xl font-semibold text-white">{t("resetPassword")}</h1>
        <p className="mt-2 text-sm text-text-muted">{t("enterNewPassword")}</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <label className="block">
          <span className="mb-2 block text-sm font-medium text-text-muted">{t("newPassword")}</span>
          <div className="flex gap-3">
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="********"
              className="min-w-0 flex-1 rounded-2xl border border-border bg-bg px-4 py-3 text-white outline-none transition-colors placeholder:text-text-dim focus:border-accent"
              autoComplete="new-password"
              autoFocus
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword((current) => !current)}
              className="rounded-2xl border border-border bg-bg px-4 py-3 text-sm font-medium text-text-muted transition-colors hover:bg-card-hover hover:text-white"
            >
              {showPassword ? t("hidePassword") : t("showPassword")}
            </button>
          </div>
        </label>

        {password ? (
          <div className="-mt-2 space-y-2">
            <div
              className="flex gap-1.5"
              role="meter"
              aria-label={t("newPassword")}
              aria-valuenow={passwordStrength}
              aria-valuemin={0}
              aria-valuemax={4}
              aria-valuetext={passwordStrengthLabel}
            >
              {Array.from({ length: 4 }, (_, index) => (
                <div
                  key={index}
                  className={`h-1.5 flex-1 rounded-full transition-colors ${
                    index < passwordStrength ? passwordStrengthColor : "bg-white/10"
                  }`}
                />
              ))}
            </div>
            <p className="text-xs text-text-dim" aria-live="polite">
              {passwordStrengthLabel || t("passwordHintStrong")}
            </p>
          </div>
        ) : null}

        <label className="block">
          <span className="mb-2 block text-sm font-medium text-text-muted">{t("confirmPassword")}</span>
          <div className="flex gap-3">
            <input
              type={showConfirmPassword ? "text" : "password"}
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="********"
              className="min-w-0 flex-1 rounded-2xl border border-border bg-bg px-4 py-3 text-white outline-none transition-colors placeholder:text-text-dim focus:border-accent"
              autoComplete="new-password"
              required
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword((current) => !current)}
              className="rounded-2xl border border-border bg-bg px-4 py-3 text-sm font-medium text-text-muted transition-colors hover:bg-card-hover hover:text-white"
            >
              {showConfirmPassword ? t("hidePassword") : t("showPassword")}
            </button>
          </div>
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
            t("resetPassword")
          )}
        </button>
      </form>
    </div>
  );
}
