import { describe, expect, it } from 'vitest';
import { translations } from './translations';

/**
 * A key missing in one language does not fail loudly: t() falls back to the
 * English string, then to the key itself. So a Hebrew reader meets an English
 * sentence, or "password.reset.hint", in the middle of an RTL page. These
 * checks turn that into a failing test that names the keys.
 */

const { en, he } = translations;
const params = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('translations', () => {
  it('has exactly the same keys in English and Hebrew', () => {
    const missing = {
      missingInHe: Object.keys(en).filter((k) => !(k in he)),
      missingInEn: Object.keys(he).filter((k) => !(k in en)),
    };
    expect(missing).toEqual({ missingInHe: [], missingInEn: [] });
  });

  it('has no empty strings', () => {
    const empty = {
      en: Object.keys(en).filter((k) => !en[k].trim()),
      he: Object.keys(he).filter((k) => !he[k].trim()),
    };
    expect(empty).toEqual({ en: [], he: [] });
  });

  // t('password.reset.hint', { n: 10 }) fills {n}. A Hebrew string that drops
  // the placeholder shows no number; one that renames it shows "{x}" verbatim.
  it('uses the same {placeholders} in both languages', () => {
    const mismatched = Object.keys(en)
      .filter((k) => k in he && params(en[k]).join() !== params(he[k]).join())
      .map((k) => `${k}: en {${params(en[k]).join(', ')}} / he {${params(he[k]).join(', ')}}`);
    expect(mismatched).toEqual([]);
  });

  // Every literal key the source passes to t() has to exist, or the user sees
  // the key. Keys built at runtime (t(`meal.${m}`)) cannot be checked this way.
  it('defines every key the source asks for by name', () => {
    const sources = import.meta.glob(['/src/**/*.{ts,tsx}', '!/src/**/*.test.{ts,tsx}', '!/src/test/**'], {
      query: '?raw',
      import: 'default',
      eager: true,
    }) as Record<string, string>;
    const undefinedKeys: string[] = [];
    for (const [file, text] of Object.entries(sources)) {
      for (const [, key] of text.matchAll(/\bt\(\s*'([\w.-]+)'/g)) {
        if (!(key in en)) undefinedKeys.push(`${file}: ${key}`);
      }
    }
    expect(Object.keys(sources).length).toBeGreaterThan(20);
    expect(undefinedKeys).toEqual([]);
  });
});
