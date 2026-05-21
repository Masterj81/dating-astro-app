// generate-juno-brand-assets.mjs
//
// Reproducible generator for every JUNO raster brand asset: the app icon
// (iOS / Android adaptive / monochrome), web + PWA favicons, and the
// Open Graph image. Single source of truth -- run this whenever the
// JUNO mark changes.
//
//   node scripts/generate-juno-brand-assets.mjs
//
// Design: icon Direction E -- "Dark Premium Tile". Two interlocking
// synastry rings in soft ivory on a deep-midnight tile, with a small
// luminous gold point at their shared intersection. The vector master is
// docs/brand/juno-icon-exploration/final-juno-icon.svg.
//
// Palette (only): tile #08090b / #11141b, ivory #f3f4f7 -> #cdd0d9,
// warm gold #e9c873. No heart, no couple, no arrow, no swipe card.

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// ---------------------------------------------------------------------------
// Shared vector building blocks
// ---------------------------------------------------------------------------

// The interlocking-rings + gold-point emblem, centred at (512,512) of a
// 1024 canvas. `ring` / `point` allow a flat monochrome variant.
function emblem({ ring = "url(#ring)", point = "url(#goldPoint)", glow = true, jewel = true } = {}) {
  return `
    <g transform="translate(512 512)">
      ${glow ? `<circle r="120" fill="url(#goldGlow)"/>` : ""}
      <circle cx="-92" cy="0" r="170" fill="none" stroke="${ring}" stroke-width="34"/>
      <circle cx="92" cy="0" r="170" fill="none" stroke="${ring}" stroke-width="34"/>
      <path d="M 92 -170 A 170 170 0 0 1 262 0 A 170 170 0 0 1 92 170"
            fill="none" stroke="${ring}" stroke-width="34"/>
      <path d="M -3 -142 A 170 170 0 0 0 -3 142"
            fill="none" stroke="${ring}" stroke-width="34"/>
      <circle r="31" fill="${point}"/>
      ${jewel ? `<circle r="11" fill="#fdf6e0"/>` : ""}
    </g>`;
}

const ICON_DEFS = `
  <defs>
    <radialGradient id="tile" cx="0.5" cy="0.34" r="0.95">
      <stop offset="0" stop-color="#161a23"/>
      <stop offset="0.62" stop-color="#0d0f15"/>
      <stop offset="1" stop-color="#08090b"/>
    </radialGradient>
    <linearGradient id="ring" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#f3f4f7"/>
      <stop offset="1" stop-color="#cdd0d9"/>
    </linearGradient>
    <radialGradient id="goldGlow" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#e9c873" stop-opacity="0.55"/>
      <stop offset="1" stop-color="#e9c873" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="goldPoint" cx="0.42" cy="0.38" r="0.78">
      <stop offset="0" stop-color="#fbf0cf"/>
      <stop offset="0.55" stop-color="#ecce7e"/>
      <stop offset="1" stop-color="#d9b25b"/>
    </radialGradient>
  </defs>`;

function svg(body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">${ICON_DEFS}${body}</svg>`;
}

// Full-bleed square tile (iOS + web + PWA). Corner masking is applied by
// each platform, so no baked-in corner radius.
const ICON_TILE = svg(`<rect width="1024" height="1024" fill="url(#tile)"/>${emblem()}`);

// Android adaptive foreground -- emblem only, transparent ground.
const ICON_FOREGROUND = svg(emblem());

// Android adaptive background -- the dark tile, no emblem.
const ICON_BACKGROUND = svg(`<rect width="1024" height="1024" fill="url(#tile)"/>`);

// Android themed (monochrome) icon -- flat white emblem, transparent.
const ICON_MONOCHROME = svg(emblem({ ring: "#ffffff", point: "#ffffff", glow: false, jewel: false }));

// ---------------------------------------------------------------------------
// Open Graph image (1200 x 630)
// ---------------------------------------------------------------------------

