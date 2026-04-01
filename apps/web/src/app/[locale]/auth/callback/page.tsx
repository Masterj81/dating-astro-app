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

      // detectSessionInUrl handles hash fragments automatically
      // Wait a moment for Supabase to process
      await new Promise((r) => setTimeout(r, 1000));

      const { data: { session } } = await supabase.auth.getSession();

      if (session) {
        router.replace(`/${locale}/app`);
      } else {
        // Retry once after a longer wait
        await new Promise((r) => setTimeout(r, 2000));
        const { data: { session: retrySession } } = await supabase.auth.getSession();

        if (retrySession) {
          router.replace(`/${locale}/app`);
        } else {
          router.replace(`/${locale}/auth/login`);
        }
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
