/**
 * SEO output checks — run after `npm run build` (which prerenders):
 *
 *   npm run test:seo        (node --test tests/)
 *
 * Verifies dist/robots.txt, dist/sitemap.xml, every prerendered page and the
 * SPA shell. Zero dependencies: node:test + string/regex parsing of our own,
 * predictable output.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const read = (rel) => fs.readFileSync(path.join(dist, rel), 'utf8');

if (!fs.existsSync(path.join(dist, 'sitemap.xml'))) {
  throw new Error('dist/sitemap.xml not found — run `npm run build` (or `npx vite build && npm run prerender`) first.');
}

// ─── Inputs ───────────────────────────────────────────────────────────────────

const sitemap = read('sitemap.xml');
const robots = read('robots.txt');

const urlEntries = [...sitemap.matchAll(/<url>([\s\S]*?)<\/url>/g)].map((m) => {
  const block = m[1];
  const loc = /<loc>([^<]+)<\/loc>/.exec(block)[1];
  const alternates = Object.fromEntries(
    [...block.matchAll(/<xhtml:link rel="alternate" hreflang="([^"]+)" href="([^"]+)"\/>/g)].map((a) => [a[1], a[2]]),
  );
  return { loc, path: new URL(loc).pathname, alternates };
});

/** Paths App.tsx wraps in <PrivateRoute>. */
const privateRoutesInApp = (() => {
  const app = fs.readFileSync(path.join(root, 'src', 'App.tsx'), 'utf8');
  return [...app.matchAll(/<Route\s+path="([^"]+)"\s+element=\{\s*<PrivateRoute/g)].map((m) => m[1]);
})();

const disallowed = [...robots.matchAll(/^Disallow:\s*(\S+)/gm)].map((m) => m[1]);
// robots.txt rules are plain prefixes.
const isDisallowed = (p) => disallowed.some((rule) => p.startsWith(rule));

const fileFor = (p) => (p === '/' ? 'index.html' : path.join(p.slice(1), 'index.html'));

const attr = (tag, name) => new RegExp(`${name}="([^"]*)"`).exec(tag)?.[1];
const headTags = (html, selector) => [...html.matchAll(new RegExp(`<${selector}[^>]*>`, 'g'))].map((m) => m[0]);

const jsonLdOf = (html) =>
  [...html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));

const allKeys = (value, keys = []) => {
  if (Array.isArray(value)) value.forEach((v) => allKeys(v, keys));
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      keys.push(k);
      allKeys(v, keys);
    }
  }
  return keys;
};

const typesOf = (graph) => graph.map((node) => node['@type']);

// ─── robots.txt ───────────────────────────────────────────────────────────────

test('robots.txt disallows /api and every private app route, and points at the sitemap', () => {
  assert.ok(disallowed.includes('/api/'), 'Disallow: /api/');
  assert.ok(privateRoutesInApp.length >= 8, `found private routes in App.tsx: ${privateRoutesInApp}`);
  for (const route of privateRoutesInApp) {
    assert.ok(disallowed.includes(route), `robots.txt must disallow ${route}`);
  }
  const sitemapLine = /^Sitemap:\s*(\S+)$/m.exec(robots);
  assert.ok(sitemapLine, 'Sitemap line present');
  assert.match(sitemapLine[1], /^https?:\/\/[^/]+\/sitemap\.xml$/, 'absolute sitemap URL');
  assert.ok(!/^Disallow:\s*\/\s*$/m.test(robots), 'must not disallow the whole site');
});

// ─── sitemap.xml ──────────────────────────────────────────────────────────────

test('sitemap lists he + en home, guides index and every guide', () => {
  const paths = urlEntries.map((u) => u.path);
  for (const p of ['/', '/en', '/guides', '/en/guides']) assert.ok(paths.includes(p), `sitemap has ${p}`);
  const heGuides = paths.filter((p) => p.startsWith('/guides/'));
  const enGuides = paths.filter((p) => p.startsWith('/en/guides/'));
  assert.ok(heGuides.length >= 4 && heGuides.length <= 6, `4–6 guides, got ${heGuides.length}`);
  assert.equal(heGuides.length, enGuides.length, 'every guide in both languages');
  assert.equal(new Set(paths).size, paths.length, 'no duplicate URLs');
});

