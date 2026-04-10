/**
 * Environment variable validation.
 * Import this module early (e.g. in the root layout or next.config) to
 * surface missing variables at build/startup time instead of at runtime.
 */

const required = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
] as const;

const serverOnly = [
  "STRIPE_SECRET_KEY",
] as const;

function validate() {
  const missing: string[] = [];

  for (const key of required) {
    if (!process.env[key]) {
      missing.push(key);
    }
  }

  // Server-only vars are only required on the server (not in the browser)
  if (typeof window === "undefined") {
    for (const key of serverOnly) {
      if (!process.env[key]) {
        missing.push(key);
      }
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables:\n${missing.map((k) => `  - ${k}`).join("\n")}\n\nPlease add them to your .env.local file or deployment environment.`
    );
  }
}

validate();

export {};
