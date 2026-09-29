import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { translations, type Lang } from './translations';
// The staff dashboard's and onboarding's strings load with those pages; merge
// them in so every check below covers the whole dictionary.
import './strings/staff';
import './strings/onboarding';
import './strings/errors';

const { en, he } = translations;
const LANGS: Lang[] = ['he', 'en'];

const placeholders = (s: string) => (s.match(/\{\w+\}/g) ?? []).slice().sort();

/** Every .ts/.tsx source file under src/, tests excluded. */
const sourceFiles = (() => {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) && !entry.name.endsWith('.d.ts')) out.push(p);
    }
  };
  walk(path.resolve(__dirname, '..'));
  return out.map((file) => ({ file: path.relative(process.cwd(), file), source: fs.readFileSync(file, 'utf8') }));
})();

describe('translations parity', () => {
  it('has a reasonable number of keys (guards against a broken import)', () => {
    expect(Object.keys(en).length).toBeGreaterThan(300);
  });

  it('every English key exists in Hebrew', () => {
    expect(Object.keys(en).filter((k) => !(k in he))).toEqual([]);
  });

  it('every Hebrew key exists in English', () => {
    expect(Object.keys(he).filter((k) => !(k in en))).toEqual([]);
  });

  it.each(LANGS)('no empty %s strings', (lang) => {
    const empty = Object.entries(translations[lang]).filter(([, v]) => typeof v !== 'string' || !v.trim());
    expect(empty.map(([k]) => k)).toEqual([]);
  });

  it('placeholders like {n} / {name} are identical in both languages', () => {
    const mismatched = Object.keys(en)
      .filter((k) => k in he && placeholders(en[k]).join() !== placeholders(he[k]).join())
      .map((k) => `${k}: en ${placeholders(en[k])} vs he ${placeholders(he[k])}`);
    expect(mismatched).toEqual([]);
  });

  it.each(LANGS)('no %s string repeats a placeholder (t() replaces only the first occurrence)', (lang) => {
    const repeated = Object.entries(translations[lang]).filter(([, v]) => new Set(placeholders(v)).size !== placeholders(v).length);
    expect(repeated.map(([k]) => k)).toEqual([]);
  });

  it('Hebrew strings are actually Hebrew and English strings contain no Hebrew', () => {
    const languageNeutral = new Set(['app.name', 'analytics.none', 'landing.footer.rights']);
    const hebrew = /[֐-׿]/;
    expect(Object.entries(he).filter(([k, v]) => !languageNeutral.has(k) && !hebrew.test(v)).map(([k]) => k)).toEqual([]);
    expect(Object.entries(en).filter(([, v]) => hebrew.test(v)).map(([k]) => k)).toEqual([]);
  });
});

describe('keys used in the source exist', () => {
  it('every literal t("…") key exists in translations.en', () => {
    const missing: string[] = [];
    let found = 0;
    for (const { file, source } of sourceFiles) {
      for (const m of source.matchAll(/\bt\(\s*(['"])([^'"\n]+)\1/g)) {
        found++;
        if (!(m[2] in en)) missing.push(`${file}: ${m[2]}`);
      }
    }
    expect(found).toBeGreaterThan(300);
    expect(missing).toEqual([]);
  });

  it('every template t(`prefix.${…}`) has at least one key with that prefix', () => {
    const missing: string[] = [];
    for (const { file, source } of sourceFiles) {
      for (const m of source.matchAll(/\bt\(\s*`([^`$]*)\$\{/g)) {
        if (!Object.keys(en).some((k) => k.startsWith(m[1]))) missing.push(`${file}: ${m[1]}…`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('t("key", { … }) passes exactly the placeholders the string uses', () => {
    const wrong: string[] = [];
    for (const { file, source } of sourceFiles) {
      // Only simple one-level param objects; nested braces are skipped.
      for (const m of source.matchAll(/\bt\(\s*'([^']+)'\s*,\s*\{([^{}]*)\}\s*\)/g)) {
        const given = [...m[2].matchAll(/(?:^|,)\s*(\w+)\s*(?=[:,]|$)/g)].map((x) => x[1]).sort();
        const wanted = [...new Set(placeholders(en[m[1]] ?? ''))].map((p) => p.slice(1, -1)).sort();
        if (given.join() !== wanted.join()) wrong.push(`${file}: ${m[1]} given {${given}} wants {${wanted}}`);
      }
      for (const m of source.matchAll(/\bt\(\s*'([^']+)'\s*\)/g)) {
        if (placeholders(en[m[1]] ?? '').length) wrong.push(`${file}: ${m[1]} used without params`);
      }
    }
    expect(wrong).toEqual([]);
  });

  /**
   * Keys built from a value at runtime. Mirrors the constant lists in the
   * pages (and the backend's onboarding safety flags); extend when adding one.
   */
  it.each([
    ['meal.', ['breakfast', 'lunch', 'dinner', 'snack']],
    ['sleep.quality.', ['excellent', 'good', 'fair', 'poor']],
    ['water.', ['morning', 'afternoon', 'evening']],
    ['eng.component.', ['nutrition', 'hydration', 'sleep', 'consistency']],
    ['coach.priority.', ['high', 'medium', 'low']],
    ['onb.goal.', ['lose_weight', 'maintain_weight', 'gain_weight', 'eat_healthier', 'sleep_better', 'more_energy']],
    ['onb.activity.', ['sedentary', 'light', 'moderate', 'active', 'very_active']],
    ['onb.diet.', ['vegetarian', 'vegan', 'kosher', 'gluten_free', 'lactose_free']],
    ['onb.stepName.', ['goal', 'body', 'diet', 'targets', 'reminders', 'firstWin']],
    ['onb.body.sex.', ['female', 'male']],
    ['onb.body.ageMode.', ['age', 'birthYear']],
    ['onb.reminders.', ['whatsapp', 'email', 'whatsapp.desc', 'email.desc']],
    ['onb.safety.', ['minor', 'below-safe-floor', 'bmi-low', 'bmi-high', 'target-bmi-low', 'lose-while-underweight']],
    ['landing.faq.', [1, 2, 3, 4, 5, 6].flatMap((n) => [`q${n}`, `a${n}`])],
    ['landing.pricing.app.', ['f1', 'f2', 'f3', 'f4']],
    ['landing.pricing.base.', ['f1', 'f2', 'f3']],
    ['landing.pricing.yoni.', ['f1', 'f2', 'f3']],
  ])('dynamic keys %s* exist', (prefix, suffixes) => {
    const missing = suffixes.map((s) => `${prefix}${s}`).filter((k) => !(k in en) || !(k in he));
    expect(missing).toEqual([]);
  });
});
