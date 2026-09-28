#!/usr/bin/env node
/**
 * Lighthouse-style checks for the public pages, without Lighthouse: serves
 * dist/ locally and drives Chromium via Playwright (the global install is
 * fine; browsers from PLAYWRIGHT_BROWSERS_PATH, never `playwright install`).
 *
 * Per public URL in dist/sitemap.xml, on a throttled mobile profile:
 *   - crawler view (JavaScript off): <h1>, <html lang/dir>, canonical present
 *   - FCP, LCP, CLS, TTFB, transferred KB, JS KB from the Performance APIs
 *   - hydration: no console errors / React hydration errors, prerendered DOM
 *     kept (not wiped and re-rendered)
 *   - <img> without width/height (layout-shift risk)
 * Plus: a private path (/dashboard) falls back to the SPA shell and routes.
 *
 * Budgets (Core Web Vitals "good"): LCP ≤ 2500 ms, CLS ≤ 0.1. Exit code 1 on
 * any failure; exit 0 with a note when Playwright is unavailable.
 *
 *   npm run build && PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers npm run perf:public
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPlaywright } from './lib/playwright.mjs';
import { startStaticServer } from './lib/static-server.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const BUDGET = { lcp: 2500, cls: 0.1 };

const sitemapPath = path.join(dist, 'sitemap.xml');
if (!fs.existsSync(sitemapPath)) {
  console.error('dist/sitemap.xml missing — run `npm run build` first.');
  process.exit(1);
}
const paths = [...fs.readFileSync(sitemapPath, 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)].map(
  (m) => new URL(m[1]).pathname,
);

const pw = await loadPlaywright();
if (!pw) {
  console.log('Playwright not available — skipping public page performance checks.');
  process.exit(0);
}

const server = await startStaticServer(dist);
const browser = await pw.chromium.launch();
const failures = [];
const rows = [];

const MOBILE = {
  viewport: { width: 412, height: 823 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  userAgent:
    'Mozilla/5.0 (Linux; Android 11; moto g power (2022)) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36',
};

async function crawlerView(p) {
  const ctx = await browser.newContext({ javaScriptEnabled: false });
  const page = await ctx.newPage();
  await page.goto(server.origin + p);
  const info = await page.evaluate(() => ({
    h1: document.querySelector('h1')?.textContent?.trim() ?? '',
    lang: document.documentElement.lang,
    dir: document.documentElement.dir,
    canonical: document.querySelector('link[rel="canonical"]')?.getAttribute('href') ?? '',
  }));
  await ctx.close();
  return info;
}

async function measure(p) {
  const ctx = await browser.newContext(MOBILE);
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error' && !/Failed to load resource/.test(msg.text())) errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(String(err)));

  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await cdp.send('Network.enable');
  // Roughly Lighthouse's "slow 4G": 150 ms RTT, ~1.6 Mbps down.
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 150,
    downloadThroughput: (1.6 * 1024 * 1024) / 8,
    uploadThroughput: (750 * 1024) / 8,
  });

  await page.addInitScript(() => {
    window.__cwv = { lcp: 0, cls: 0 };
    // createRoot() on a prerendered page empties #root; hydrateRoot() does not.
    window.__rootReplaced = false;
    new MutationObserver((records) => {
      for (const r of records) {
        if (r.target instanceof Element && r.target.id === 'root' && r.removedNodes.length) window.__rootReplaced = true;
      }
    }).observe(document, { childList: true, subtree: true });
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) window.__cwv.lcp = e.startTime;
    }).observe({ type: 'largest-contentful-paint', buffered: true });
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) if (!e.hadRecentInput) window.__cwv.cls += e.value;
    }).observe({ type: 'layout-shift', buffered: true });
  });

  await page.goto(server.origin + p, { waitUntil: 'networkidle' });
  // Let hydration and late shifts settle, then read the numbers.
  await page.waitForTimeout(1500);

  const m = await page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0];
    const res = performance.getEntriesByType('resource');
    const fcp = performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? 0;
    const kb = (n) => Math.round(n / 1024);
    const imgsNoSize = [...document.images].filter((img) => !img.getAttribute('width') || !img.getAttribute('height')).length;
    return {
      ttfb: Math.round(nav.responseStart),
      fcp: Math.round(fcp),
      lcp: Math.round(window.__cwv.lcp),
      cls: Number(window.__cwv.cls.toFixed(3)),
      transferKB: kb(nav.transferSize + res.reduce((s, r) => s + (r.transferSize || 0), 0)),
      jsKB: kb(res.filter((r) => r.initiatorType === 'script' || r.name.endsWith('.js')).reduce((s, r) => s + (r.transferSize || 0), 0)),
      imgsNoSize,
      rootReplaced: window.__rootReplaced,
      hasH1: Boolean(document.querySelector('h1')),
    };
  });
  await ctx.close();
  return { ...m, errors, hydratedInPlace: m.hasH1 && !m.rootReplaced };
}

try {
  for (const p of paths) {
    const crawl = await crawlerView(p);
    const r = await measure(p);
    const expectLang = p === '/en' || p.startsWith('/en/') ? 'en' : 'he';
    const problems = [];
    if (!crawl.h1) problems.push('no <h1> without JS');
    if (crawl.lang !== expectLang) problems.push(`lang=${crawl.lang}`);
    if (crawl.dir !== (expectLang === 'he' ? 'rtl' : 'ltr')) problems.push(`dir=${crawl.dir}`);
    if (!crawl.canonical) problems.push('no canonical');
    if (r.lcp > BUDGET.lcp) problems.push(`LCP ${r.lcp}ms > ${BUDGET.lcp}`);
    if (r.cls > BUDGET.cls) problems.push(`CLS ${r.cls} > ${BUDGET.cls}`);
    if (r.imgsNoSize) problems.push(`${r.imgsNoSize} <img> without width/height`);
    if (r.errors.length) problems.push(`console errors: ${r.errors.join(' | ').slice(0, 300)}`);
    if (!r.hydratedInPlace) problems.push('prerendered DOM was not hydrated in place');
    rows.push({ path: p, ttfb: r.ttfb, fcp: r.fcp, lcp: r.lcp, cls: r.cls, kb: r.transferKB, jsKB: r.jsKB, ok: problems.length ? 'FAIL' : 'ok' });
    for (const problem of problems) failures.push(`${p}: ${problem}`);
  }

  // A private route must fall back to the SPA shell and route client-side.
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const res = await page.goto(`${server.origin}/dashboard`, { waitUntil: 'networkidle' });
  const html = await res.text();
  if (!html.includes('content="noindex"')) failures.push('/dashboard: not served the noindex SPA shell');
  if (!page.url().endsWith('/login')) failures.push(`/dashboard: expected redirect to /login, got ${page.url()}`);
  await ctx.close();
} finally {
  await browser.close();
  await server.close();
}

console.log('\nPublic pages — throttled mobile (4x CPU, ~slow 4G). Times in ms, sizes in KB.\n');
console.table(rows);
if (failures.length) {
  console.error(`\n${failures.length} problem(s):\n - ${failures.join('\n - ')}`);
  process.exit(1);
}
console.log(`\nAll ${rows.length} public pages within budget (LCP ≤ ${BUDGET.lcp} ms, CLS ≤ ${BUDGET.cls}), hydrated in place, no console errors.`);
