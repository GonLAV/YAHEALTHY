/**
 * SEO for the public side — the single source for:
 *   - which URLs are public and indexable (PUBLIC_ROUTES → sitemap + prerender)
 *   - which URLs are private (PRIVATE_PATHS → robots.txt Disallow, test)
 *   - per-page head: title, description, canonical, hreflang, Open Graph,
 *     Twitter, JSON-LD
 *
 * Pure functions, no DOM: the build-time prerender (src/entry-server.tsx,
 * scripts/prerender.mjs) and the client hook (useSeoHead) both use them, so
 * the HTML a crawler gets and the head the SPA maintains cannot drift.
 *
 * Language URLs: Hebrew is the default and lives at the root ("/",
 * "/guides/…"); English lives under "/en" ("/en", "/en/guides/…").
 */
import type { Lang } from '@/i18n/translations';
import { translations } from '@/i18n/translations';
import { guides, findGuideBySlug, type Guide } from '@/content/guides';

export const SITE_NAME = 'YAHealthy';
export const BRAND_COLOR = '#059669'; // emerald-600
export const OG_IMAGE_PATH = '/seo/og-default.png';
export const OG_IMAGE_WIDTH = 1200;
export const OG_IMAGE_HEIGHT = 630;
export const LOGO_PATH = '/seo/logo-512.png';
/** Date the public pages' content last materially changed (sitemap lastmod). */
export const SITE_CONTENT_UPDATED = '2026-09-27';

/**
 * Signed-in app routes. Kept in step with the <PrivateRoute> routes in App.tsx
 * (tests/seo.test.mjs checks that), disallowed in robots.txt and never in the
 * sitemap.
 */
export const PRIVATE_PATHS = [
  '/dashboard',
  '/food-log',
  '/meal-plan',
  '/hydration',
  '/sleep',
  '/weight',
  '/coaching',
  '/progress',
  '/achievements',
  '/invite',
  '/upgrade',
  '/onboarding',
  '/reminders',
  '/settings',
  '/admin/',
] as const;

export const LANGS: Lang[] = ['he', 'en'];
export const DEFAULT_LANG: Lang = 'he';

/** Base URL without trailing slash. Build-time VITE_SITE_URL wins. */
export const getSiteUrl = (): string => {
  const configured = import.meta.env.VITE_SITE_URL || '';
  if (configured) return configured.replace(/\/+$/, '');
  if (typeof window !== 'undefined' && window.location?.origin) return window.location.origin;
  return 'http://localhost:4173';
};

// ─── Paths ────────────────────────────────────────────────────────────────────

/** Strip a trailing slash (except for the root). */
export const normalizePath = (pathname: string): string =>
  pathname.length > 1 ? pathname.replace(/\/+$/, '') || '/' : pathname;

/** "/guides/x" → "/en/guides/x" for en; unchanged for he. */
export const localizePath = (lang: Lang, path: string): string => {
  const clean = normalizePath(path);
  if (lang === DEFAULT_LANG) return clean;
  return clean === '/' ? `/${lang}` : `/${lang}${clean}`;
};

/** Language implied by a public URL, or null for a non-public path. */
export const langFromPublicPath = (pathname: string): Lang | null => {
  const path = normalizePath(pathname);
  const match = matchPublicRoute(path);
  return match ? match.lang : null;
};

export type PublicPageKind = 'home' | 'guides' | 'guide';

export interface PublicRouteMatch {
  kind: PublicPageKind;
  lang: Lang;
  path: string;
  guide?: Guide;
}

/** Recognise a public, indexable URL. Anything else returns null. */
export const matchPublicRoute = (pathname: string): PublicRouteMatch | null => {
  const path = normalizePath(pathname);
  let lang: Lang = DEFAULT_LANG;
  let rest = path;
  for (const l of LANGS) {
    if (l === DEFAULT_LANG) continue;
    if (path === `/${l}`) {
      lang = l;
      rest = '/';
    } else if (path.startsWith(`/${l}/`)) {
      lang = l;
      rest = path.slice(l.length + 1);
    }
  }
  if (rest === '/') return { kind: 'home', lang, path };
  if (rest === '/guides') return { kind: 'guides', lang, path };
  const guideMatch = /^\/guides\/([a-z0-9-]+)$/.exec(rest);
  if (guideMatch) {
    const guide = findGuideBySlug(lang, guideMatch[1]);
    if (guide) return { kind: 'guide', lang, path, guide };
  }
  return null;
};

/** The same page in each language: { he: "/guides/x", en: "/en/guides/x" }. */
export const alternatesFor = (match: PublicRouteMatch): Record<Lang, string> => {
  const out = {} as Record<Lang, string>;
  for (const l of LANGS) {
    if (match.kind === 'home') out[l] = localizePath(l, '/');
    else if (match.kind === 'guides') out[l] = localizePath(l, '/guides');
    else out[l] = localizePath(l, `/guides/${match.guide!.locales[l].slug}`);
  }
  return out;
};

export interface PublicRoute {
  path: string;
  lang: Lang;
  kind: PublicPageKind;
  lastmod: string;
}

