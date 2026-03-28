import { getSupabaseBrowser } from "@/lib/supabase-browser";
import {
  getCurrentProfile,
  getCurrentSubscription,
  type WebSource,
  type WebTier,
} from "@/lib/web-subscriptions";

export type WebAccountState = {
  userId: string;
  email: string;
  displayName: string;
  onboardingCompleted: boolean;
  tier: WebTier;
  source: WebSource;
  status: string | null;
  expiresAt: string | null;
  cancelAtPeriodEnd: boolean;
};

export type WebProfileSetupState = {
  id: string;
  onboardingCompleted: boolean;
};

export async function getProfileSetupState(
  userId: string
): Promise<WebProfileSetupState | null> {
  const supabase = getSupabaseBrowser();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, onboarding_completed")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    return null;
  }

  return {
    id: data.id,
    onboardingCompleted: Boolean(data.onboarding_completed),
  };
}

export function isWebProfileSetupIncomplete(
  profile: WebProfileSetupState | null
): boolean {
  return !profile?.onboardingCompleted;
}

export async function getCurrentAccountState(
  fallbackName: string
): Promise<WebAccountState | null> {
  const supabase = getSupabaseBrowser();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user?.id) {
    return null;
  }

  const [profile, subscription] = await Promise.all([
    getCurrentProfile(session.user.id),
    getCurrentSubscription(session.user.id),
  ]);

  return {
    userId: session.user.id,
    email: session.user.email || "",
    displayName:
      profile?.name ||
      session.user.user_metadata?.full_name ||
      session.user.user_metadata?.name ||
      fallbackName,
    onboardingCompleted: Boolean(profile?.onboarding_completed),
    tier: subscription.tier,
    source: subscription.source,
    status: subscription.status,
    expiresAt: subscription.expiresAt,
    cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
  };
}
