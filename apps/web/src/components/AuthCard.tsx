"use client";

import Image from "next/image";
import { useMemo, useState, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link, useRouter, usePathname } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { getProfileSetupState, isWebProfileSetupIncomplete } from "@/lib/web-account";
import { getSupabaseBrowser } from "@/lib/supabase-browser";

type AuthMode = "login" | "signup";
type OAuthProvider = "google" | "apple" | "facebook";

type AuthCardProps = {
  mode: AuthMode;
};

export function AuthCard({ mode }: AuthCardProps) {
  const t = useTranslations("webApp");
  const tLang = useTranslations("language");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<OAuthProvider | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [langOpen, setLangOpen] = useState(false);

  const isSignup = mode === "signup";

  const title = useMemo(
    () => (isSignup ? t("createAccountTitle") : t("signInTitle")),
    [isSignup, t]
  );

  const subtitle = useMemo(
    () => (isSignup ? t("createAccountSubtitle") : t("signInSubtitle")),
    [isSignup, t]
  );

  const switchLocale = (nextLocale: string) => {
    router.replace(pathname, { locale: nextLocale });
    setLangOpen(false);
  };

  const routeAfterAuth = async (userId: string) => {
    try {
      const profile = await getProfileSetupState(userId);
      router.replace(isWebProfileSetupIncomplete(profile) ? "/app/setup" : "/app");
    } catch {
      router.replace("/app");
    }
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    const supabase = getSupabaseBrowser();

    if (isSignup) {
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: name,
            name,
          },
          emailRedirectTo: `${window.location.origin}/${locale}/auth/login`,
        },
      });

      setLoading(false);

      if (signUpError) {
        setError(signUpError.message);
        return;
      }

      if (signUpData.session) {
        await routeAfterAuth(signUpData.session.user.id);
        return;
      }

      if (typeof window !== "undefined") {
        window.sessionStorage.setItem("pendingSignupEmail", email);
      }

      setSuccess(t("checkEmail"));
      router.replace("/auth/verify-email");
      return;
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setLoading(false);

    if (signInError) {
      setError(signInError.message);
      return;
    }

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (session?.user?.id) {
      await routeAfterAuth(session.user.id);
      return;
    }

    router.replace("/app");
  };

  const handleOAuth = async (provider: OAuthProvider) => {
    setError(null);
    setSuccess(null);
    setOauthLoading(provider);

    const { error: oauthError } = await getSupabaseBrowser().auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/${locale}/app`,
      },
    });

    if (oauthError) {
      setOauthLoading(null);
      setError(oauthError.message);
    }
  };

  return (
    <div className="mx-auto w-full max-w-md rounded-[2rem] border border-border bg-card/90 p-8 shadow-2xl shadow-black/30 backdrop-blur-md">
      <div className="mb-6 flex justify-end">
        <div className="relative">
          <button
            type="button"
            onClick={() => setLangOpen((open) => !open)}
            className="inline-flex items-center gap-2 rounded-full border border-border bg-bg px-4 py-2 text-sm text-white transition-colors hover:bg-card-hover"
          >
            <span>{tLang(locale)}</span>
            <span
              className={`text-[10px] transition-transform ${
                langOpen ? "rotate-180" : ""
              }`}
            >
              ▼
            </span>
          </button>
          {langOpen ? (
            <div className="absolute right-0 top-full z-20 mt-2 w-40 rounded-2xl border border-border bg-bg-secondary py-2 shadow-xl">
              {routing.locales.map((loc) => (
                <button
                  key={loc}
                  type="button"
                  onClick={() => switchLocale(loc)}
                  className={`block w-full px-4 py-2 text-left text-sm transition-colors hover:bg-card-hover ${
                    loc === locale ? "text-accent" : "text-text-muted"
                  }`}
                >
                  {tLang(loc)}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
      <div className="mb-8 text-center">
        <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full border border-accent/30 bg-accent/8 p-2 shadow-[0_0_30px_rgba(233,69,96,0.12)]">
          <Image
            src="/icon-192.png"
            alt="AstroDating"
            width={56}
            height={56}
            className="h-14 w-14 rounded-2xl"
            priority
          />
        </div>
        <h1 className="text-3xl font-semibold text-white">{title}</h1>
        <p className="mt-2 text-sm text-text-muted">{subtitle}</p>
      </div>

      <div className="space-y-3">
        <OAuthButton
          label={t("continueWithGoogle")}
          disabled={loading || oauthLoading !== null}
          loading={oauthLoading === "google"}
          onClick={() => handleOAuth("google")}
          icon={<GoogleIcon />}
        />
        <OAuthButton
          label={t("continueWithApple")}
          disabled={loading || oauthLoading !== null}
          loading={oauthLoading === "apple"}
          onClick={() => handleOAuth("apple")}
          icon={<AppleIcon />}
        />
        <OAuthButton
          label={t("continueWithFacebook")}
          disabled={loading || oauthLoading !== null}
          loading={oauthLoading === "facebook"}
          onClick={() => handleOAuth("facebook")}
          icon={<FacebookIcon />}
        />
      </div>

      <div className="my-6 flex items-center gap-3">
        <div className="h-px flex-1 bg-border" />
        <span className="text-xs uppercase tracking-[0.24em] text-text-dim">
          {t("orContinueWithEmail")}
        </span>
        <div className="h-px flex-1 bg-border" />
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {isSignup ? (
          <>
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-text-muted">{t("name")}</span>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={t("namePlaceholder")}
                className="w-full rounded-2xl border border-border bg-bg px-4 py-3 text-white outline-none transition-colors placeholder:text-text-dim focus:border-accent"
                required
              />
            </label>
          </>
        ) : null}

        <label className="block">
          <span className="mb-2 block text-sm font-medium text-text-muted">{t("email")}</span>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder={t("emailPlaceholder")}
            className="w-full rounded-2xl border border-border bg-bg px-4 py-3 text-white outline-none transition-colors placeholder:text-text-dim focus:border-accent"
            required
          />
        </label>

        <label className="block">
          <span className="mb-2 block text-sm font-medium text-text-muted">{t("password")}</span>
          <div className="flex gap-3">
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="********"
              className="min-w-0 flex-1 rounded-2xl border border-border bg-bg px-4 py-3 text-white outline-none transition-colors placeholder:text-text-dim focus:border-accent"
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

        {error ? (
          <div className="rounded-2xl border border-accent/40 bg-accent/10 px-4 py-3 text-sm text-[#ffd0d7]">
            {error}
          </div>
        ) : null}

        {success ? (
          <div className="rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
            {success}
          </div>
        ) : null}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-full bg-accent px-5 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-70"
        >
          {loading ? t("loading") : isSignup ? t("createAccount") : t("signIn")}
        </button>
      </form>

      <div className="mt-6 text-center text-sm text-text-muted">
        {isSignup ? t("alreadyHaveAccount") : t("needAccount")}{" "}
        <Link
          href={isSignup ? "/auth/login" : "/auth/signup"}
          className="font-medium text-accent hover:text-accent-hover"
        >
          {isSignup ? t("signIn") : t("createAccount")}
        </Link>
      </div>

      <div className="mt-4 text-center">
        <Link
          href="/"
          className="text-sm text-text-dim transition-colors hover:text-white"
        >
          {pathname === "/auth/login" || pathname === "/auth/signup"
            ? t("backToMarketing")
            : t("backToSite")}
        </Link>
      </div>
    </div>
  );
}

function OAuthButton({
  label,
  icon,
  disabled,
  loading,
  onClick,
}: {
  label: string;
  icon: ReactNode;
  disabled: boolean;
  loading: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex w-full items-center justify-center gap-3 rounded-full border border-border bg-bg px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-card-hover disabled:cursor-not-allowed disabled:opacity-70"
    >
      <span className="flex h-7 w-7 items-center justify-center rounded-full border border-border bg-card">
        {icon}
      </span>
      <span>{loading ? "..." : label}</span>
    </button>
  );
}

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M12 10.2v3.9h5.4c-.2 1.3-1.5 3.8-5.4 3.8-3.3 0-6-2.7-6-6s2.7-6 6-6c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.7 3.3 14.6 2.4 12 2.4A9.6 9.6 0 0 0 2.4 12 9.6 9.6 0 0 0 12 21.6c5.5 0 9.1-3.9 9.1-9.3 0-.6-.1-1.1-.2-1.6z"
      />
      <path
        fill="#4285F4"
        d="M2.4 7.5l3.2 2.3A6 6 0 0 1 12 6c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.7 3.3 14.6 2.4 12 2.4c-3.7 0-6.8 2.1-8.4 5.1z"
      />
      <path
        fill="#FBBC05"
        d="M2.4 16.5A9.6 9.6 0 0 0 12 21.6c2.5 0 4.7-.8 6.3-2.3l-3-2.4c-.8.5-1.9 1-3.3 1-2.5 0-4.7-1.7-5.5-4.1z"
      />
      <path
        fill="#34A853"
        d="M21.1 12.3c0-.6-.1-1.1-.2-1.6H12v3.9h5.4c-.3 1.4-1.1 2.4-2.1 3.1l3 2.4c1.8-1.7 2.8-4.2 2.8-7.8z"
      />
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#FFFFFF"
        d="M16.37 12.3c.02 2.2 1.93 2.94 1.95 2.95-.02.05-.3 1.04-.98 2.06-.59.88-1.2 1.76-2.16 1.78-.94.02-1.24-.56-2.32-.56-1.08 0-1.42.54-2.3.58-.92.03-1.62-.92-2.22-1.8-1.23-1.78-2.17-5.03-.91-7.23.63-1.1 1.75-1.8 2.96-1.82.9-.02 1.75.61 2.32.61.57 0 1.64-.75 2.76-.64.47.02 1.79.19 2.64 1.43-.07.04-1.58.92-1.56 2.64Zm-1.87-5.48c.49-.6.82-1.44.73-2.27-.71.03-1.57.47-2.08 1.06-.45.52-.85 1.36-.74 2.16.79.06 1.6-.4 2.09-.95Z"
      />
    </svg>
  );
}

function FacebookIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#1877F2"
        d="M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07c0 6.03 4.39 11.03 10.13 11.93v-8.44H7.08v-3.5h3.05V9.39c0-3.03 1.79-4.7 4.54-4.7 1.31 0 2.69.24 2.69.24v2.97h-1.52c-1.5 0-1.97.94-1.97 1.9v2.27h3.35l-.54 3.5h-2.81V24C19.61 23.1 24 18.1 24 12.07Z"
      />
      <path
        fill="#FFFFFF"
        d="M16.67 15.57l.54-3.5h-3.35V9.8c0-.96.47-1.9 1.97-1.9h1.52V4.93s-1.38-.24-2.69-.24c-2.75 0-4.54 1.67-4.54 4.7v2.68H7.08v3.5h3.05V24a12.1 12.1 0 0 0 3.74 0v-8.43h2.8Z"
      />
    </svg>
  );
}
