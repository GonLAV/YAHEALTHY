#!/usr/bin/env node
/**
 * One-off: rasterise public/seo/*.svg into the PNGs that Open Graph, Twitter
 * and the Organization JSON-LD reference (most social scrapers do not accept
 * SVG). The PNGs are committed; rerun only after changing an SVG:
 *
 *   PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node scripts/render-seo-images.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPlaywright } from './lib/playwright.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const seoDir = path.join(root, 'public', 'seo');

const jobs = [
  { svg: 'og-default.svg', png: 'og-default.png', width: 1200, height: 630 },
  { svg: 'logo.svg', png: 'logo-512.png', width: 512, height: 512 },
];

const pw = await loadPlaywright();
if (!pw) {
  console.error('Playwright not found (local or global); cannot render images.');
  process.exit(1);
}

const browser = await pw.chromium.launch();
try {
  for (const job of jobs) {
    const page = await browser.newPage({ viewport: { width: job.width, height: job.height } });
    const svg = fs.readFileSync(path.join(seoDir, job.svg), 'utf8');
    await page.setContent(
      `<!doctype html><html><body style="margin:0;background:transparent">${svg}</body></html>`,
    );
    await page.screenshot({
      path: path.join(seoDir, job.png),
      clip: { x: 0, y: 0, width: job.width, height: job.height },
      omitBackground: job.png.startsWith('logo'),
    });
    await page.close();
    console.log(`wrote public/seo/${job.png} (${job.width}x${job.height})`);
  }
} finally {
  await browser.close();
}
