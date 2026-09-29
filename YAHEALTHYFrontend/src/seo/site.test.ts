import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { guides } from '@/content/guides';
import {
  LANGS,
  PRIVATE_PATHS,
  PUBLIC_ROUTES,
  alternatesFor,
  buildSeoHead,
  buildSitemapXml,
  getSiteUrl,
  langFromPublicPath,
  localizePath,
  matchPublicRoute,
  normalizePath,
  renderSeoHeadHtml,
  serializeJsonLd,
} from './site';

const SITE = 'https://example.test';
const root = path.resolve(__dirname, '../..');
const readRepoFile = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8');

/** Every <Route path="…" element={…}> in App.tsx, with the guard wrapping it. */
const appRoutes = (() => {
  const app = readRepoFile('src/App.tsx');
  return [...app.matchAll(/<Route\s+path="([^"]+)"\s+element=\{\s*<(\w+)/g)].map((m) => ({ path: m[1], element: m[2] }));
})();

const robotsDisallow = [...readRepoFile('public/robots.txt').matchAll(/^Disallow:\s*(\S+)/gm)].map((m) => m[1]);

/** PRIVATE_PATHS entries are robots-style: exact paths, or prefixes ending in "/". */
const coveredByPrivatePaths = (p: string) =>
  PRIVATE_PATHS.some((rule) => (rule.endsWith('/') ? p.startsWith(rule) : p === rule || p.startsWith(`${rule}/`)));

describe('paths', () => {
  it('normalizePath strips trailing slashes except on the root', () => {
    expect(normalizePath('/')).toBe('/');
    expect(normalizePath('/en/')).toBe('/en');
    expect(normalizePath('/guides///')).toBe('/guides');
    expect(normalizePath('/guides/x')).toBe('/guides/x');
  });

  it('localizePath keeps Hebrew at the root and prefixes English', () => {
    expect(localizePath('he', '/')).toBe('/');
    expect(localizePath('en', '/')).toBe('/en');
    expect(localizePath('he', '/guides/')).toBe('/guides');
    expect(localizePath('en', '/guides/x')).toBe('/en/guides/x');
  });
});

describe('matchPublicRoute', () => {
  const g = guides[0];

  it.each([
    ['/', 'home', 'he'],
    ['/en', 'home', 'en'],
    ['/en/', 'home', 'en'],
    ['/guides', 'guides', 'he'],
    ['/guides/', 'guides', 'he'],
    ['/en/guides', 'guides', 'en'],
  ] as const)('%s → %s (%s)', (p, kind, lang) => {
    expect(matchPublicRoute(p)).toMatchObject({ kind, lang });
    expect(langFromPublicPath(p)).toBe(lang);
  });

  it('matches each guide in each language and returns the guide', () => {
    for (const guide of guides) {
      for (const lang of LANGS) {
        const p = localizePath(lang, `/guides/${guide.locales[lang].slug}`);
        const match = matchPublicRoute(p);
        expect(match, p).toMatchObject({ kind: 'guide', lang, path: p });
        expect(match?.guide?.id).toBe(guide.id);
      }
    }
  });

  it.each([
    '/dashboard',
    '/login',
    '/signup',
    '/sleep',
    '/english',
    '/en/dashboard',
    '/he',
    '/he/guides',
    '/guides/does-not-exist',
    `/en/guides/${g.locales.en.slug}/extra`,
    `/guides/${g.locales.he.slug.toUpperCase()}`,
    '/en/en',
    '/s/abc',
  ])('%s is not public', (p) => {
    expect(matchPublicRoute(p)).toBeNull();
    expect(langFromPublicPath(p)).toBeNull();
  });
});

describe('alternates / hreflang', () => {
  it('every public route has one alternate per language, and they point back at each other', () => {
    for (const route of PUBLIC_ROUTES) {
      const match = matchPublicRoute(route.path)!;
      expect(match, route.path).not.toBeNull();
      const alternates = alternatesFor(match);
      expect(Object.keys(alternates).sort()).toEqual([...LANGS].sort());
      expect(alternates[route.lang]).toBe(route.path);
      for (const lang of LANGS) {
        const other = matchPublicRoute(alternates[lang])!;
        expect(other, alternates[lang]).toMatchObject({ kind: match.kind, lang });
        expect(other.guide?.id).toBe(match.guide?.id);
        expect(alternatesFor(other)).toEqual(alternates);
      }
    }
  });

  it('head has he + en + x-default (= Hebrew), a self canonical and the right dir', () => {
    for (const route of PUBLIC_ROUTES) {
      const head = buildSeoHead(matchPublicRoute(route.path)!, SITE);
      expect(head.canonical).toBe(`${SITE}${route.path}`);
      expect(head.alternates.map((a) => a.hreflang)).toEqual(['he', 'en', 'x-default']);
      const byLang = Object.fromEntries(head.alternates.map((a) => [a.hreflang, a.href]));
      expect(byLang[route.lang]).toBe(head.canonical);
      expect(byLang['x-default']).toBe(byLang.he);
      expect(head.dir).toBe(route.lang === 'he' ? 'rtl' : 'ltr');
      expect(head.title.trim()).not.toBe('');
      expect(head.description.trim()).not.toBe('');
      expect(head.ogType).toBe(route.kind === 'guide' ? 'article' : 'website');
    }
  });
});

