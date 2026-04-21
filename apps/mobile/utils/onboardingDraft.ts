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
