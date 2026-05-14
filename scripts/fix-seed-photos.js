/**
 * Fix seed profile photos — links existing avatars in Storage to profile records.
 *
 * Usage: node scripts/fix-seed-photos.js <SUPABASE_SERVICE_ROLE_KEY>
 */

const SUPABASE_URL = "https://qtihezzbuubnyvrjdkjd.supabase.co";
const BUCKET = "avatars";
const SERVICE_KEY = process.argv[2];

if (!SERVICE_KEY) {
  console.error("Usage: node scripts/fix-seed-photos.js <SUPABASE_SERVICE_ROLE_KEY>");
  process.exit(1);
}

async function main() {
  // 1. List all seed-* files in avatars bucket
  const listRes = await fetch(
    `${SUPABASE_URL}/storage/v1/object/list/${BUCKET}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SERVICE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ prefix: "", limit: 200 }),
    }
  );

  if (!listRes.ok) {
    console.error("Failed to list files:", await listRes.text());
    process.exit(1);
  }

  const files = await listRes.json();
  console.log(`Found ${files.length} seed photos in storage\n`);

  if (files.length === 0) {
    console.log("No seed photos found. Run seed-profile-photos.js first.");
    process.exit(0);
  }

  // 2. Get all seed profiles without photos
  const profilesRes = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?email=like.seed.*&image_url=is.null&select=id,email&limit=100`,
    {
      headers: {
        Authorization: `Bearer ${SERVICE_KEY}`,
        apikey: SERVICE_KEY,
      },
    }
  );

  const profiles = await profilesRes.json();
  console.log(`Found ${profiles.length} seed profiles without photos\n`);

  if (profiles.length === 0) {
    console.log("All seed profiles already have photos!");
    process.exit(0);
  }

  // 3. Assign photos to profiles
  let updated = 0;
  for (let i = 0; i < profiles.length && i < files.length; i++) {
    const profile = profiles[i];
    const file = files[i];
    const imageUrl = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${file.name}`;

    const updateRes = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?id=eq.${profile.id}`,
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

    if (updateRes.ok) {
      updated++;
      process.stdout.write(`\r  ${updated}/${Math.min(profiles.length, files.length)} updated`);
    } else {
      console.error(`\n  Failed for ${profile.email}: ${await updateRes.text()}`);
    }
  }

  console.log(`\n\nDone: ${updated} profiles updated with photos`);
}

main().catch((err) => { console.error(err); process.exit(1); });