/** Every indexable URL — the sitemap and the prerender both iterate this. */
export const PUBLIC_ROUTES: PublicRoute[] = LANGS.flatMap((lang) => [
  { path: localizePath(lang, '/'), lang, kind: 'home' as const, lastmod: SITE_CONTENT_UPDATED },
  { path: localizePath(lang, '/guides'), lang, kind: 'guides' as const, lastmod: latestGuideDate() },
  ...guides.map((g) => ({
    path: localizePath(lang, `/guides/${g.locales[lang].slug}`),
    lang,
    kind: 'guide' as const,
    lastmod: g.dateModified,
  })),
]);

function latestGuideDate(): string {
  const dates = guides.map((g) => g.dateModified).sort();
  return dates[dates.length - 1] ?? SITE_CONTENT_UPDATED;
}

// ─── Head ─────────────────────────────────────────────────────────────────────

const tr = (lang: Lang, key: string) => translations[lang][key] ?? translations.en[key] ?? key;

const OG_LOCALE: Record<Lang, string> = { he: 'he_IL', en: 'en_US' };

export type JsonLd = Record<string, unknown>;

export interface SeoHead {
  lang: Lang;
  dir: 'rtl' | 'ltr';
  title: string;
  description: string;
  canonical: string;
  alternates: { hreflang: string; href: string }[];
  ogType: 'website' | 'article';
  ogLocale: string;
  ogLocaleAlternate: string[];
  image: string;
  imageAlt: string;
  jsonLd: JsonLd[];
}

const organizationLd = (site: string): JsonLd => ({
  '@type': 'Organization',
  '@id': `${site}/#organization`,
  name: SITE_NAME,
  url: `${site}/`,
  logo: { '@type': 'ImageObject', url: `${site}${LOGO_PATH}`, width: 512, height: 512 },
});

const websiteLd = (site: string, lang: Lang): JsonLd => ({
  '@type': 'WebSite',
  '@id': `${site}/#website`,
  name: SITE_NAME,
  url: `${site}/`,
  inLanguage: LANGS,
  description: tr(lang, 'landing.meta.description'),
  publisher: { '@id': `${site}/#organization` },
});

/**
 * No `offers`: plan prices come from the server environment (GET
 * /api/marketing/plans returns amount:null when none is configured), so
 * nothing firm can be stated at build time. No ratings or reviews either —
 * there are none to cite.
 */
const softwareAppLd = (site: string, lang: Lang, url: string): JsonLd => ({
  '@type': 'SoftwareApplication',
  '@id': `${site}/#app`,
  name: SITE_NAME,
  url,
  applicationCategory: 'HealthApplication',
  operatingSystem: 'Web',
  inLanguage: LANGS,
  description: tr(lang, 'landing.meta.description'),
  publisher: { '@id': `${site}/#organization` },
});

const breadcrumbLd = (items: { name: string; url: string }[]): JsonLd => ({
  '@type': 'BreadcrumbList',
  itemListElement: items.map((item, i) => ({
    '@type': 'ListItem',
    position: i + 1,
    name: item.name,
    item: item.url,
  })),
});

/** Everything the <head> of a public page needs. */
export const buildSeoHead = (match: PublicRouteMatch, site: string = getSiteUrl()): SeoHead => {
  const { lang } = match;
  const alternates = alternatesFor(match);
  const canonical = `${site}${alternates[lang]}`;
  const homeUrl = `${site}${localizePath(lang, '/')}`;
  const guidesUrl = `${site}${localizePath(lang, '/guides')}`;

  let title: string;
  let description: string;
  let ogType: SeoHead['ogType'] = 'website';
  const jsonLd: JsonLd[] = [organizationLd(site), websiteLd(site, lang)];

  if (match.kind === 'home') {
    title = tr(lang, 'landing.meta.title');
    description = tr(lang, 'landing.meta.description');
    jsonLd.push(softwareAppLd(site, lang, homeUrl));
  } else if (match.kind === 'guides') {
    title = `${tr(lang, 'guides.meta.title')} | ${SITE_NAME}`;
    description = tr(lang, 'guides.meta.description');
    jsonLd.push({
      '@type': 'CollectionPage',
      name: tr(lang, 'guides.meta.title'),
      url: canonical,
      inLanguage: lang,
      hasPart: guides.map((g) => ({
        '@type': 'Article',
        headline: g.locales[lang].title,
        url: `${site}${localizePath(lang, `/guides/${g.locales[lang].slug}`)}`,
      })),
    });
    jsonLd.push(
      breadcrumbLd([
        { name: SITE_NAME, url: homeUrl },
        { name: tr(lang, 'guides.meta.title'), url: guidesUrl },
      ]),
    );
  } else {
    const guide = match.guide!;
    const loc = guide.locales[lang];
    title = `${loc.title} | ${SITE_NAME}`;
    description = loc.description;
    ogType = 'article';
    jsonLd.push({
      '@type': 'Article',
      headline: loc.title,
      description: loc.description,
      inLanguage: lang,
      url: canonical,
      mainEntityOfPage: canonical,
      datePublished: guide.datePublished,
      dateModified: guide.dateModified,
      image: `${site}${OG_IMAGE_PATH}`,
      author: { '@id': `${site}/#organization` },
      publisher: { '@id': `${site}/#organization` },
    });
    jsonLd.push(
      breadcrumbLd([
        { name: SITE_NAME, url: homeUrl },
        { name: tr(lang, 'guides.meta.title'), url: guidesUrl },
        { name: loc.title, url: canonical },
      ]),
    );
  }

  return {
    lang,
    dir: lang === 'he' ? 'rtl' : 'ltr',
    title,
    description,
    canonical,
    alternates: [
      ...LANGS.map((l) => ({ hreflang: l, href: `${site}${alternates[l]}` })),
      { hreflang: 'x-default', href: `${site}${alternates[DEFAULT_LANG]}` },
    ],
    ogType,
    ogLocale: OG_LOCALE[lang],
    ogLocaleAlternate: LANGS.filter((l) => l !== lang).map((l) => OG_LOCALE[l]),
    image: `${site}${OG_IMAGE_PATH}`,
    imageAlt: tr(lang, 'seo.ogImageAlt'),
    jsonLd,
  };
};