describe('PUBLIC_ROUTES', () => {
  it('lists home, the index and every guide once per language, with unique paths', () => {
    expect(PUBLIC_ROUTES).toHaveLength(LANGS.length * (2 + guides.length));
    const paths = PUBLIC_ROUTES.map((r) => r.path);
    expect(new Set(paths).size).toBe(paths.length);
    for (const r of PUBLIC_ROUTES) expect(r.lastmod).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('none of them is private or disallowed in robots.txt', () => {
    for (const r of PUBLIC_ROUTES) {
      expect(coveredByPrivatePaths(r.path), r.path).toBe(false);
      expect(robotsDisallow.some((rule) => r.path.startsWith(rule)), r.path).toBe(false);
    }
  });

  it('the sitemap lists every route exactly once with its alternates', () => {
    const xml = buildSitemapXml(SITE);
    for (const r of PUBLIC_ROUTES) {
      expect(xml.split(`<loc>${SITE}${r.path}</loc>`)).toHaveLength(2);
    }
    expect(xml.match(/hreflang="x-default"/g)).toHaveLength(PUBLIC_ROUTES.length);
  });
});

describe('PRIVATE_PATHS vs App.tsx', () => {
  const guarded = appRoutes.filter((r) => r.element === 'PrivateRoute' || r.element === 'StaffRoute');

  it('parses the routes (guards against a silently broken regex)', () => {
    expect(guarded.length).toBeGreaterThanOrEqual(10);
    expect(guarded.some((r) => r.element === 'StaffRoute')).toBe(true);
  });

  it('every <PrivateRoute>/<StaffRoute> path is covered by PRIVATE_PATHS', () => {
    for (const r of guarded) expect(coveredByPrivatePaths(r.path), `${r.path} (${r.element})`).toBe(true);
  });

  it('every PRIVATE_PATHS entry still corresponds to a route in App.tsx', () => {
    for (const rule of PRIVATE_PATHS) {
      const hit = appRoutes.some((r) => (rule.endsWith('/') ? r.path.startsWith(rule) : r.path === rule));
      expect(hit, rule).toBe(true);
    }
  });

  it('every other App.tsx route is a known public/auth route', () => {
    const allowed = new Set(['/login', '/signup', '*']);
    for (const r of appRoutes) {
      if (coveredByPrivatePaths(r.path) || allowed.has(r.path)) continue;
      const concrete = r.path.replace(':slug', guides[0].locales[r.path.startsWith('/en') ? 'en' : 'he'].slug);
      expect(matchPublicRoute(concrete), `unclassified route ${r.path}: add it to PRIVATE_PATHS or the public routes`).not.toBeNull();
    }
  });

  it('robots.txt disallows exactly PRIVATE_PATHS plus /api/', () => {
    expect([...robotsDisallow].sort()).toEqual(['/api/', ...PRIVATE_PATHS].sort());
  });
});

describe('serialisation', () => {
  it('JSON-LD cannot break out of its <script>', () => {
    const head = buildSeoHead(matchPublicRoute('/')!, SITE);
    head.jsonLd.push({ name: '</script><script>alert(1)</script>' });
    const json = serializeJsonLd(head);
    expect(json).not.toContain('<');
    expect(JSON.parse(json)['@graph'].at(-1).name).toBe('</script><script>alert(1)</script>');
  });

  it('attribute values are escaped in the rendered head', () => {
    const head = { ...buildSeoHead(matchPublicRoute('/en')!, SITE), title: 'A "quoted" <b>&', description: 'x" onload="y' };
    const html = renderSeoHeadHtml(head);
    expect(html).toContain('<title>A &quot;quoted&quot; &lt;b&gt;&amp;</title>');
    expect(html).toContain('content="x&quot; onload=&quot;y"');
    expect(html).not.toContain('onload="y"');
  });
});

describe('getSiteUrl', () => {
  it('uses VITE_SITE_URL without trailing slashes', () => {
    vi.stubEnv('VITE_SITE_URL', 'https://www.example.com//');
    expect(getSiteUrl()).toBe('https://www.example.com');
  });

  it('falls back to the preview origin when there is no window', () => {
    vi.stubEnv('VITE_SITE_URL', '');
    expect(getSiteUrl()).toBe('http://localhost:4173');
  });
});
