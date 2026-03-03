const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const SOURCE_ICON = path.join(__dirname, '../assets/images/icon.png');
const OUTPUT_DIR = path.join(__dirname, '../public');

const sizes = [
  { name: 'icon-192.png', size: 192 },
  { name: 'icon-512.png', size: 512 },
  { name: 'favicon.png', size: 32 },
];

async function generateIcons() {
  // Ensure output directory exists
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  console.log('Generating PWA icons from:', SOURCE_ICON);

  for (const { name, size } of sizes) {
    const outputPath = path.join(OUTPUT_DIR, name);

    await sharp(SOURCE_ICON)
      .resize(size, size, {
        fit: 'contain',
        background: { r: 15, g: 15, b: 26, alpha: 1 } // #0f0f1a
      })
      .png()
      .toFile(outputPath);

    console.log(`✓ Created ${name} (${size}x${size})`);
  }

  // Also copy to web folder for the marketing site
  const webPublicDir = path.join(__dirname, '../web/public');
  if (fs.existsSync(webPublicDir)) {
    for (const { name } of sizes) {
      const src = path.join(OUTPUT_DIR, name);
      const dest = path.join(webPublicDir, name);
      fs.copyFileSync(src, dest);
      console.log(`✓ Copied ${name} to web/public`);
    }
  }

  console.log('\nDone! PWA icons generated successfully.');
}

generateIcons().catch(console.error);
