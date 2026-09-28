#!/usr/bin/env node
/**
 * Post-build prerender of the public pages. Runs after `vite build` (client)
 * and `vite build --ssr src/entry-server.tsx --outDir dist-ssr`; see the
 * "prerender" npm script. No browser, no extra dependencies: it renders the
 * real React tree with react-dom/server.
 *
 * Output, all in dist/:
 *   app.html            the untouched SPA shell (+ noindex) — the fallback
 *                       for every non-public path (/dashboard, /login, …)
 *   index.html          "/"   (Hebrew, lang="he" dir="rtl")
 *   en/index.html       "/en" (English, lang="en" dir="ltr")
 *   guides/…/index.html, en/guides/…/index.html
 *   sitemap.xml         every public URL with he/en/x-default hreflang
 *   robots.txt          public/robots.txt + absolute Sitemap line
 *
 * Canonical/OG/sitemap URLs need an absolute origin: set VITE_SITE_URL
 * (e.g. VITE_SITE_URL=https://www.example.com npm run build). Without it the
 * build warns and uses http://localhost:4173 (vite preview), which is only
 * right for local checks.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Production React on the server side too (smaller output, no dev warnings).
process.env.NODE_ENV ||= 'production';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const ssrEntry = path.join(root, 'dist-ssr', 'entry-server.js');

const siteUrl = (process.env.VITE_SITE_URL || '').replace(/\/+$/, '') || 'http://localhost:4173';
if (!process.env.VITE_SITE_URL) {
  console.warn(
    '[prerender] VITE_SITE_URL is not set — canonical, hreflang, OG and sitemap URLs use ' +
      `${siteUrl}. Set it for any build that will be deployed.`,
  );
}

if (!fs.existsSync(path.join(dist, 'index.html')) || !fs.existsSync(ssrEntry)) {
  console.error('[prerender] run `vite build` and the SSR build first (npm run build).');
  process.exit(1);
}

// The shell: on a rerun dist/index.html is already prerendered, so start from app.html.
const shellPath = path.join(dist, 'app.html');
const template = fs.existsSync(shellPath)
  ? fs.readFileSync(shellPath, 'utf8').replace(/\s*<meta name="robots" content="noindex" \/>/, '')
  : fs.readFileSync(path.join(dist, 'index.html'), 'utf8');

if (!template.includes('<div id="root"></div>')) {
  console.error('[prerender] dist/index.html has no empty <div id="root"></div> to fill.');
  process.exit(1);
}

// 1. SPA fallback shell, kept out of search results.
fs.writeFileSync(
  shellPath,
  template.replace('<meta charset="UTF-8" />', '<meta charset="UTF-8" />\n    <meta name="robots" content="noindex" />'),
);

const { render, PUBLIC_ROUTES, buildSitemapXml } = await import(pathToFileURL(ssrEntry).href);

// 2. One document per public route.
const stripHead = (html) =>
  html.replace(/\s*<title>[\s\S]*?<\/title>/, '').replace(/\s*<meta\s+name="description"[\s\S]*?\/>/, '');

const outFile = (route) => (route === '/' ? path.join(dist, 'index.html') : path.join(dist, route, 'index.html'));

let count = 0;
for (const route of PUBLIC_ROUTES) {
  const { html, head, headHtml } = await render(route.path, siteUrl);
  if (!html.includes('<h1')) throw new Error(`[prerender] ${route.path} rendered without an <h1>`);

  const doc = stripHead(template)
    .replace(/<html[^>]*>/, `<html lang="${head.lang}" dir="${head.dir}">`)
    .replace('</head>', `    ${headHtml}\n  </head>`)
    .replace(
      '<div id="root"></div>',
      `<div id="root" data-prerendered-path="${route.path}">${html}</div>`,
    );

  const file = outFile(route.path);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, doc);
  count += 1;
}

// 3. Sitemap and robots.
fs.writeFileSync(path.join(dist, 'sitemap.xml'), buildSitemapXml(siteUrl));

const robotsPath = path.join(dist, 'robots.txt');
const robots = fs.existsSync(robotsPath) ? fs.readFileSync(robotsPath, 'utf8') : 'User-agent: *\nAllow: /\n';
fs.writeFileSync(
  robotsPath,
  `${robots.replace(/^Sitemap:.*\n?/gm, '').trimEnd()}\n\nSitemap: ${siteUrl}/sitemap.xml\n`,
);

console.log(`[prerender] ${count} pages, sitemap.xml and robots.txt written for ${siteUrl}`);
