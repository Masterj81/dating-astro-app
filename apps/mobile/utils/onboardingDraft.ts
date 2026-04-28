// P2-5: lightweight onboarding draft persistence.
//
// Keeps the user's in-progress onboarding answers in AsyncStorage keyed by
// userId so that if they background/kill the app mid-flow, we can offer to
// resume exactly where they left off. Cleared once the server marks the
// profile as `onboarding_completed`.
//
// Scope: currently wired into `app/onboarding/birth-info.tsx` (the longest
// step). Other onboarding screens follow the same pattern — read at mount,
// write on field changes, clear on final submit.
import AsyncStorage from '@react-native-async-storage/async-storage';

const DRAFT_KEY_PREFIX = 'onboarding_draft_';

export type OnboardingDraft = {
  step?: number;
  birthMonth?: string;
  birthDay?: string;
  birthYear?: string;
  birthHour?: string;
  birthMinute?: string;
  birthCity?: string;
  gender?: string;
  showMe?: 'men' | 'women' | 'everyone';
  // Anything else (photos, bio) added later can go here without a schema bump.
  [key: string]: unknown;
};

function draftKey(userId: string): string {
  return `${DRAFT_KEY_PREFIX}${userId}`;
}

export async function saveOnboardingDraft(
  userId: string | null | undefined,
  draft: OnboardingDraft
): Promise<void> {
  if (!userId) return;
  try {
    await AsyncStorage.setItem(draftKey(userId), JSON.stringify(draft));
  } catch (err) {
    if (__DEV__) console.warn('[onboardingDraft] save failed:', err);
  }
}

export async function loadOnboardingDraft(
  userId: string | null | undefined
): Promise<OnboardingDraft | null> {
  if (!userId) return null;
  try {
    const raw = await AsyncStorage.getItem(draftKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as OnboardingDraft;
    }
    return null;
  } catch (err) {
    if (__DEV__) console.warn('[onboardingDraft] load failed:', err);
    return null;
  }
}

export async function clearOnboardingDraft(
  userId: string | null | undefined
): Promise<void> {
  if (!userId) return;
  try {
    await AsyncStorage.removeItem(draftKey(userId));
  } catch (err) {
    if (__DEV__) console.warn('[onboardingDraft] clear failed:', err);
  }
}

// =============================================================================
// Pre-signup draft.
//
// The /welcome flow lets visitors enter birth info BEFORE creating an
// account so the app can show their natal chart preview as the value
// proposition. Since there is no userId yet we use a fixed key. Once
// signup completes we copy this draft into the user-keyed draft above
// (see signup.tsx) and clear the pre-signup copy.
// =============================================================================

const PRE_SIGNUP_DRAFT_KEY = 'onboarding_draft_pre_signup';

export async function savePreSignupDraft(draft: OnboardingDraft): Promise<void> {
  try {
    await AsyncStorage.setItem(PRE_SIGNUP_DRAFT_KEY, JSON.stringify(draft));
  } catch (err) {
    if (__DEV__) console.warn('[onboardingDraft] pre-signup save failed:', err);
  }
}

export async function loadPreSignupDraft(): Promise<OnboardingDraft | null> {
  try {
    const raw = await AsyncStorage.getItem(PRE_SIGNUP_DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as OnboardingDraft;
    }
    return null;
  } catch (err) {
    if (__DEV__) console.warn('[onboardingDraft] pre-signup load failed:', err);
    return null;
  }
}

export async function clearPreSignupDraft(): Promise<void> {
  try {
    await AsyncStorage.removeItem(PRE_SIGNUP_DRAFT_KEY);
  } catch (err) {
    if (__DEV__) console.warn('[onboardingDraft] pre-signup clear failed:', err);
  }
}
