/**
 * Download AI-generated face photos and upload them to Supabase Storage
 * for seed profiles, then update the profile records.
 *
 * Usage:
 *   node scripts/seed-profile-photos.js <SUPABASE_SERVICE_ROLE_KEY>
 *
 * Prerequisites:
 *   - Seed profiles already created in the database
 *   - "avatars" bucket exists in Supabase Storage (should already exist)
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const SUPABASE_URL = "https://qtihezzbuubnyvrjdkjd.supabase.co";
const BUCKET = "avatars";

const SERVICE_KEY = process.argv[2];
if (!SERVICE_KEY) {
  console.error("Usage: node scripts/seed-profile-photos.js <SUPABASE_SERVICE_ROLE_KEY>");
  process.exit(1);
}

// Seed profiles with gender hints for photo selection
// Uses thispersondoesnotexist.com alternative: randomuser.me API (free, diverse, no copyright)
const SEED_PROFILES = [
  // Canada profiles
  { email: "seed.chloe@astrodating.test", gender: "female" },
  { email: "seed.marco@astrodating.test", gender: "male" },
  { email: "seed.amelie@astrodating.test", gender: "female" },
  { email: "seed.felix@astrodating.test", gender: "male" },
  { email: "seed.jasmine@astrodating.test", gender: "female" },
  { email: "seed.ethan@astrodating.test", gender: "male" },
  { email: "seed.lea@astrodating.test", gender: "female" },
  { email: "seed.samuel@astrodating.test", gender: "male" },
  { email: "seed.maya@astrodating.test", gender: "female" },
  { email: "seed.olivier@astrodating.test", gender: "male" },
  { email: "seed.sarah@astrodating.test", gender: "female" },
  { email: "seed.alex@astrodating.test", gender: "female" },
  { email: "seed.luna@astrodating.test", gender: "female" },
  { email: "seed.gabriel@astrodating.test", gender: "male" },
  { email: "seed.zara@astrodating.test", gender: "female" },
  { email: "seed.raphael@astrodating.test", gender: "male" },
  { email: "seed.nadia@astrodating.test", gender: "female" },
  { email: "seed.thomas@astrodating.test", gender: "male" },
  { email: "seed.iris@astrodating.test", gender: "female" },
  { email: "seed.julien@astrodating.test", gender: "male" },
  { email: "seed.elena@astrodating.test", gender: "female" },
  { email: "seed.mathieu@astrodating.test", gender: "male" },
  { email: "seed.sofia@astrodating.test", gender: "female" },
  { email: "seed.antoine@astrodating.test", gender: "male" },
  { email: "seed.camille@astrodating.test", gender: "female" },
  { email: "seed.maxime@astrodating.test", gender: "male" },
  { email: "seed.clara@astrodating.test", gender: "female" },
  { email: "seed.nicolas@astrodating.test", gender: "male" },
  { email: "seed.valerie@astrodating.test", gender: "female" },
  { email: "seed.david@astrodating.test", gender: "male" },
  // US profiles
  { email: "seed.olivia.nyc@astrodating.test", gender: "female" },
  { email: "seed.james.nyc@astrodating.test", gender: "male" },
  { email: "seed.mia.la@astrodating.test", gender: "female" },
  { email: "seed.logan.la@astrodating.test", gender: "male" },
  { email: "seed.ava.chi@astrodating.test", gender: "female" },
  { email: "seed.noah.chi@astrodating.test", gender: "male" },
  { email: "seed.isabella.mia@astrodating.test", gender: "female" },
  { email: "seed.liam.mia@astrodating.test", gender: "male" },
  { email: "seed.harper.atx@astrodating.test", gender: "female" },
  { email: "seed.jackson.atx@astrodating.test", gender: "male" },
  { email: "seed.aria.sf@astrodating.test", gender: "female" },
  { email: "seed.caleb.sf@astrodating.test", gender: "male" },
  { email: "seed.scarlett.bos@astrodating.test", gender: "female" },
  { email: "seed.owen.bos@astrodating.test", gender: "male" },
  { email: "seed.violet.den@astrodating.test", gender: "female" },
  { email: "seed.wyatt.den@astrodating.test", gender: "male" },
  { email: "seed.lily.sea@astrodating.test", gender: "female" },
  { email: "seed.carter.sea@astrodating.test", gender: "male" },
  { email: "seed.stella.dc@astrodating.test", gender: "female" },
  { email: "seed.henry.dc@astrodating.test", gender: "male" },
  { email: "seed.grace.nyc@astrodating.test", gender: "female" },
  { email: "seed.aiden.la@astrodating.test", gender: "male" },
  { email: "seed.chloe.chi@astrodating.test", gender: "female" },
  { email: "seed.mason.mia@astrodating.test", gender: "male" },
  { email: "seed.riley.atx@astrodating.test", gender: "female" },
  { email: "seed.elijah.sf@astrodating.test", gender: "male" },
  { email: "seed.zoe.nyc@astrodating.test", gender: "female" },
  { email: "seed.luke.la@astrodating.test", gender: "male" },
  { email: "seed.hazel.bos@astrodating.test", gender: "female" },
  { email: "seed.dylan.den@astrodating.test", gender: "male" },
];

async function downloadPhoto(gender) {
  // randomuser.me provides free, diverse portrait photos
  const res = await fetch(
    `https://randomuser.me/api/?gender=${gender}&nat=us,ca,fr,gb&inc=picture&noinfo`
  );
  const data = await res.json();
  const photoUrl = data.results[0].picture.large;

  // Download the actual image
  const imgRes = await fetch(photoUrl);
  if (!imgRes.ok) throw new Error(`Failed to download photo: ${imgRes.status}`);
  return Buffer.from(await imgRes.arrayBuffer());
}

async function uploadToStorage(buffer, fileName) {
  const res = await fetch(
    `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${fileName}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SERVICE_KEY}`,
        "Content-Type": "image/jpeg",
        "x-upsert": "true",
      },
      body: buffer,
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Upload failed for ${fileName}: ${res.status} ${text}`);
  }

  return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${fileName}`;
}

async function updateProfile(email, imageUrl) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?email=eq.${encodeURIComponent(email)}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${SERVICE_KEY}`,
        apikey: SERVICE_KEY,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        image_url: imageUrl,
        images: [imageUrl],
      }),
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Profile update failed for ${email}: ${res.status} ${text}`);
  }
}

async function main() {
  console.log(`Processing ${SEED_PROFILES.length} seed profiles...\n`);

  let success = 0;
  let failed = 0;

  for (let i = 0; i < SEED_PROFILES.length; i++) {
    const profile = SEED_PROFILES[i];
    const fileName = `seed-${crypto.randomUUID()}.jpg`;

    try {
      // Download a random photo
      const buffer = await downloadPhoto(profile.gender);

      // Upload to Supabase Storage
      const imageUrl = await uploadToStorage(buffer, fileName);

      // Update the profile
      await updateProfile(profile.email, imageUrl);

      success++;
      process.stdout.write(`\r  ${success + failed}/${SEED_PROFILES.length} — ${profile.email}`);

      // Small delay to avoid rate limiting
      await new Promise((r) => setTimeout(r, 300));
    } catch (err) {
      failed++;
      console.error(`\n  FAILED: ${profile.email} — ${err.message}`);
    }
  }

  console.log(`\n\nDone: ${success} photos uploaded, ${failed} failed`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