function ogImage() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="ogBg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#11141b"/>
      <stop offset="0.52" stop-color="#0c0e13"/>
      <stop offset="1" stop-color="#08090b"/>
    </linearGradient>
    <radialGradient id="ogGold" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(330 150) scale(420)">
      <stop offset="0" stop-color="#e9c873" stop-opacity="0.16"/>
      <stop offset="1" stop-color="#e9c873" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="ogBlue" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(1010 520) scale(420)">
      <stop offset="0" stop-color="#7aa7ff" stop-opacity="0.14"/>
      <stop offset="1" stop-color="#7aa7ff" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="ring" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#f3f4f7"/>
      <stop offset="1" stop-color="#cdd0d9"/>
    </linearGradient>
    <radialGradient id="ogTile" cx="0.5" cy="0.34" r="0.95">
      <stop offset="0" stop-color="#161a23"/>
      <stop offset="0.62" stop-color="#0d0f15"/>
      <stop offset="1" stop-color="#08090b"/>
    </radialGradient>
    <radialGradient id="goldGlow" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#e9c873" stop-opacity="0.55"/>
      <stop offset="1" stop-color="#e9c873" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="goldPoint" cx="0.42" cy="0.38" r="0.78">
      <stop offset="0" stop-color="#fbf0cf"/>
      <stop offset="0.55" stop-color="#ecce7e"/>
      <stop offset="1" stop-color="#d9b25b"/>
    </radialGradient>
  </defs>

  <rect width="1200" height="630" fill="#08090b"/>
  <rect width="1200" height="630" fill="url(#ogBg)"/>
  <rect width="1200" height="630" fill="url(#ogGold)"/>
  <rect width="1200" height="630" fill="url(#ogBlue)"/>
  <rect x="36" y="36" width="1128" height="558" rx="34" fill="none" stroke="#e7e9ee" stroke-opacity="0.10"/>

  <g fill="#e7e9ee">
    <circle cx="150" cy="120" r="2" opacity="0.6"/>
    <circle cx="270" cy="200" r="1.4" opacity="0.4"/>
    <circle cx="92" cy="430" r="1.6" opacity="0.45"/>
    <circle cx="1086" cy="150" r="1.6" opacity="0.45"/>
    <circle cx="1120" cy="470" r="2" opacity="0.55"/>
    <circle cx="980" cy="96" r="1.3" opacity="0.4"/>
  </g>

  <!-- copy -->
  <g transform="translate(96 0)">
    <g transform="translate(0 196)">
      <rect x="0" y="0" width="246" height="44" rx="22" fill="#e9c873" fill-opacity="0.07"/>
      <rect x="0.5" y="0.5" width="245" height="43" rx="21.5" stroke="#e9c873" stroke-opacity="0.32"/>
      <text x="22" y="29" fill="#e9c873" font-family="Segoe UI, Arial, sans-serif" font-size="15" font-weight="700" letter-spacing="0.26em">SYNASTRY GUIDE</text>
    </g>
    <text x="-4" y="372" fill="#f3f4f7" font-family="Segoe UI, Arial, sans-serif" font-size="148" font-weight="800" letter-spacing="0.05em">JUNO</text>
    <text x="2" y="436" fill="#e7e9ee" fill-opacity="0.74" font-family="Segoe UI, Arial, sans-serif" font-size="29" font-weight="500">Explore connection through synastry.</text>
    <text x="2" y="478" fill="#e7e9ee" fill-opacity="0.74" font-family="Segoe UI, Arial, sans-serif" font-size="29" font-weight="500">Birth-chart context before the conversation.</text>
  </g>

  <!-- JUNO mark on a premium tile -->
  <g transform="translate(836 165)">
    <rect x="0" y="0" width="300" height="300" rx="66" fill="url(#ogTile)"/>
    <rect x="0.5" y="0.5" width="299" height="299" rx="65.5" stroke="#e9c873" stroke-opacity="0.16"/>
    <g transform="translate(150 150) scale(0.42)">
      <circle r="120" fill="url(#goldGlow)"/>
      <circle cx="-92" cy="0" r="170" fill="none" stroke="url(#ring)" stroke-width="34"/>
      <circle cx="92" cy="0" r="170" fill="none" stroke="url(#ring)" stroke-width="34"/>
      <path d="M 92 -170 A 170 170 0 0 1 262 0 A 170 170 0 0 1 92 170" fill="none" stroke="url(#ring)" stroke-width="34"/>
      <path d="M -3 -142 A 170 170 0 0 0 -3 142" fill="none" stroke="url(#ring)" stroke-width="34"/>
      <circle r="31" fill="url(#goldPoint)"/>
      <circle r="11" fill="#fdf6e0"/>
    </g>
  </g>

  <text x="96" y="556" fill="#e7e9ee" fill-opacity="0.40" font-family="Segoe UI, Arial, sans-serif" font-size="17" font-weight="600" letter-spacing="0.16em">SYNASTRY-LED RELATIONSHIP DISCOVERY</text>
