const sharp = require('sharp');
const path = require('path');

const outputDir = path.join(__dirname, '..', 'assets', 'images');

// Simple icon SVG
const iconSVG = `
<svg width="1024" height="1024" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#1a1a2e"/>
      <stop offset="100%" stop-color="#0f0f1a"/>
    </linearGradient>
  </defs>
  <rect width="1024" height="1024" fill="url(#bg)" rx="200"/>
  <circle cx="512" cy="512" r="300" fill="none" stroke="#e94560" stroke-width="3" opacity="0.3"/>
  <text x="512" y="600" text-anchor="middle" font-size="400" fill="#e94560">✦</text>
</svg>
`;

const foregroundSVG = `
<svg width="1024" height="1024" xmlns="http://www.w3.org/2000/svg">
  <text x="512" y="600" text-anchor="middle" font-size="400" fill="#e94560">✦</text>
</svg>
`;

const backgroundSVG = `
<svg width="1024" height="1024" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#1a1a2e"/>
      <stop offset="100%" stop-color="#0f0f1a"/>
    </linearGradient>
  </defs>
  <rect width="1024" height="1024" fill="url(#bg)"/>
</svg>
`;

async function generate() {
  try {
    console.log('Generating icons...');
    
    await sharp(Buffer.from(iconSVG))
      .png()
      .toFile(path.join(outputDir, 'icon.png'));
    console.log('✅ icon.png');

    await sharp(Buffer.from(foregroundSVG))
      .png()
      .toFile(path.join(outputDir, 'android-icon-foreground.png'));
    console.log('✅ android-icon-foreground.png');

    await sharp(Buffer.from(backgroundSVG))
      .png()
      .toFile(path.join(outputDir, 'android-icon-background.png'));
    console.log('✅ android-icon-background.png');

    await sharp(Buffer.from(iconSVG))
      .resize(48, 48)
      .png()
      .toFile(path.join(outputDir, 'favicon.png'));
    console.log('✅ favicon.png');

    await sharp(Buffer.from(foregroundSVG))
      .resize(200, 200)
      .png()
      .toFile(path.join(outputDir, 'splash-icon.png'));
    console.log('✅ splash-icon.png');

    console.log('\n🎉 All icons generated!');
  } catch (err) {
    console.error('Error:', err);
  }
}

generate();