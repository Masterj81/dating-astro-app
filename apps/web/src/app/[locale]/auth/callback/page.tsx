"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
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

        // detectSessionInUrl handles hash fragments automatically
        // Wait a moment for Supabase to process
        await new Promise((r) => setTimeout(r, 1000));

        const { data: { session } } = await supabase.auth.getSession();

        if (session) {
          try {
            const profile = await getProfileSetupState(session.user.id);
            const dest = isWebProfileSetupIncomplete(profile) ? "/app/setup" : "/app";
            router.replace(dest);
          } catch {
            router.replace("/app");
          }
          return;
        }

        // Retry once after a longer wait
        await new Promise((r) => setTimeout(r, 2000));
        const { data: { session: retrySession } } = await supabase.auth.getSession();

        if (retrySession) {
          router.replace("/app");
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
              onClick={() => router.replace("/auth/login")}
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
