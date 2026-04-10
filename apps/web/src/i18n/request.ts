import { getRequestConfig } from "next-intl/server";
import { routing } from "./routing";
import { hasLocale, IntlErrorCode } from "next-intl";

// Deep-merge source into target (target wins on conflicts)
function deepMerge(
  target: Record<string, unknown>,
  source: Record<string, unknown>
): Record<string, unknown> {
  const result = { ...source };
  for (const key of Object.keys(target)) {
    if (
      typeof target[key] === "object" &&
      target[key] !== null &&
      typeof source[key] === "object" &&
      source[key] !== null
    ) {
      result[key] = deepMerge(
        target[key] as Record<string, unknown>,
        source[key] as Record<string, unknown>
      );
    } else {
      result[key] = target[key];
    }
  }
  return result;
}

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested)
    ? requested
    : routing.defaultLocale;

  const localeMessages = (await import(`../../messages/${locale}.json`))
    .default;

  // For non-default locales, merge with English so missing keys fall back
  // to the default locale instead of showing raw key paths.
  let messages = localeMessages;
  if (locale !== routing.defaultLocale) {
    const defaultMessages = (
      await import(`../../messages/${routing.defaultLocale}.json`)
    ).default;
    messages = deepMerge(localeMessages, defaultMessages);
  }

  return {
    locale,
    messages,
    getMessageFallback({ namespace, key, error }) {
      const path = [namespace, key].filter(Boolean).join(".");
      if (error.code === IntlErrorCode.MISSING_MESSAGE) {
        // Surface the key path so missing translations are visible
        return path;
      }
      return path;
    },
    onError(error) {
      if (error.code === IntlErrorCode.MISSING_MESSAGE) {
        // Silently swallow missing-message errors — the fallback handles it
        return;
      }
      console.error(error);
    },
  };
});
