import { describe, expect, it } from 'vitest';
import { findGuideById, findGuideBySlug, guideSignupHref, guides, readingMinutes, type GuideLocale } from './guides';
import { LANGS } from '@/seo/site';

const allText = (loc: GuideLocale) =>
  [loc.title, loc.description, ...loc.body.flatMap((b) => (b.type === 'ul' ? b.items : [b.text]))].join('\n');

/**
 * Words the guides must never use (docs/product-truth.md §4–5): no "free"
 * offers, no promised results, no treatment/diagnosis/cure claims.
 */
const FORBIDDEN: Record<'he' | 'en', RegExp[]> = {
  en: [
    /\bfree\b/i,
    /guarantee/i,
    /\bcures?\b/i,
    /\btreat(s|ment|ing)?\b/i,
    /diagnos/i,
    /miracle/i,
    /detox/i,
    /burn(s|ing)? fat|fat[- ]burning/i,
    /lose \d+\s*(kg|kilos?|pounds|lbs)/i,
    /clinically proven|scientifically proven|\bproven to\b/i,
    /replaces? (your )?(doctor|dietitian)/i,
  ],
  he: [/חינם/, /מובטח/, /מבטיח/, /מרפא/, /ריפוי/, /טיפול/, /אבחון/, /אבחנה/, /ניקוי רעלים|דיטוקס/, /שריפת שומן/, /מוכח/, /פלא/],
};

describe('guides', () => {
  it('there is at least one guide and ids are unique', () => {
    expect(guides.length).toBeGreaterThan(0);
    const ids = guides.map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const g of guides) expect(findGuideById(g.id)).toBe(g);
  });

  it.each(LANGS)('every guide has a complete %s locale with a unique, URL-safe slug', (lang) => {
    const slugs = guides.map((g) => g.locales[lang]?.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const g of guides) {
      const loc = g.locales[lang];
      expect(loc, `${g.id}.${lang}`).toBeDefined();
      // Must match the route pattern in matchPublicRoute.
      expect(loc.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(loc.title.trim()).not.toBe('');
      expect(loc.description.trim().length).toBeGreaterThan(50);
      expect(loc.description.length).toBeLessThanOrEqual(220);
      expect(loc.body.length).toBeGreaterThan(2);
      for (const block of loc.body) {
        if (block.type === 'ul') {
          expect(block.items.length).toBeGreaterThan(0);
          for (const item of block.items) expect(item.trim()).not.toBe('');
        } else {
          expect(block.text.trim()).not.toBe('');
        }
      }
      expect(findGuideBySlug(lang, loc.slug)).toBe(g);
      expect(readingMinutes(loc)).toBeGreaterThanOrEqual(1);
    }
  });

  it('both languages have the same article structure', () => {
    for (const g of guides) {
      expect(g.locales.he.body.map((b) => b.type), g.id).toEqual(g.locales.en.body.map((b) => b.type));
    }
  });

  it('every article ends with the consult-a-professional note', () => {
    for (const g of guides) {
      const en = g.locales.en.body[g.locales.en.body.length - 1];
      const he = g.locales.he.body[g.locales.he.body.length - 1];
      expect(en.type, g.id).toBe('note');
      expect(he.type, g.id).toBe('note');
      expect(en.type === 'note' && en.text).toMatch(/not medical advice/);
      expect(en.type === 'note' && en.text).toMatch(/doctor|dietitian/);
      expect(he.type === 'note' && he.text).toMatch(/אינו ייעוץ רפואי/);
      expect(he.type === 'note' && he.text).toMatch(/רופא|דיאטנ/);
    }
  });

  it('dates are ISO and modified is not before published; related guides exist', () => {
    for (const g of guides) {
      expect(g.datePublished).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(g.dateModified).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(g.dateModified >= g.datePublished, g.id).toBe(true);
      for (const id of g.related) {
        expect(id, `${g.id} → ${id}`).not.toBe(g.id);
        expect(findGuideById(id), `${g.id} → ${id}`).toBeDefined();
      }
    }
  });

  it('signup links carry utm_source=seo, utm_medium=guide and utm_campaign=<slug>', () => {
    for (const g of guides) {
      for (const lang of LANGS) {
        const href = guideSignupHref(g, lang);
        const url = new URL(href, 'https://example.test');
        expect(url.pathname).toBe('/signup');
        expect(Object.fromEntries(url.searchParams)).toEqual({
          utm_source: 'seo',
          utm_medium: 'guide',
          utm_campaign: g.locales[lang].slug,
        });
      }
    }
  });

  it.each(LANGS)('the %s text avoids "free" offers and medical-claim wording', (lang) => {
    for (const g of guides) {
      const text = allText(g.locales[lang]);
      for (const pattern of FORBIDDEN[lang]) {
        expect(text, `${g.id}.${lang} matches ${pattern}`).not.toMatch(pattern);
      }
    }
  });
});
