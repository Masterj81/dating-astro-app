/**
 * Upload tarot card images to Supabase Storage.
 *
 * Usage:
 *   node scripts/upload-tarot-images.js <SUPABASE_SERVICE_ROLE_KEY>
 *
 * Prerequisites:
 *   - Create a PUBLIC bucket named "tarot" in Supabase Dashboard > Storage
 */

const fs = require("fs");
const path = require("path");

const SUPABASE_URL = "https://qtihezzbuubnyvrjdkjd.supabase.co";
const BUCKET = "tarot";
const IMAGE_DIR = path.join(__dirname, "..", "apps", "mobile", "assets", "images", "tarot");

const SERVICE_KEY = process.argv[2];
if (!SERVICE_KEY) {
  console.error("Usage: node scripts/upload-tarot-images.js <SUPABASE_SERVICE_ROLE_KEY>");
  process.exit(1);
}

async function uploadFile(filePath, fileName) {
  const fileBuffer = fs.readFileSync(filePath);

  const res = await fetch(
    `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${fileName}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SERVICE_KEY}`,
        "Content-Type": "image/jpeg",
        "x-upsert": "true",
      },
      body: fileBuffer,
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to upload ${fileName}: ${res.status} ${text}`);
  }

  return res.json();
}

async function main() {
  const files = fs.readdirSync(IMAGE_DIR).filter((f) => f.endsWith(".jpg")).sort();
  console.log(`Uploading ${files.length} tarot card images to bucket "${BUCKET}"...`);

  let uploaded = 0;
  let failed = 0;

  for (const file of files) {
    try {
      await uploadFile(path.join(IMAGE_DIR, file), file);
      uploaded++;
      process.stdout.write(`\r  ${uploaded}/${files.length} uploaded`);
    } catch (err) {
      failed++;
      console.error(`\n  FAILED: ${file} — ${err.message}`);
    }
  }

  console.log(`\n\nDone: ${uploaded} uploaded, ${failed} failed`);
  console.log(`\nPublic URL pattern:`);
  console.log(`  ${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/major-00.jpg`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
