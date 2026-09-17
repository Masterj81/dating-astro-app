/**
 * Canonical contact categories — the single source of truth shared by the
 * public form (`ContactForm.tsx`) and the API route (`/api/contact`).
 *
 * WHY THIS EXISTS (2026-09-17, post-merge defect on PR #39)
 * ---------------------------------------------------------
 * The form used to render `<option value={t(key)}>{t(key)}</option>`: the
 * LOCALIZED LABEL was the HTML value, so the browser submitted e.g.
 * "Question générale" while the API whitelist accepts only the canonical
 * English values. Every non-English locale therefore got HTTP 400
 * `{"error":"invalid_request"}` before Turnstile was even consulted.
 *
 * The contract is now split for good:
 *   - `value`     → the stable canonical string sent to the API (language-
 *                   independent; what the support inbox groups on);
 *   - `labelKey`  → the translation key for the visible localized label.
 *
 * The route validates against `isContactCategory` derived from THIS table,
 * so the values the form sends and the values the API accepts cannot drift
 * apart again. The API must keep refusing localized strings: the contract
 * is canonical and language-independent by design.
 *
 * This module is deliberately dependency-free so the client bundle can
 * import it (do not add node builtins or server-only imports here).
 */
export const CONTACT_CATEGORIES = [
  { value: "General Question", labelKey: "catGeneral" },
  { value: "Account Issue", labelKey: "catAccount" },
  { value: "Billing & Subscription", labelKey: "catBilling" },
  { value: "Bug Report", labelKey: "catBug" },
  { value: "Safety Concern", labelKey: "catSafety" },
  { value: "Feature Request", labelKey: "catFeature" },
  { value: "Other", labelKey: "catOther" },
] as const;

export type ContactCategoryValue = (typeof CONTACT_CATEGORIES)[number]["value"];

/** The only categories `/api/contact` accepts — derived from the table
 *  above, never re-declared anywhere else. */
export const CONTACT_CATEGORY_VALUES: readonly ContactCategoryValue[] =
  CONTACT_CATEGORIES.map((c) => c.value);

export function isContactCategory(
  value: unknown,
): value is ContactCategoryValue {
  return (
    typeof value === "string" &&
    CONTACT_CATEGORY_VALUES.includes(value as ContactCategoryValue)
  );
}
