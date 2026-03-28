import { getSupabaseBrowser } from "@/lib/supabase-browser";

export type WebTier = "free" | "premium" | "premium_plus";
export type WebSource = "stripe" | "app_store" | "play_store" | null;

export async function getCurrentProfile(userId: string) {
  const supabase = getSupabaseBrowser();

  const { data, error } = await supabase
    .from("profiles")
    .select("id, name, onboarding_completed")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

export async function getCurrentSubscription(userId: string): Promise<{
  tier: WebTier;
  source: WebSource;
  status: string | null;
  expiresAt: string | null;
  cancelAtPeriodEnd: boolean;
}> {
  const supabase = getSupabaseBrowser();

  const { data, error } = await supabase
    .from("subscriptions")
    .select("tier, source, status, expires_at, cancel_at_period_end")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    return {
      tier: "free",
      source: null,
      status: null,
      expiresAt: null,
      cancelAtPeriodEnd: false,
    };
  }

  return {
    tier: (data.tier as WebTier) || "free",
    source: (data.source as WebSource) || null,
    status: data.status || null,
    expiresAt: data.expires_at || null,
    cancelAtPeriodEnd: Boolean(data.cancel_at_period_end),
  };
}

export async function createPortalSession(userId: string) {
  const supabase = getSupabaseBrowser();

  const { data, error } = await supabase.functions.invoke("create-portal-session", {
    body: {
      userId,
      returnUrl: `${window.location.origin}/app/profile`,
    },
  });

  if (error || !data?.url) {
    throw new Error(error?.message || "Failed to create portal session");
  }

  return data.url as string;
}