test('sitemap contains no private, auth or API routes', () => {
  for (const { path: p } of urlEntries) {
    assert.ok(!isDisallowed(p), `${p} is disallowed in robots.txt but listed in the sitemap`);
    assert.ok(!/^\/(api|login|signup|s)(\/|$)/.test(p), `${p} should not be in the sitemap`);
    for (const route of privateRoutesInApp) assert.ok(!p.startsWith(route), `${p} is a private route`);
  }
});

test('sitemap hreflang: he, en and x-default on every URL, reciprocal pairs', () => {
  const locs = new Set(urlEntries.map((u) => u.loc));
  const byLoc = new Map(urlEntries.map((u) => [u.loc, u]));
  for (const u of urlEntries) {
    assert.deepEqual(Object.keys(u.alternates).sort(), ['en', 'he', 'x-default'], `${u.loc} alternates`);
    assert.equal(u.alternates['x-default'], u.alternates.he, 'x-default is the Hebrew (default) page');
    const self = u.path === '/en' || u.path.startsWith('/en/') ? 'en' : 'he';
    assert.equal(u.alternates[self], u.loc, `${u.loc} lists itself as ${self}`);
    for (const lang of ['he', 'en']) {
      const other = u.alternates[lang];
      assert.ok(locs.has(other), `alternate ${other} is itself in the sitemap`);
      assert.deepEqual(byLoc.get(other).alternates, u.alternates, `${other} points back with the same set`);
    }
  }
});

// ─── Prerendered pages ────────────────────────────────────────────────────────

for (const entry of urlEntries) {
  test(`prerendered ${entry.path}`, () => {
    const file = path.join(dist, fileFor(entry.path));
    assert.ok(fs.existsSync(file), `${fileFor(entry.path)} exists`);
    const html = fs.readFileSync(file, 'utf8');
    const lang = entry.path === '/en' || entry.path.startsWith('/en/') ? 'en' : 'he';

    // <html lang dir>
    assert.match(html, new RegExp(`<html lang="${lang}" dir="${lang === 'he' ? 'rtl' : 'ltr'}">`));

    // Content is in the HTML, not only after JS.
    assert.match(html, new RegExp(`<div id="root" data-prerendered-path="${entry.path.replace(/\//g, '\\/')}">`));
    assert.match(html, /<h1[^>]*>[^<]+/, 'has a non-empty <h1>');
    assert.match(html, /<main id="main-content"/, 'has the <main> landmark');

    // Exactly one title / description / canonical.
    const titles = [...html.matchAll(/<title>([^<]+)<\/title>/g)];
    assert.equal(titles.length, 1, 'one <title>');
    const descriptions = headTags(html, 'meta').filter((t) => attr(t, 'name') === 'description');
    assert.equal(descriptions.length, 1, 'one meta description');
    assert.ok(attr(descriptions[0], 'content').length >= 50, 'description is substantive');
    const canonicals = headTags(html, 'link').filter((t) => attr(t, 'rel') === 'canonical');
    assert.equal(canonicals.length, 1, 'one canonical');
    assert.equal(attr(canonicals[0], 'href'), entry.loc, 'canonical = sitemap loc');

    // hreflang in the page matches the sitemap.
    const alternates = Object.fromEntries(
      headTags(html, 'link')
        .filter((t) => attr(t, 'rel') === 'alternate' && attr(t, 'hreflang'))
        .map((t) => [attr(t, 'hreflang'), attr(t, 'href')]),
    );
    assert.deepEqual(alternates, entry.alternates, 'page hreflang = sitemap hreflang');

    // Open Graph + Twitter.
    const og = Object.fromEntries(
      headTags(html, 'meta')
        .filter((t) => attr(t, 'property')?.startsWith('og:'))
        .map((t) => [attr(t, 'property'), attr(t, 'content')]),
    );
    for (const key of ['og:title', 'og:description', 'og:url', 'og:image', 'og:type', 'og:locale', 'og:site_name']) {
      assert.ok(og[key], `${key} present`);
    }
    assert.equal(og['og:url'], entry.loc);
    assert.equal(og['og:locale'], lang === 'he' ? 'he_IL' : 'en_US');
    assert.match(og['og:image'], /^https?:\/\/.+\/seo\/og-default\.png$/, 'absolute og:image');
    const tw = Object.fromEntries(
      headTags(html, 'meta')
        .filter((t) => attr(t, 'name')?.startsWith('twitter:'))
        .map((t) => [attr(t, 'name'), attr(t, 'content')]),
    );
    assert.equal(tw['twitter:card'], 'summary_large_image');
    assert.ok(tw['twitter:title'] && tw['twitter:image']);

    // Not accidentally noindexed.
    assert.ok(!/name="robots" content="noindex"/.test(html), 'public page is indexable');

    // JSON-LD parses; no ratings/reviews/offers anywhere.
    const blocks = jsonLdOf(html);
    assert.equal(blocks.length, 1, 'one JSON-LD block');
    const graph = blocks[0]['@graph'];
    assert.equal(blocks[0]['@context'], 'https://schema.org');
    const keys = allKeys(blocks[0]);
    for (const key of keys) {
      // aggregateRating, ratingValue, bestRating, review, reviewCount… (but not "operatingSystem")
      assert.ok(!/^(aggregate)?rating|rating(value|count)?$|review/i.test(key), `JSON-LD must not contain "${key}"`);
      assert.notEqual(key, 'offers', 'no offers: prices are not firmly defined at build time');
    }
    assert.ok(!/"@type":"(Review|AggregateRating|Rating|Offer)"/.test(JSON.stringify(blocks[0])));
    const types = typesOf(graph);
    assert.ok(types.includes('Organization') && types.includes('WebSite'), 'Organization + WebSite everywhere');
    if (entry.path === '/' || entry.path === '/en') {
      assert.ok(types.includes('SoftwareApplication'), 'home has SoftwareApplication');
    }
    if (/\/guides\/[^/]+$/.test(entry.path)) {
      assert.ok(types.includes('Article') && types.includes('BreadcrumbList'), 'guide has Article + BreadcrumbList');
      const article = graph.find((n) => n['@type'] === 'Article');
      assert.equal(article.inLanguage, lang);
      assert.match(article.datePublished, /^\d{4}-\d{2}-\d{2}$/);
      // CTA to signup, tagged for attribution.
      const slug = entry.path.split('/').pop();
      assert.ok(
        html.includes(`href="/signup?utm_source=seo&amp;utm_medium=guide&amp;utm_campaign=${slug}"`),
        'signup CTA with utm_source=seo, utm_medium=guide, utm_campaign=<slug>',
      );
      // Cautious-health note is present.
      assert.match(html, /role="note"/, 'has the consult-a-professional note');
    }
  });
}

