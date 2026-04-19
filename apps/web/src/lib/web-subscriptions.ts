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

  type EffectiveRow = {
    tier: string | null;
    source: string | null;
    status: string | null;
    expires_at: string | null;
    cancel_at_period_end: boolean | null;
  };

  const { data, error } = await supabase
    .rpc("get_effective_subscription", { p_user_id: userId })
    .maybeSingle<EffectiveRow>();

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

export async function getCurrentTier(userId: string): Promise<WebTier> {
  const supabase = getSupabaseBrowser();
  const { data, error } = await supabase.rpc("get_user_tier", {
    p_user_id: userId,
  });
  if (error || !data) return "free";
  return (data as WebTier) || "free";
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