</svg>`;
}

// ---------------------------------------------------------------------------
// .ico writer -- wraps PNG blobs in an ICO container (Vista+ PNG-in-ICO).
// ---------------------------------------------------------------------------

function buildIco(entries) {
  // entries: [{ size:Number, buffer:Buffer }]
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type 1 = icon
  header.writeUInt16LE(entries.length, 4);

  const dir = Buffer.alloc(16 * entries.length);
  let offset = 6 + 16 * entries.length;
  for (let i = 0; i < entries.length; i++) {
    const { size, buffer } = entries[i];
    const b = i * 16;
    dir.writeUInt8(size >= 256 ? 0 : size, b + 0); // width  (0 => 256)
    dir.writeUInt8(size >= 256 ? 0 : size, b + 1); // height (0 => 256)
    dir.writeUInt8(0, b + 2);                      // palette colours
    dir.writeUInt8(0, b + 3);                      // reserved
    dir.writeUInt16LE(1, b + 4);                   // colour planes
    dir.writeUInt16LE(32, b + 6);                  // bits per pixel
    dir.writeUInt32LE(buffer.length, b + 8);       // image byte size
    dir.writeUInt32LE(offset, b + 12);             // image offset
    offset += buffer.length;
  }
  return Buffer.concat([header, dir, ...entries.map((e) => e.buffer)]);
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

const rasterize = (markup, size) =>
  sharp(Buffer.from(markup), { density: 384 }).resize(size, size).png().toBuffer();

async function writePng(markup, size, relPath) {
  const buf = await rasterize(markup, size);
  const full = path.join(ROOT, relPath);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, buf);
  console.log(`  ${relPath}  (${size}x${size})`);
}

async function main() {
  console.log("Generating JUNO brand assets...");

  // --- Mobile (Expo) ---
  await writePng(ICON_TILE, 1024, "apps/mobile/assets/images/icon.png");
  await writePng(ICON_FOREGROUND, 1024, "apps/mobile/assets/images/android-icon-foreground.png");
  await writePng(ICON_BACKGROUND, 1024, "apps/mobile/assets/images/android-icon-background.png");
  await writePng(ICON_MONOCHROME, 1024, "apps/mobile/assets/images/android-icon-monochrome.png");
  await writePng(ICON_FOREGROUND, 1024, "apps/mobile/assets/images/splash-icon.png");
  await writePng(ICON_TILE, 256, "apps/mobile/assets/images/favicon.png");

  // --- Mobile PWA shell (apps/mobile/public) ---
  await writePng(ICON_TILE, 256, "apps/mobile/public/favicon.png");
  await writePng(ICON_TILE, 192, "apps/mobile/public/icon-192.png");
  await writePng(ICON_TILE, 512, "apps/mobile/public/icon-512.png");

  // --- Web (apps/web/public) ---
  await writePng(ICON_TILE, 256, "apps/web/public/favicon.png");
  await writePng(ICON_TILE, 192, "apps/web/public/icon-192.png");
  await writePng(ICON_TILE, 512, "apps/web/public/icon-512.png");

  // favicon.ico (16 / 32 / 48, PNG-in-ICO)
  const icoSizes = [16, 32, 48];
  const icoEntries = [];
  for (const size of icoSizes) {
    icoEntries.push({ size, buffer: await rasterize(ICON_TILE, size) });
  }
  await fs.writeFile(path.join(ROOT, "apps/web/public/favicon.ico"), buildIco(icoEntries));
  console.log(`  apps/web/public/favicon.ico  (${icoSizes.join("/")})`);

  // Open Graph image
  const ogBuf = await sharp(Buffer.from(ogImage()), { density: 192 }).png().toBuffer();
  await fs.writeFile(path.join(ROOT, "apps/web/public/og-image.png"), ogBuf);
  console.log("  apps/web/public/og-image.png  (1200x630)");

  console.log("Done. JUNO brand assets regenerated.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
