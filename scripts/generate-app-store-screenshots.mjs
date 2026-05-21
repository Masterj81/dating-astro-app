// generate-app-store-screenshots.mjs
//
// Generates placeholder App Store / Play Store screenshots for JUNO, the
// synastry-led relationship discovery app. Five framed shots that follow
// the authoritative narrative in docs/marketing/screenshot-seed-notes.md:
//
//   1. Explore connection through synastry
//   2. See chart context before the conversation
//   3. Browse relationship profiles with intention
//   4. Start with guided intros and voice context
//   5. Understand relationship dynamics, not generic profiles
//
// These are PLACEHOLDERS. The final store assets must be recaptured from
// the real JUNO synastry surfaces (see screenshot-seed-notes.md). No
// swipe deck, no like/pass, no match-celebration, no AstroDating brand.
//
//   node scripts/generate-app-store-screenshots.mjs

import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const root = process.cwd();
const outputRoot = path.join(root, "apps", "mobile", "store-assets", "app-store");
const iconPath = path.join(root, "apps", "mobile", "assets", "images", "icon.png");

const GOLD = "#e9c873";
const BLUE = "#7aa7ff";
const IVORY = "#e7e9ee";

const shots = [
  {
    slug: "01-synastry",
    title: "Explore connection through synastry",
    subtitle: "See the synastry between two birth charts before any conversation begins.",
    accent: GOLD,
    screen: "synastry",
    screenTitle: "Synastry insight",
  },
  {
    slug: "02-chart-context",
    title: "See chart context before the conversation",
    subtitle: "Review birth-chart context — Sun, Moon and Rising — on every relationship profile.",
    accent: BLUE,
    screen: "chart",
    screenTitle: "Chart context",
  },
  {
    slug: "03-browse-with-intention",
    title: "Browse relationship profiles with intention",
    subtitle: "One relationship profile at a time, with calm and deliberate navigation.",
    accent: GOLD,
    screen: "browse",
    screenTitle: "Discover",
  },
  {
    slug: "04-guided-intro",
    title: "Start with guided intros and voice context",
    subtitle: "Open with a prompt shaped by your charts, and hear a voice intro first.",
    accent: BLUE,
    screen: "intro",
    screenTitle: "Guided intro",
  },
  {
    slug: "05-relationship-dynamics",
    title: "Understand relationship dynamics, not generic profiles",
    subtitle: "A relationship-dynamics breakdown framed by the synastry insight.",
    accent: GOLD,
    screen: "dynamics",
    screenTitle: "Relationship dynamics",
  },
];

const targets = [
  { name: "iphone-6-9", width: 1320, height: 2868, phoneScale: 1 },
  { name: "ipad-13", width: 2048, height: 2732, phoneScale: 0.92 },
];

const icon = await fs.readFile(iconPath);
const iconDataUri = `data:image/png;base64,${icon.toString("base64")}`;

await fs.rm(outputRoot, { recursive: true, force: true });

for (const target of targets) {
  const dir = path.join(outputRoot, target.name);
  await fs.mkdir(dir, { recursive: true });
  for (const [index, shot] of shots.entries()) {
    const svg = renderShot(target, shot, index + 1);
    const file = path.join(dir, `${shot.slug}.png`);
    await sharp(Buffer.from(svg)).png().toFile(file);
    console.log(file);
  }
}

