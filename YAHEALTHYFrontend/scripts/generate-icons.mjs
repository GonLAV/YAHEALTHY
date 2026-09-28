/**
 * Render the PWA PNG icons from the SVG sources in public/icons/.
 *
 * The PNGs are committed, so this only needs re-running when an SVG changes.
 * It uses a Playwright Chromium that is already on the machine rather than an
 * image library in package.json:
 *
 *   NODE_PATH=$(npm root -g) node scripts/generate-icons.mjs
 */
import { createRequire } from 'module';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');

const OUTPUTS = [
  { src: 'icon.svg', out: 'icon-192.png', size: 192 },
  { src: 'icon.svg', out: 'icon-512.png', size: 512 },
  { src: 'maskable.svg', out: 'maskable-192.png', size: 192 },
  { src: 'maskable.svg', out: 'maskable-512.png', size: 512 },
  // iOS ignores transparency and rounds the corners itself: use the full-bleed art.
  { src: 'maskable.svg', out: 'apple-touch-icon.png', size: 180 },
  { src: 'badge.svg', out: 'badge-96.png', size: 96 }
];

const browser = await chromium.launch();
const page = await browser.newPage();
for (const { src, out, size } of OUTPUTS) {
  const svg = readFileSync(path.join(dir, src), 'utf8');
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<html><body style="margin:0;background:transparent">` +
      `<img src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}" width="${size}" height="${size}" style="display:block"></body></html>`
  );
  await page.screenshot({ path: path.join(dir, out), omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
  console.log(`wrote ${out}`);
}
await browser.close();