// ─── Serialisation ────────────────────────────────────────────────────────────

const escapeAttr = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** JSON that is safe inside <script>: no "</script>" break-out. */
export const serializeJsonLd = (head: SeoHead): string =>
  JSON.stringify({ '@context': 'https://schema.org', '@graph': head.jsonLd }).replace(/</g, '\\u003c');

/** Tags written once, in document order, by the prerender. All carry data-seo. */
export const seoHeadTags = (head: SeoHead): { tag: 'meta' | 'link'; attrs: Record<string, string> }[] => [
  { tag: 'meta', attrs: { name: 'description', content: head.description } },
  { tag: 'link', attrs: { rel: 'canonical', href: head.canonical } },
  ...head.alternates.map((a) => ({ tag: 'link' as const, attrs: { rel: 'alternate', hreflang: a.hreflang, href: a.href } })),
  { tag: 'meta', attrs: { property: 'og:site_name', content: SITE_NAME } },
  { tag: 'meta', attrs: { property: 'og:type', content: head.ogType } },
  { tag: 'meta', attrs: { property: 'og:title', content: head.title } },
  { tag: 'meta', attrs: { property: 'og:description', content: head.description } },
  { tag: 'meta', attrs: { property: 'og:url', content: head.canonical } },
  { tag: 'meta', attrs: { property: 'og:locale', content: head.ogLocale } },
  ...head.ogLocaleAlternate.map((l) => ({ tag: 'meta' as const, attrs: { property: 'og:locale:alternate', content: l } })),
  { tag: 'meta', attrs: { property: 'og:image', content: head.image } },
  { tag: 'meta', attrs: { property: 'og:image:width', content: String(OG_IMAGE_WIDTH) } },
  { tag: 'meta', attrs: { property: 'og:image:height', content: String(OG_IMAGE_HEIGHT) } },
  { tag: 'meta', attrs: { property: 'og:image:alt', content: head.imageAlt } },
  { tag: 'meta', attrs: { name: 'twitter:card', content: 'summary_large_image' } },
  { tag: 'meta', attrs: { name: 'twitter:title', content: head.title } },
  { tag: 'meta', attrs: { name: 'twitter:description', content: head.description } },
  { tag: 'meta', attrs: { name: 'twitter:image', content: head.image } },
  { tag: 'meta', attrs: { name: 'twitter:image:alt', content: head.imageAlt } },
];

/** The <title> + tags + JSON-LD as HTML, for the prerendered documents. */
export const renderSeoHeadHtml = (head: SeoHead): string => {
  const tags = seoHeadTags(head).map(({ tag, attrs }) => {
    const a = Object.entries(attrs)
      .map(([k, v]) => `${k}="${escapeAttr(v)}"`)
      .join(' ');
    return `<${tag} data-seo ${a} />`;
  });
  return [
    `<title>${escapeAttr(head.title)}</title>`,
    ...tags,
    `<script data-seo type="application/ld+json">${serializeJsonLd(head)}</script>`,
  ].join('\n    ');
};

// ─── Sitemap ──────────────────────────────────────────────────────────────────

const escapeXml = escapeAttr;

/** sitemap.xml with an hreflang alternate set (he, en, x-default) on every URL. */
export const buildSitemapXml = (site: string = getSiteUrl()): string => {
  const urls = PUBLIC_ROUTES.map((route) => {
    const match = matchPublicRoute(route.path)!;
    const head = buildSeoHead(match, site);
    const links = head.alternates
      .map((a) => `    <xhtml:link rel="alternate" hreflang="${a.hreflang}" href="${escapeXml(a.href)}"/>`)
      .join('\n');
    return `  <url>\n    <loc>${escapeXml(head.canonical)}</loc>\n    <lastmod>${route.lastmod}</lastmod>\n${links}\n  </url>`;
  });
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n' +
    urls.join('\n') +
    '\n</urlset>\n'
  );
};
