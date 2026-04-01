"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { getSupabaseBrowser } from "@/lib/supabase-browser";

export default function AuthCallbackPage() {
  const router = useRouter();
  const locale = useLocale();

  useEffect(() => {
    const handleCallback = async () => {
      const supabase = getSupabaseBrowser();

      // Check for code in URL (PKCE flow)
      const url = new URL(window.location.href);
      const code = url.searchParams.get("code");

      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          console.error("Auth callback error:", error.message);
          router.replace(`/${locale}/auth/login`);
          return;
        }
      }

      // Check for hash fragment tokens (implicit flow fallback)
      const hash = window.location.hash;
      if (hash && hash.includes("access_token")) {
        // Supabase client auto-detects hash tokens via detectSessionInUrl
        await new Promise((r) => setTimeout(r, 500));
      }

      // Verify session exists
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        router.replace(`/${locale}/app`);
      } else {
        router.replace(`/${locale}/auth/login`);
      }
    };

    handleCallback();
  }, [locale, router]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
        <p className="mt-4 text-sm text-text-muted">Signing you in...</p>
      </div>
    </div>
  );
}
