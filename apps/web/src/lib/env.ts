/**
 * Environment variable validation.
 * Client-required vars are checked eagerly (build + runtime).
 * Server-only vars are checked lazily (only when actually needed at runtime).
 */

const clientRequired = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
] as const;

// Validate client vars eagerly — these must exist at build time
const missing = clientRequired.filter((key) => !process.env[key]);
if (missing.length > 0) {
  throw new Error(
    `Missing required environment variables:\n${missing.map((k) => `  - ${k}`).join("\n")}`
  );
}

/**
 * Call this in API routes that need server-only vars.
 * Throws at runtime (not build time) if the var is missing.
 */
export function requireServerEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing server environment variable: ${key}`);
  }
  return value;
}

export {};
