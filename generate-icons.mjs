import sharp from 'sharp';
import { mkdirSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const svgPath = path.join(__dirname, 'public', 'icon.svg');

// Single source → all destinations
const androidResDir = path.join(__dirname, 'android', 'app', 'src', 'main', 'res');
const publicDir = path.join(__dirname, 'public');

const androidSizes = [
  { name: 'mipmap-mdpi', size: 48, fgSize: 108 },
  { name: 'mipmap-hdpi', size: 72, fgSize: 162 },
  { name: 'mipmap-xhdpi', size: 96, fgSize: 216 },
  { name: 'mipmap-xxhdpi', size: 144, fgSize: 324 },
  { name: 'mipmap-xxxhdpi', size: 192, fgSize: 432 },
];

const webOutputs = [
  { file: 'favicon.png', size: 32 },
  { file: 'icon-192.png', size: 192 },
  { file: 'icon-512.png', size: 512 },
];

async function generate() {
  // ── Android icons → android/app/src/main/res/mipmap-*/
  for (const { name, size, fgSize } of androidSizes) {
    const dir = path.join(androidResDir, name);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const buf = await sharp(svgPath).resize(size, size).png().toBuffer();
    await sharp(buf).toFile(path.join(dir, 'ic_launcher.png'));
    await sharp(buf).toFile(path.join(dir, 'ic_launcher_round.png'));
    // Foreground for adaptive icons: icon centered on transparent background
    const fgBuf = await sharp(svgPath).resize(Math.round(fgSize * 0.6), Math.round(fgSize * 0.6)).png().toBuffer();
    await sharp({
      create: { width: fgSize, height: fgSize, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } }
    }).composite([{ input: fgBuf, gravity: 'centre' }]).png().toFile(path.join(dir, 'ic_launcher_foreground.png'));
    console.log(`  ✓ ${name} (${size}x${size}, fg ${fgSize}x${fgSize})`);
  }

  // ── Web / PWA icons → public/
  for (const { file, size } of webOutputs) {
    await sharp(svgPath).resize(size, size).png().toFile(path.join(publicDir, file));
    console.log(`  ✓ ${file} (${size}x${size})`);
  }

  console.log('\n✅ All icons written directly to final destinations.');
  console.log('   Android: android/app/src/main/res/mipmap-*/');
  console.log('   Web:     public/');
}

generate().catch(console.error);
