import { routing } from "@/i18n/routing";

const DEFAULT_APP_PATH = "/app";

export function normalizeAuthNext(value: string | null | undefined): string {
  if (!value) return DEFAULT_APP_PATH;

  let nextValue = value.trim();
  if (!nextValue) return DEFAULT_APP_PATH;

  try {
    if (/^https?:\/\//i.test(nextValue)) {
      const url = new URL(nextValue);
      nextValue = `${url.pathname}${url.search}${url.hash}`;
    }
  } catch {
    return DEFAULT_APP_PATH;
  }

  if (!nextValue.startsWith("/")) {
    return DEFAULT_APP_PATH;
  }

  const localePrefix = new RegExp(`^/(${routing.locales.join("|")})(?=/|$)`);
  nextValue = nextValue.replace(localePrefix, "") || DEFAULT_APP_PATH;

  if (!nextValue.startsWith("/app")) {
    return DEFAULT_APP_PATH;
  }

  return nextValue;
}

export function buildAuthCallbackUrl(locale: string, next?: string | null): string {
  const callbackPath = `/${locale}/auth/callback`;
  const normalizedNext = next ? normalizeAuthNext(next) : null;
  const search = normalizedNext && normalizedNext !== DEFAULT_APP_PATH
    ? `?next=${encodeURIComponent(normalizedNext)}`
    : "";

  if (typeof window === "undefined") {
    return `${callbackPath}${search}`;
  }

  return new URL(`${callbackPath}${search}`, window.location.origin).toString();
}

export function persistAuthNext(next?: string | null): string {
  const normalizedNext = normalizeAuthNext(next);

  if (typeof window !== "undefined") {
    window.sessionStorage.setItem("pendingAuthNext", normalizedNext);
  }

  return normalizedNext;
}

export function readPersistedAuthNext(): string {
  if (typeof window === "undefined") {
    return DEFAULT_APP_PATH;
  }

  return normalizeAuthNext(window.sessionStorage.getItem("pendingAuthNext"));
}

export function clearPersistedAuthNext(): void {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.removeItem("pendingAuthNext");
}
