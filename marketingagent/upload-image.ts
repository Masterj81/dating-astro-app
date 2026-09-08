/**
 * Upload local images to Supabase Storage for use with Blotato.
 *
 * JUNO-04 (8 Sep 2026): this file used to POST the image bytes straight to
 * `/storage/v1/object/marketing-images/<name>` with SUPABASE_SERVICE_ROLE_KEY
 * in the Authorization header — a credential that also reads every row of
 * `profiles` and `messages` and can delete any account. It now goes through
 * ./marketing-api.js and the `marketing-agent` edge function, which holds that
 * key server-side and exposes only this one upload.
 *
 * Two behaviours changed with it, both because the old ones were defects:
 *
 *   * the remote filename was `marketing-${Date.now()}-${basename(localPath)}`,
 *     built from a local path. It is now a server-chosen UUID, so nothing this
 *     process sends can name an object in the bucket.
 *   * the bucket is declared by a migration for the first time
 *     (20260908000001). It has existed since at least April 2026 without one,
 *     which is the JUNO-15 drift in miniature.
 *
 * The exported signatures are unchanged, so blotato.ts and
 * .pi/extensions/blotato-publisher.ts need no edit.
 */

import { uploadMarketingImage } from "./marketing-api.js";

/**
 * Upload a local image file to Supabase Storage and return its public URL.
 * Returns null if the file doesn't exist or the upload fails.
 *
 * Still null rather than a throw: the caller's contract is "publish without an
 * image rather than not publish". The warning now names what to check, which
 * the previous "SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set" no longer
 * would — that variable is deliberately gone from this tool's environment.
 */
export async function uploadImageToSupabase(localPath: string): Promise<string | null> {
  try {
    const publicUrl = await uploadMarketingImage(localPath);
    console.log(`📤 Image uploaded: ${publicUrl}`);
    return publicUrl;
  } catch (err) {
    console.warn(`⚠️  Image upload error: ${(err as Error).message}`);
    return null;
  }
}

/**
 * If the given URL is a local path (not http/https), upload it and return the public URL.
 * If it's already a URL or upload fails, return the original value.
 */
export async function ensurePublicUrl(imageUrl: string | undefined): Promise<string | undefined> {
  if (!imageUrl) return undefined;
  if (imageUrl.startsWith("http://") || imageUrl.startsWith("https://")) return imageUrl;

  const publicUrl = await uploadImageToSupabase(imageUrl);
  return publicUrl || undefined;
}
