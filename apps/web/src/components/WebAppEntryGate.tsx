"use client";

import { useEffect, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { getProfileSetupState, isWebProfileSetupIncomplete } from "@/lib/web-account";
import { getSupabaseBrowser } from "@/lib/supabase-browser";

export function WebAppEntryGate() {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;

    const checkProfileSetup = async () => {
      const supabase = getSupabaseBrowser();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!active) {
        return;
      }

      if (!session?.user?.id) {
        setReady(true);
        return;
      }

      try {
        const profile = await getProfileSetupState(session.user.id);

        if (!active) {
          return;
        }

        if (isWebProfileSetupIncomplete(profile)) {
          router.replace("/app/setup");
          return;
        }
      } catch {
        // Fall back to the dashboard if profile lookup fails.
      }

      if (active) {
        setReady(true);
      }
    };

    checkProfileSetup();

    return () => {
      active = false;
    };
  }, [router]);

  if (!ready) {
    return null;
  }

  return null;
}
