import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let supabaseBrowser: SupabaseClient | null = null;

export function getSupabaseBrowser() {
  if (!supabaseBrowser) {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
      throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL environment variable");
    }

    if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      throw new Error("Missing NEXT_PUBLIC_SUPABASE_ANON_KEY environment variable");
    }

    // OAuth flow alignment: PKCE matches the mobile client and is the
    // Supabase default for new projects. With PKCE, signInWithOAuth stores
    // a code_verifier in storage and the callback page exchanges the `code`
    // query param via exchangeCodeForSession. The implicit branch in the
    // callback (setSession with hash tokens) remains as a defensive
    // fallback for any edge case but should normally never fire.
    //
    // detectSessionInUrl is left false because the callback page does the
    // exchange manually with explicit error handling and routing — we
    // don't want Supabase racing the manual handler.
    supabaseBrowser = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      {
        auth: {
          flowType: "pkce",
          detectSessionInUrl: false,
          persistSession: true,
          autoRefreshToken: true,
        },
      }
    );
  }

  return supabaseBrowser;
}
