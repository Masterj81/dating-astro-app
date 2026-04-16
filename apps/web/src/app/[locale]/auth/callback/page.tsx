"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import {
  clearPersistedAuthNext,
  normalizeAuthNext,
  readPersistedAuthNext,
} from "@/lib/auth-redirect";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import { getProfileSetupState, isWebProfileSetupIncomplete } from "@/lib/web-account";

export default function AuthCallbackPage() {
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations("webApp");
  const [status, setStatus] = useState<"loading" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const handleCallback = async () => {
      try {
        const supabase = getSupabaseBrowser();

        // Check for error params in the URL hash (e.g. OAuth denial)
        if (typeof window !== "undefined") {
          const hash = window.location.hash;
          if (hash.includes("error=")) {
            const params = new URLSearchParams(hash.replace("#", ""));
            const errorDesc = params.get("error_description") || params.get("error");
            setErrorMessage(errorDesc);
            setStatus("error");
            return;
          }
        }

        // Support both PKCE (`?code=...`) and implicit (`#access_token=...`) return shapes.
        if (typeof window !== "undefined") {
          const urlParams = new URLSearchParams(window.location.search);
          const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
          const code = urlParams.get("code");
          const accessToken = hashParams.get("access_token");
          const refreshToken = hashParams.get("refresh_token");

          const tokenHash = urlParams.get("token_hash");
          const otpType = urlParams.get("type");

          if (code) {
            const { error: codeError } = await supabase.auth.exchangeCodeForSession(code);
            if (codeError) {
              console.error("[AuthCallback] exchangeCode error:", codeError.message);
              setErrorMessage(codeError.message);
              setStatus("error");
              return;
            }
          } else if (tokenHash) {
            // Supabase email link (signup confirmation, magic link, recovery, etc.)
            const validTypes = ["signup", "magiclink", "recovery", "email_change", "invite"] as const;
            const verifyType = (validTypes.includes(otpType as typeof validTypes[number])
              ? otpType
              : "signup") as typeof validTypes[number];

            const { error: otpError } = await supabase.auth.verifyOtp({
              token_hash: tokenHash,
              type: verifyType,
            });
            if (otpError) {
              console.error("[AuthCallback] verifyOtp error:", otpError.message);
              setErrorMessage(otpError.message);
              setStatus("error");
              return;
            }

            // Clean token_hash from URL after verification
            const cleanUrl = `${window.location.origin}${window.location.pathname}${
              window.location.search
                .replace(/[?&]token_hash=[^&]+/, "")
                .replace(/[?&]type=[^&]+/, "")
                .replace(/^&/, "?")
                .replace(/^\?$/, "") || ""
            }`;
            window.history.replaceState({}, document.title, cleanUrl);
          } else if (accessToken && refreshToken) {
            const { error: setSessionError } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });

            if (setSessionError) {
              console.error("[AuthCallback] setSession error:", setSessionError.message);
              setErrorMessage(setSessionError.message);
              setStatus("error");
              return;
            }

            // Remove tokens from the address bar once we have stored the session.
            const cleanUrl = `${window.location.origin}${window.location.pathname}${window.location.search}`;
            window.history.replaceState({}, document.title, cleanUrl);
          }
        }

        const { data: { session } } = await supabase.auth.getSession();
        const requestedNext =
          typeof window !== "undefined"
            ? normalizeAuthNext(
                new URLSearchParams(window.location.search).get("next") || readPersistedAuthNext()
              )
            : "/app";

        if (session) {
          try {
            const profile = await getProfileSetupState(session.user.id);
            const dest = isWebProfileSetupIncomplete(profile) ? "/app/setup" : requestedNext;
            clearPersistedAuthNext();
            router.replace(dest);
          } catch {
            clearPersistedAuthNext();
            router.replace(requestedNext);
          }
          return;
        }

        // Retry once after a longer wait
        await new Promise((r) => setTimeout(r, 2000));
        const { data: { session: retrySession } } = await supabase.auth.getSession();

        if (retrySession) {
          clearPersistedAuthNext();
          router.replace(requestedNext);
        } else {
          setStatus("error");
        }
      } catch (callbackError) {
        console.error("[AuthCallback] Unexpected error", callbackError);
        setErrorMessage(callbackError instanceof Error ? callbackError.message : "Authentication failed");
        setStatus("error");
      }
    };

    handleCallback();
  }, [locale, router]);

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="text-center">
        {status === "loading" ? (
          <>
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-accent/20 bg-accent/8">
              <div className="h-7 w-7 animate-spin rounded-full border-2 border-accent border-t-transparent" />
            </div>
            <p className="mt-5 text-sm font-medium text-white">{t("callbackSigning")}</p>
            <p className="mt-2 text-xs text-text-dim">{t("callbackWait")}</p>
          </>
        ) : (
          <>
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-accent/30 bg-accent/10 text-2xl">
              &#9888;
            </div>
            <p className="mt-5 text-sm font-medium text-white">{t("callbackErrorTitle")}</p>
            <p className="mt-2 max-w-xs text-xs text-text-muted">
              {errorMessage || t("callbackErrorBody")}
            </p>
            <button
              type="button"
              onClick={() =>
                router.replace({
                  pathname: "/auth/login",
                  query: { next: "/app" },
                })
              }
              className="mt-5 rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-accent-hover"
            >
              {t("signIn")}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
