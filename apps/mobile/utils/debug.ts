/**
 * Development-only logging utility.
 * Logs are suppressed in production builds.
 */

const isDev = __DEV__ || process.env.NODE_ENV === 'development';

export const debugLog = (...args: unknown[]): void => {
  if (isDev) {
    console.log('[DEBUG]', ...args);
  }
};

export const debugWarn = (...args: unknown[]): void => {
  if (isDev) {
    console.warn('[DEBUG]', ...args);
  }
};

// console.error is kept as-is for real failures - no wrapper needed
