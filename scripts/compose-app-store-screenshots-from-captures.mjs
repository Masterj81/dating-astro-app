// compose-app-store-screenshots-from-captures.mjs
//
// Frames real JUNO screen captures into App Store screenshots, following
// the authoritative narrative in docs/marketing/screenshot-seed-notes.md:
//
//   1. Explore connection through synastry
//   2. See chart context before the conversation
//   3. Browse relationship profiles with intention
//   4. Start with guided intros and voice context
//   5. Understand relationship dynamics, not generic profiles
//
// Source captures live in apps/web/public/screenshots/. They MUST be
// recaptured from the real JUNO synastry surfaces before submission
// (see screenshot-seed-notes.md) — the captions below are the spec.
// No swipe deck, no like/pass, no match-celebration, no AstroDating brand.
//
//   node scripts/compose-app-store-screenshots-from-captures.mjs

import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const root = process.cwd();
const sourceDir = path.join(root, "apps", "web", "public", "screenshots");
const outputDir = path.join(root, "apps", "mobile", "store-assets", "app-store-real", "iphone-6-9");
const iconPath = path.join(root, "apps", "mobile", "assets", "images", "icon.png");

const WIDTH = 1320;
const HEIGHT = 2868;

const GOLD = "#e9c873";
const BLUE = "#7aa7ff";
const IVORY = "#e7e9ee";

const shots = [
  {
    source: "compatibility.png",
    output: "01-synastry-insight.png",
    title: "Explore connection through synastry",
    subtitle: "See the synastry between two birth charts before any conversation begins.",
    accent: GOLD,
  },
  {
    source: "premium-cosmic.png",
    output: "02-chart-context.png",
    title: "See chart context before the conversation",
    subtitle: "Review birth-chart context — Sun, Moon and Rising — on every relationship profile.",
    accent: BLUE,
  },
  {
    source: "discover.png",
    output: "03-browse-with-intention.png",
    title: "Browse relationship profiles with intention",
    subtitle: "One relationship profile at a time, with calm and deliberate navigation.",
    accent: GOLD,
  },
  {
    source: "chat.png",
    output: "04-guided-intro.png",
    title: "Start with guided intros and voice context",
    subtitle: "Open with a prompt shaped by your charts, and a voice intro before the first message.",
    accent: BLUE,
  },
  {
    source: "premium-celestial.png",
    output: "05-relationship-dynamics.png",
    title: "Understand relationship dynamics, not generic profiles",
    subtitle: "A relationship-dynamics breakdown framed by the synastry insight.",
    accent: GOLD,
  },
];

await fs.mkdir(outputDir, { recursive: true });

const icon = await fs.readFile(iconPath);
const iconDataUri = `data:image/png;base64,${icon.toString("base64")}`;

for (const [index, shot] of shots.entries()) {
  const sourcePath = path.join(sourceDir, shot.source);
  await fs.access(sourcePath);

  const metadata = await sharp(sourcePath).metadata();
  const cropTop = Math.min(136, Math.max(0, (metadata.height ?? 1688) - 300));
  const cropHeight = Math.max(300, (metadata.height ?? 1688) - cropTop);

  const phone = await sharp(sourcePath)
    .extract({ left: 0, top: cropTop, width: metadata.width ?? 780, height: cropHeight })
    .resize({ width: 720, height: 1558, fit: "cover", position: "top" })
    .png()
    .toBuffer();

  const svg = frameSvg(shot, index + 1);
  const outputPath = path.join(outputDir, shot.output);

  await sharp(Buffer.from(svg))
    .composite([{ input: phone, left: 300, top: 940 }])
    .png()
    .toFile(outputPath);

  console.log(outputPath);
}

function frameSvg(shot, number) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#11141b"/>
      <stop offset="0.5" stop-color="#0c0e13"/>
      <stop offset="1" stop-color="#08090b"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="28%" r="70%">
      <stop offset="0" stop-color="${shot.accent}" stop-opacity="0.24"/>
      <stop offset="0.45" stop-color="${shot.accent}" stop-opacity="0.08"/>
      <stop offset="1" stop-color="${shot.accent}" stop-opacity="0"/>
    </radialGradient>
    <filter id="shadow" x="-30%" y="-20%" width="160%" height="150%">
      <feDropShadow dx="0" dy="34" stdDeviation="46" flood-color="#000000" flood-opacity="0.52"/>
    </filter>
  </defs>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bg)"/>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#glow)"/>
  ${stars()}

  <image href="${iconDataUri}" x="76" y="86" width="74" height="74"/>
  <text x="174" y="132" fill="${IVORY}" font-family="Inter, Arial, sans-serif" font-size="38" font-weight="800" letter-spacing="0.06em">JUNO</text>
  <text x="1244" y="132" text-anchor="end" fill="${shot.accent}" font-family="Inter, Arial, sans-serif" font-size="28" font-weight="800">${String(number).padStart(2, "0")}</text>

  ${textBlock(shot.title, 76, 245, 1168, 76, IVORY, 1.08, 900)}
  ${textBlock(shot.subtitle, 76, 455, 1080, 37, "#cdd0d9", 1.24, 500)}

  <g filter="url(#shadow)">
    <rect x="260" y="875" width="800" height="1748" rx="94" fill="#0a0a12" stroke="#2c2a3e" stroke-width="5"/>
    <rect x="300" y="940" width="720" height="1558" rx="54" fill="#05050a"/>
    <rect x="550" y="904" width="220" height="36" rx="18" fill="#030309"/>
  </g>

  <text x="${WIDTH / 2}" y="2778" text-anchor="middle" fill="#8b8f9c" font-family="Inter, Arial, sans-serif" font-size="25">Explore connection through synastry</text>
</svg>`;
}

function textBlock(text, x, y, maxW, fontSize, color, lineHeight, weight) {
  const lines = wrap(text, Math.floor(maxW / (fontSize * 0.56)));
  return `<text x="${x}" y="${y}" fill="${color}" font-family="Inter, Arial, sans-serif" font-size="${fontSize}" font-weight="${weight}">
    ${lines.map((line, i) => `<tspan x="${x}" dy="${i === 0 ? 0 : fontSize * lineHeight}">${esc(line)}</tspan>`).join("")}
  </text>`;
}

function wrap(text, maxChars) {
  const words = text.split(/\s+/);
  const lines = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > maxChars && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function stars() {
  return [
    [158, 516], [725, 315], [1082, 458], [1201, 918], [211, 1377],
    [1162, 2237], [106, 2440], [568, 2624], [915, 2070],
  ].map(([x, y], i) =>
    `<circle cx="${x}" cy="${y}" r="${i % 3 === 0 ? 3.6 : 2.4}" fill="#ffffff" opacity="${i % 2 ? 0.24 : 0.38}"/>`
  ).join("");
}

function esc(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
