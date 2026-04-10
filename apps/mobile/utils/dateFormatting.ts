/**
 * Shared date/time formatting helpers.
 *
 * Many screens had their own copy of these functions — this module
 * consolidates them so behaviour stays consistent everywhere.
 */

type TranslateFunction = (key: string, options?: Record<string, string | number>) => string;

/**
 * "time ago" string using i18n keys (justNow / minutesAgo / hoursAgo / daysAgo).
 * Falls back to compact English when translation keys are missing.
 */
export function formatRelativeTime(dateString: string, t: TranslateFunction): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return t('justNow') || 'Just now';
  if (diffMins < 60) return t('minutesAgo', { count: diffMins }) || `${diffMins}m ago`;
  if (diffHours < 24) return t('hoursAgo', { count: diffHours }) || `${diffHours}h ago`;
  return t('daysAgo', { count: diffDays }) || `${diffDays}d ago`;
}

/**
 * Compact relative time (no i18n) for chat list timestamps: "2m", "3h", "5d".
 * Falls back to locale date string after 7 days.
 */
export function formatCompactTime(dateString: string, nowLabel: string = 'now'): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return nowLabel;
  if (diffMins < 60) return `${diffMins}m`;
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays < 7) return `${diffDays}d`;
  return date.toLocaleDateString();
}

/**
 * Clock time for individual chat messages: "2:35 PM".
 */
export function formatMessageTime(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

/**
 * Localised long date for profile birth dates: "January 5, 2000".
 * Uses the supplied `getMonthName` callback so callers can pass their
 * translated month name resolver.
 */
export function formatBirthDate(
  dateString: string,
  getMonthName: (monthIndex: number) => string,
  fallback: string = '',
): string {
  if (!dateString) return fallback;
  const date = new Date(dateString);
  return `${getMonthName(date.getMonth())} ${date.getDate()}, ${date.getFullYear()}`;
}

/**
 * Short date for blocked-user lists: "Jan 5, 2025".
 */
export function formatShortDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}