test('guides content: every guide has both languages, reading time, and the professional note', async () => {
  const { guides, readingMinutesOf } = await loadGuides();
  for (const g of guides) {
    for (const lang of ['he', 'en']) {
      const loc = g.locales[lang];
      assert.ok(loc.title && loc.description && loc.slug, `${g.id}/${lang} title/description/slug`);
      assert.match(loc.slug, /^[a-z0-9-]+$/, 'ASCII slug');
      assert.ok(readingMinutesOf(loc) >= 1, 'reading time');
      assert.equal(loc.body.at(-1).type, 'note', `${g.id}/${lang} ends with the professional note`);
      const text = JSON.stringify(loc.body);
      assert.ok(!/guarantee|מובטח|תרד[יו] \d/i.test(text), `${g.id}/${lang}: no promised results`);
    }
  }
});

// ─── Shell and assets ─────────────────────────────────────────────────────────

test('app.html is the empty SPA shell and is noindex', () => {
  const shell = read('app.html');
  assert.match(shell, /<meta name="robots" content="noindex" \/>/);
  assert.match(shell, /<div id="root"><\/div>/);
  assert.ok(!shell.includes('data-prerendered-path'));
});

test('default OG image is a 1200x630 PNG and the logo is 512x512', () => {
  const size = (rel) => {
    const buf = fs.readFileSync(path.join(dist, rel));
    assert.equal(buf.toString('ascii', 1, 4), 'PNG', `${rel} is a PNG`);
    return [buf.readUInt32BE(16), buf.readUInt32BE(20)];
  };
  assert.deepEqual(size('seo/og-default.png'), [1200, 630]);
  assert.deepEqual(size('seo/logo-512.png'), [512, 512]);
});

// The SSR bundle exposes the same content the pages were built from.
async function loadGuides() {
  const entry = path.join(root, 'dist-ssr', 'entry-server.js');
  if (!fs.existsSync(entry)) throw new Error('dist-ssr/entry-server.js missing — run `npm run prerender`.');
  process.env.NODE_ENV ||= 'production';
  const mod = await import(new URL(`file://${entry}`).href);
  return { guides: mod.guides, readingMinutesOf: mod.readingMinutes };
}