function renderShot(target, shot, number) {
  const { width, height } = target;
  const isPad = target.name.includes("ipad");
  const margin = isPad ? 120 : 76;
  const titleY = isPad ? 205 : 245;
  const phoneW = isPad ? 900 : 795;
  const phoneH = isPad ? 1840 : 1720;
  const phoneX = Math.round((width - phoneW) / 2);
  const phoneY = isPad ? 700 : 865;
  const logoSize = isPad ? 84 : 74;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#11141b"/>
      <stop offset="0.5" stop-color="#0c0e13"/>
      <stop offset="1" stop-color="#08090b"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="24%" r="65%">
      <stop offset="0" stop-color="${shot.accent}" stop-opacity="0.26"/>
      <stop offset="0.45" stop-color="${shot.accent}" stop-opacity="0.08"/>
      <stop offset="1" stop-color="${shot.accent}" stop-opacity="0"/>
    </radialGradient>
    <filter id="shadow" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="32" stdDeviation="42" flood-color="#000000" flood-opacity="0.5"/>
    </filter>
    <filter id="softShadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="14" stdDeviation="18" flood-color="#000000" flood-opacity="0.22"/>
    </filter>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#bg)"/>
  <rect width="${width}" height="${height}" fill="url(#glow)"/>
  ${stars(width, height)}
  <image href="${iconDataUri}" x="${margin}" y="${isPad ? 78 : 86}" width="${logoSize}" height="${logoSize}"/>
  <text x="${margin + logoSize + 24}" y="${isPad ? 126 : 132}" fill="${IVORY}" font-family="Inter, Arial, sans-serif" font-size="${isPad ? 42 : 38}" font-weight="800" letter-spacing="0.06em">JUNO</text>
  <text x="${width - margin}" y="${isPad ? 128 : 132}" text-anchor="end" fill="${shot.accent}" font-family="Inter, Arial, sans-serif" font-size="${isPad ? 30 : 28}" font-weight="700">${String(number).padStart(2, "0")}</text>
  ${headline(shot.title, margin, titleY, width - margin * 2, isPad ? 84 : 78)}
  ${paragraph(shot.subtitle, margin, titleY + (isPad ? 195 : 185), width - margin * 2, isPad ? 40 : 38, "#cdd0d9")}
  ${phoneFrame(phoneX, phoneY, phoneW, phoneH, shot)}
  <text x="${width / 2}" y="${height - (isPad ? 82 : 92)}" text-anchor="middle" fill="#8b8f9c" font-family="Inter, Arial, sans-serif" font-size="${isPad ? 28 : 24}">Explore connection through synastry</text>
</svg>`;
}

function phoneFrame(x, y, w, h, shot) {
  const screenX = x + 42;
  const screenY = y + 58;
  const screenW = w - 84;
  const screenH = h - 116;
  return `
  <g filter="url(#shadow)">
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="92" fill="#11111d" stroke="#2c2a3e" stroke-width="5"/>
    <rect x="${screenX}" y="${screenY}" width="${screenW}" height="${screenH}" rx="62" fill="#0b0b12"/>
    <rect x="${x + w / 2 - 110}" y="${y + 24}" width="220" height="34" rx="17" fill="#05050b"/>
    ${screenContent(screenX, screenY, screenW, screenH, shot)}
  </g>`;
}

function screenContent(x, y, w, h, shot) {
  const pad = 42;
  const top = y + 54;
  const left = x + pad;
  const right = x + w - pad;
  const contentW = w - pad * 2;
  const accent = shot.accent;
  const header = `
    <text x="${left}" y="${top}" fill="${IVORY}" font-family="Inter, Arial, sans-serif" font-size="34" font-weight="800" letter-spacing="0.04em">JUNO</text>
    <text x="${left}" y="${top + 44}" fill="#8b8f9c" font-family="Inter, Arial, sans-serif" font-size="22">${esc(shot.screenTitle)}</text>
    <circle cx="${right - 26}" cy="${top - 10}" r="26" fill="${accent}" opacity="0.92"/>
    <text x="${right - 26}" y="${top}" text-anchor="middle" fill="#151226" font-family="Inter, Arial, sans-serif" font-size="22" font-weight="900">J</text>`;

  const bodyTop = top + 95;
  const footer = navBar(x + 30, y + h - 132, w - 60, accent);

  const map = {
    synastry: synastryScreen(left, bodyTop, contentW, accent),
    chart: chartScreen(left, bodyTop, contentW, accent),
    browse: browseScreen(left, bodyTop, contentW, accent),
    intro: introScreen(left, bodyTop, contentW, accent),
    dynamics: dynamicsScreen(left, bodyTop, contentW, accent),
  };
  return `${header}${map[shot.screen]}${footer}`;
}

// --- Screen 1: synastry insight ---------------------------------------------
function synastryScreen(x, y, w, accent) {
  return `
    ${card(x, y, w, 1000, `
      <text x="${x + 38}" y="${y + 60}" fill="${IVORY}" font-family="Inter, Arial, sans-serif" font-size="32" font-weight="800">Synastry insight</text>
      <text x="${x + 38}" y="${y + 100}" fill="#8b8f9c" font-family="Inter, Arial, sans-serif" font-size="22">Your chart and theirs, read together</text>
      ${rings(x + w / 2, y + 290, 150)}
      <text x="${x + w / 2}" y="${y + 470}" text-anchor="middle" fill="${IVORY}" font-family="Inter, Arial, sans-serif" font-size="24" font-weight="700">Two birth charts in relation</text>
      ${scoreBar(x + 42, y + 555, w - 84, "Emotional rhythm", 0.84, accent)}
      ${scoreBar(x + 42, y + 665, w - 84, "Communication", 0.78, BLUE)}
      ${scoreBar(x + 42, y + 775, w - 84, "Shared values", 0.88, GOLD)}
      ${miniTagline(x + 42, y + 875, w - 84, "Read before the conversation", "Context first, message second.")}
    `)}`;
}

// --- Screen 2: chart context ------------------------------------------------
function chartScreen(x, y, w, accent) {
  return `
    ${card(x, y, w, 1005, `
      <text x="${x + 38}" y="${y + 60}" fill="${IVORY}" font-family="Inter, Arial, sans-serif" font-size="32" font-weight="800">Chart context</text>
      <text x="${x + 38}" y="${y + 100}" fill="#8b8f9c" font-family="Inter, Arial, sans-serif" font-size="22">The birth-chart context on every profile</text>
      ${planetRow(x + 40, y + 165, w - 80, "Sun", "Leo", "How they show up")}
      ${planetRow(x + 40, y + 300, w - 80, "Moon", "Cancer", "What feels safe")}
      ${planetRow(x + 40, y + 435, w - 80, "Rising", "Libra", "First impression")}
      ${planetRow(x + 40, y + 570, w - 80, "Venus", "Virgo", "How they connect")}
      <rect x="${x + 38}" y="${y + 730}" width="${w - 76}" height="190" rx="28" fill="#15131f" stroke="#2a2740"/>
      <text x="${x + 70}" y="${y + 788}" fill="${accent}" font-family="Inter, Arial, sans-serif" font-size="24" font-weight="800">Why chart context</text>
      ${paragraph("You review the chart context before deciding whether to start a conversation.", x + 70, y + 838, w - 140, 24, "#e2e3e9")}
    `)}`;
}

// --- Screen 3: browse relationship profiles ---------------------------------
function browseScreen(x, y, w, accent) {
  return `
    ${card(x, y, w, 1000, `
      ${pill(x + 38, y + 36, "Browse with intention", accent)}
      <rect x="${x + 36}" y="${y + 110}" width="${w - 72}" height="330" rx="30" fill="#1a1826"/>
      <circle cx="${x + w / 2}" cy="${y + 250}" r="92" fill="#23202f"/>
      <circle cx="${x + w / 2}" cy="${y + 250}" r="92" fill="none" stroke="${accent}" stroke-width="3" opacity="0.5"/>
      <text x="${x + 60}" y="${y + 510}" fill="${IVORY}" font-family="Inter, Arial, sans-serif" font-size="34" font-weight="800">Maya, 29</text>
      <text x="${x + 60}" y="${y + 552}" fill="#9a9eab" font-family="Inter, Arial, sans-serif" font-size="23">Libra Sun · Taurus Moon · Leo Rising</text>
      ${pill(x + 60, y + 588, "Looking for something real", BLUE)}
      ${pill(x + 60, y + 660, "Values: honesty, growth", GOLD)}
      <g>
        ${roundBtn(x + 60, y + 770, "Previous")}
        ${roundBtn(x + w - 60 - 150, y + 770, "Next")}
        <rect x="${x + 60 + 178}" y="${y + 770}" width="${w - 120 - 356}" height="84" rx="42" fill="${accent}"/>
        <text x="${x + w / 2}" y="${y + 819}" text-anchor="middle" fill="#151226" font-family="Inter, Arial, sans-serif" font-size="25" font-weight="800">Message</text>
      </g>
      ${miniTagline(x + 42, y + 888, w - 84, "Navigation only", "Previous and Next page the browser — no like, no pass.")}
    `)}`;
}

// --- Screen 4: guided intro + voice -----------------------------------------
function introScreen(x, y, w, accent) {
  return `
    ${card(x, y, w, 1000, `
      <text x="${x + 38}" y="${y + 60}" fill="${IVORY}" font-family="Inter, Arial, sans-serif" font-size="32" font-weight="800">Guided intro</text>
      <text x="${x + 38}" y="${y + 100}" fill="#8b8f9c" font-family="Inter, Arial, sans-serif" font-size="22">An opener shaped by your charts</text>
      <rect x="${x + 38}" y="${y + 150}" width="${w - 76}" height="250" rx="28" fill="#15131f" stroke="#2a2740"/>
      <text x="${x + 72}" y="${y + 210}" fill="${accent}" font-family="Inter, Arial, sans-serif" font-size="24" font-weight="800">Chart-shaped prompt</text>
      ${paragraph("Your Moon placements both lean toward calm routines — ask about a small ritual that feels like home.", x + 72, y + 260, w - 144, 25, IVORY)}
      <rect x="${x + 38}" y="${y + 440}" width="${w - 76}" height="150" rx="28" fill="#15131f" stroke="#2a2740"/>
      <circle cx="${x + 98}" cy="${y + 515}" r="34" fill="${accent}"/>
      <path d="M${x + 88} ${y + 500} L${x + 88} ${y + 530} L${x + 112} ${y + 515} Z" fill="#151226"/>
      <text x="${x + 156}" y="${y + 505}" fill="${IVORY}" font-family="Inter, Arial, sans-serif" font-size="24" font-weight="700">Voice intro</text>
      <text x="${x + 156}" y="${y + 538}" fill="#9a9eab" font-family="Inter, Arial, sans-serif" font-size="19">Hear them before the first message</text>
      ${miniInsight(x, y + 640, w, "Why guided", "A guided intro replaces the cold first message with shared context.", accent)}
      ${miniInsight(x, y + 820, w, "At your pace", "Start an intentional conversation when the context feels right.", BLUE)}
    `)}`;
}

// --- Screen 5: relationship dynamics ----------------------------------------
function dynamicsScreen(x, y, w, accent) {
  return `
    ${card(x, y, w, 1000, `
      <text x="${x + 38}" y="${y + 60}" fill="${IVORY}" font-family="Inter, Arial, sans-serif" font-size="32" font-weight="800">Relationship dynamics</text>
      <text x="${x + 38}" y="${y + 100}" fill="#8b8f9c" font-family="Inter, Arial, sans-serif" font-size="22">Not a generic profile — a real read</text>
      ${dynamicCard(x + 38, y + 150, w - 76, "Emotional rhythm", "How you settle, repair, and feel at ease together.", accent)}
      ${dynamicCard(x + 38, y + 326, w - 76, "Communication", "Where conversation flows and where it needs patience.", BLUE)}
      ${dynamicCard(x + 38, y + 502, w - 76, "Long-term", "The themes that ask for steady, intentional effort.", GOLD)}
      ${miniTagline(x + 42, y + 700, w - 84, "Framed by synastry", "Every read is grounded in two real birth charts.")}
      ${miniTagline(x + 42, y + 828, w - 84, "No predictions", "Astrology as a reflective language — never a forecast.")}
    `)}`;
}

// --- shared building blocks -------------------------------------------------
function rings(cx, cy, r) {
  const off = r * 0.54;
  return `
    <circle cx="${cx - off}" cy="${cy}" r="${r}" fill="none" stroke="${IVORY}" stroke-width="14"/>
    <circle cx="${cx + off}" cy="${cy}" r="${r}" fill="none" stroke="${IVORY}" stroke-width="14"/>
    <circle cx="${cx}" cy="${cy}" r="22" fill="${GOLD}"/>
    <circle cx="${cx}" cy="${cy}" r="8" fill="#fdf6e0"/>`;
}

function roundBtn(x, y, label) {
  return `<rect x="${x}" y="${y}" width="150" height="84" rx="42" fill="#1f1d2b" stroke="#332f47"/>
    <text x="${x + 75}" y="${y + 52}" text-anchor="middle" fill="${IVORY}" font-family="Inter, Arial, sans-serif" font-size="22" font-weight="700">${esc(label)}</text>`;
}

function dynamicCard(x, y, w, title, body, color) {
  return `<rect x="${x}" y="${y}" width="${w}" height="156" rx="26" fill="#15131f" stroke="#2a2740"/>
    <rect x="${x}" y="${y}" width="8" height="156" rx="4" fill="${color}"/>
    <text x="${x + 34}" y="${y + 52}" fill="${IVORY}" font-family="Inter, Arial, sans-serif" font-size="25" font-weight="800">${esc(title)}</text>
    ${paragraph(body, x + 34, y + 90, w - 68, 22, "#b6b9c4")}`;
}

function card(x, y, w, h, inner) {
  return `<g filter="url(#softShadow)"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="42" fill="#0f0e17" stroke="#23212f" stroke-width="2"/>${inner}</g>`;
}

function miniInsight(x, y, w, label, text, accent) {
  return card(x, y, w, 160, `
    <text x="${x + 36}" y="${y + 55}" fill="${accent}" font-family="Inter, Arial, sans-serif" font-size="24" font-weight="800">${esc(label)}</text>
    ${paragraph(text, x + 36, y + 96, w - 72, 23, "#e2e3e9")}
  `);
}

function miniTagline(x, y, w, label, text) {
  return `<rect x="${x}" y="${y}" width="${w}" height="112" rx="26" fill="#15131f" stroke="#2a2740"/>
    <text x="${x + 28}" y="${y + 42}" fill="#8b8f9c" font-family="Inter, Arial, sans-serif" font-size="20">${esc(label)}</text>
    <text x="${x + 28}" y="${y + 79}" fill="${IVORY}" font-family="Inter, Arial, sans-serif" font-size="23" font-weight="700">${esc(text)}</text>`;
}

function pill(x, y, text, color) {
  return `<rect x="${x}" y="${y}" width="${Math.max(220, text.length * 14)}" height="52" rx="26" fill="${color}" opacity="0.18" stroke="${color}"/>
    <text x="${x + 24}" y="${y + 34}" fill="${IVORY}" font-family="Inter, Arial, sans-serif" font-size="21" font-weight="700">${esc(text)}</text>`;
}

function planetRow(x, y, w, name, sign, label) {
  return `<rect x="${x}" y="${y}" width="${w}" height="108" rx="28" fill="#15131f" stroke="#2a2740"/>
    <text x="${x + 30}" y="${y + 46}" fill="${IVORY}" font-family="Inter, Arial, sans-serif" font-size="27" font-weight="800">${esc(name)}</text>
    <text x="${x + 30}" y="${y + 80}" fill="#8b8f9c" font-family="Inter, Arial, sans-serif" font-size="20">${esc(label)}</text>
    <text x="${x + w - 30}" y="${y + 65}" text-anchor="end" fill="${GOLD}" font-family="Inter, Arial, sans-serif" font-size="28" font-weight="800">${esc(sign)}</text>`;
}

function scoreBar(x, y, w, label, value, color) {
  return `<text x="${x}" y="${y}" fill="${IVORY}" font-family="Inter, Arial, sans-serif" font-size="25" font-weight="800">${esc(label)}</text>
    <text x="${x + w}" y="${y}" text-anchor="end" fill="#b6b9c4" font-family="Inter, Arial, sans-serif" font-size="22">${Math.round(value * 100)}</text>
    <rect x="${x}" y="${y + 28}" width="${w}" height="20" rx="10" fill="#23212f"/>
    <rect x="${x}" y="${y + 28}" width="${Math.round(w * value)}" height="20" rx="10" fill="${color}"/>`;
}

function navBar(x, y, w, accent) {
  const items = ["Home", "Discover", "Messages", "You"];
  const gap = w / items.length;
  return `<rect x="${x}" y="${y}" width="${w}" height="92" rx="46" fill="#13121c" stroke="#23212f"/>
    ${items.map((item, i) => {
      const cx = x + gap * i + gap / 2;
      const active = i === 1;
      return `<circle cx="${cx}" cy="${y + 33}" r="10" fill="${active ? accent : "#4f4d5e"}"/>
        <text x="${cx}" y="${y + 67}" text-anchor="middle" fill="${active ? IVORY : "#7c7a8a"}" font-family="Inter, Arial, sans-serif" font-size="18">${item}</text>`;
    }).join("")}`;
}

function headline(text, x, y, maxW, fontSize) {
  return textBlock(text, x, y, maxW, fontSize, IVORY, 1.08, 900);
}

function paragraph(text, x, y, maxW, fontSize, color) {
  return textBlock(text, x, y, maxW, fontSize, color, 1.25, 500);
}

function textBlock(text, x, y, maxW, fontSize, color, lineHeight, weight) {
  const lines = wrap(text, Math.max(8, Math.floor(maxW / (fontSize * 0.55))));
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

function stars(width, height) {
  const points = [
    [0.12, 0.18], [0.82, 0.16], [0.91, 0.32], [0.16, 0.48], [0.77, 0.53],
    [0.26, 0.72], [0.88, 0.78], [0.08, 0.84], [0.55, 0.11], [0.43, 0.91],
  ];
  return points.map(([px, py], i) => {
    const r = i % 3 === 0 ? 3.5 : 2.2;
    return `<circle cx="${Math.round(px * width)}" cy="${Math.round(py * height)}" r="${r}" fill="#ffffff" opacity="${i % 2 ? 0.22 : 0.36}"/>`;
  }).join("");
}

function esc(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
