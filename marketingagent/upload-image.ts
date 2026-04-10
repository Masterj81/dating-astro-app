/**
 * Upload local images to Supabase Storage for use with Blotato.
 *
 * Uses the Supabase REST API directly (no SDK dependency).
 * Bucket: marketing-images (must be public)
 */

import { readFileSync, existsSync } from "fs";
import { basename, extname } from "path";

const MIME_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

/**
 * Upload a local image file to Supabase Storage and return its public URL.
 * Returns null if the file doesn't exist or the upload fails.
 */
export async function uploadImageToSupabase(localPath: string): Promise<string | null> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    console.warn("⚠️  SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set — skipping image upload");
    return null;
  }

  if (!existsSync(localPath)) {
    console.warn(`⚠️  Image file not found: ${localPath} — skipping upload`);
    return null;
  }

  try {
    const ext = extname(localPath).toLowerCase();
    const mime = MIME_TYPES[ext] || "application/octet-stream";
    const originalName = basename(localPath);
    const uniqueName = `marketing-${Date.now()}-${originalName}`;

    const fileBuffer = readFileSync(localPath);

    // Strip trailing slash from URL if present
    const baseUrl = supabaseUrl.replace(/\/$/, "");

    const response = await fetch(
      `${baseUrl}/storage/v1/object/marketing-images/${uniqueName}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${serviceRoleKey}`,
          "Content-Type": mime,
        },
        body: fileBuffer,
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.warn(`⚠️  Supabase upload failed (${response.status}): ${errorText.slice(0, 200)}`);
      return null;
    }

    const publicUrl = `${baseUrl}/storage/v1/object/public/marketing-images/${uniqueName}`;
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
