/**
 * Automated accessibility audit: every route, Hebrew (RTL) and English, on a
 * desktop and a phone viewport.
 *
 * On each page (or open dialog) it asserts:
 *   - no axe-core violations of impact "serious" or "critical" against the
 *     WCAG 2.0/2.1 A + AA rule tags;
 *   - <html lang/dir> match the language;
 *   - exactly one <main> and exactly one <h1>;
 *   - the first Tab from the top of the page lands on a visible skip link
 *     with a visible focus indicator, and following it moves focus into <main>.
 *
 * Private pages are visited with client-side navigation inside one tab, as a
 * user moving through the nav would (and it keeps /api/auth/me, which counts
 * toward the per-IP auth rate limit, to one call per full load).
 */
import AxeBuilder from '@axe-core/playwright';
import { test, expect, prime, uniqueEmail, PASSWORD } from './fixtures.mjs';
import { translations } from '../../YAHEALTHYFrontend/src/i18n/translations.ts';
// onb.* strings live in their own module (registered when the wizard loads).
import { onboardingStrings } from '../../YAHEALTHYFrontend/src/i18n/strings/onboarding.ts';

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];
const BLOCKING_IMPACTS = new Set(['serious', 'critical']);

/**
 * True false positives only: { rule, selector, why }. A matching node is
 * dropped for that one rule; every other rule still runs on it.
 * (Empty: nothing needed an exemption.)
 */
const FALSE_POSITIVES = [];

const VIEWPORTS = {
  desktop: {},
  mobile: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }
};

const GUIDE_SLUG = 'how-much-water';

const PRIVATE_ROUTES = [
  '/dashboard',
  '/food-log',
  '/hydration',
  '/sleep',
  '/weight',
  '/coaching',
  '/progress',
  '/achievements',
  '/invite',
  '/upgrade',
  '/settings'
];

const t = (lang, key) => {
  const value = translations[lang][key] ?? onboardingStrings[lang][key];
  if (!value) throw new Error(`missing translation ${lang}:${key}`);
  return value;
};

// ─── helpers ────────────────────────────────────────────────────────────────

/** Wait until the app has no requests in flight for a short quiet period. */
function trackNetwork(page) {
  let inflight = 0;
  const done = () => {
    inflight = Math.max(0, inflight - 1);
  };
  page.on('request', (req) => {
    // Vite's HMR socket and long-lived dev requests never "finish".
    if (req.resourceType() === 'websocket' || req.resourceType() === 'eventsource') return;
    inflight++;
  });
  page.on('requestfinished', done);
  page.on('requestfailed', done);
  return async () => {
    let quietSince = Date.now();
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      if (inflight > 0) quietSince = Date.now();
      else if (Date.now() - quietSince >= 300) return;
      await page.waitForTimeout(50);
    }
  };
}

/** Client-side navigation, as a nav link click would do (no reload). */
async function spaGo(page, path) {
  await page.evaluate((p) => {
    window.history.pushState({}, '', p);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, path);
  await expect(page).toHaveURL(new RegExp(`${path.replace(/[/.?]/g, '\\$&')}(#.*)?$`));
}

function formatViolations(violations) {
  return violations
    .map((v) => {
      const nodes = v.nodes
        .slice(0, 6)
        .map((n) => `      - ${n.target.join(' ')}\n        ${String(n.failureSummary || '').replace(/\n/g, '\n        ')}`)
        .join('\n');
      return `  [${v.impact}] ${v.id}: ${v.help} (${v.nodes.length} node(s))\n${nodes}`;
    })
    .join('\n');
}

async function axeAudit(page, label, { include } = {}) {
  let builder = new AxeBuilder({ page }).withTags(WCAG_TAGS);
  if (include) builder = builder.include(include);
  const results = await builder.analyze();
  const blocking = [];
  for (const v of results.violations) {
    if (!BLOCKING_IMPACTS.has(v.impact)) continue;
    const nodes = v.nodes.filter(
      (n) => !FALSE_POSITIVES.some((fp) => fp.rule === v.id && n.target.join(' ').includes(fp.selector))
    );
    if (nodes.length) blocking.push({ ...v, nodes });
  }
  expect.soft(blocking, `axe violations on ${label}:\n${formatViolations(blocking)}`).toEqual([]);
}

async function checkStructure(page, label, lang) {
  const html = page.locator('html');
  await expect.soft(html, `${label}: html lang`).toHaveAttribute('lang', lang);
  await expect.soft(html, `${label}: html dir`).toHaveAttribute('dir', lang === 'he' ? 'rtl' : 'ltr');
  await expect.soft(page.locator('main'), `${label}: exactly one <main>`).toHaveCount(1);
  await expect.soft(page.locator('h1'), `${label}: exactly one <h1>`).toHaveCount(1);
}

/** First Tab → visible, focus-visible skip link; activating it moves focus into <main>. */
async function checkSkipLink(page, label, lang) {
  // Put the sequential-focus starting point at the very top of the document.
  await page.evaluate(() => {
    window.scrollTo(0, 0);
    document.body.setAttribute('tabindex', '-1');
    document.body.focus();
    document.body.removeAttribute('tabindex');
  });
  await page.keyboard.press('Tab');
  const first = await page.evaluate(() => {
    const el = document.activeElement;
    if (!el || el === document.body) return null;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return {
      tag: el.tagName,
      href: el.getAttribute('href'),
      text: (el.textContent || '').trim(),
      focusVisible: el.matches(':focus-visible'),
      indicator: (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0) || cs.boxShadow !== 'none',
      onScreen: r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < window.innerHeight
    };
  });
  expect.soft(first, `${label}: first Tab focuses something`).not.toBeNull();
  if (!first) return;
  expect.soft(first.text, `${label}: first Tab lands on the skip link`).toBe(t(lang, 'a11y.skipToContent'));
  expect.soft(first.href, `${label}: skip link targets an in-page anchor`).toMatch(/^#/);
  expect.soft(first.focusVisible, `${label}: skip link matches :focus-visible`).toBe(true);
  expect.soft(first.indicator, `${label}: skip link shows a focus indicator`).toBe(true);
  expect.soft(first.onScreen, `${label}: skip link is visible when focused`).toBe(true);

  // Only follow it if it really is the skip link (Enter on, say, a language
  // toggle would change the page under the rest of the run).
  if (first.text !== t(lang, 'a11y.skipToContent')) return;
  await page.keyboard.press('Enter');
  const inMainNow = await page.evaluate(() => document.querySelector('main')?.contains(document.activeElement) ?? false);
  if (!inMainNow) await page.keyboard.press('Tab');
  const inMain = await page.evaluate(() => document.querySelector('main')?.contains(document.activeElement) ?? false);
  expect.soft(inMain, `${label}: following the skip link moves focus into <main>`).toBe(true);
}

async function auditPage(page, label, lang, { skipLink = true } = {}) {
  await expect(page.locator('h1').first(), `${label}: page rendered`).toBeAttached();
  await checkStructure(page, label, lang);
  await axeAudit(page, label);
  if (skipLink) await checkSkipLink(page, label, lang);
}

// ─── one shared account ─────────────────────────────────────────────────────

/**
 * The whole file signs up ONE account and reuses its token everywhere. It is marked onboarded up front, so private
 * pages open directly; the wizard still renders every step for it (the same
 * path as "re-run onboarding" in Settings).
 */
let shared = null;
async function sharedUser(playwright) {
  if (shared) return shared;
  const ctx = await playwright.request.newContext({ baseURL: process.env.E2E_BASE_URL });
  const email = uniqueEmail('a11y');
  const res = await ctx.post('/api/auth/signup', { data: { email, password: PASSWORD, name: 'Maya Cohen' } });
  expect(res.status(), await res.text()).toBe(201);
  const { token } = await res.json();
  const headers = { Authorization: `Bearer ${token}` };
  expect((await ctx.post('/api/onboarding', { headers, data: {} })).status()).toBe(200);
  // Some data, so pages show their charts/lists instead of only empty states.
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date());
  for (const [route, data] of [
    ['/api/food-logs', { date: today, name: 'Shakshuka', mealType: 'breakfast', calories: 420, proteinGrams: 22, carbsGrams: 30, fatGrams: 24 }],
    ['/api/hydration-logs', { litersConsumed: 0.5, tz: 'Asia/Jerusalem' }],
    ['/api/sleep-logs', { sleepHours: 7.5, sleepQuality: 4, tz: 'Asia/Jerusalem' }]
  ]) {
    const r = await ctx.post(route, { headers, data });
    expect(r.status(), `${route} ${await r.text()}`).toBeLessThan(300);
  }
  await ctx.dispose();
  shared = { token };
  return shared;
}

// ─── the matrix ─────────────────────────────────────────────────────────────

for (const [vpName, vp] of Object.entries(VIEWPORTS)) {
  for (const lang of ['he', 'en']) {
    test.describe(`a11y ${lang} ${vpName}`, () => {
      // Audit the settled state, not a fade-in halfway through.
      test.use({ ...vp, reducedMotion: 'reduce', locale: lang === 'he' ? 'he-IL' : 'en-US' });

      test('public pages: landing, guides, login, signup', async ({ page }) => {
        const settle = trackNetwork(page);
        const prefix = lang === 'he' ? '' : '/en';
        await prime(page, { lang });
        for (const path of [prefix || '/', `${prefix}/guides`, `${prefix}/guides/${GUIDE_SLUG}`, '/login', '/signup']) {
          await page.goto(path);
          await settle();
          await auditPage(page, `${lang}/${vpName} ${path}`, lang);
          // The weight page has two states; the first run creates the goal
          // through the form, and every page after sees the goal + log form.
          if (path === '/weight' && (await page.locator('#weight-goal-start').count())) {
            await page.getByLabel(t(lang, 'weight.startWeight')).fill('72');
            await page.getByLabel(t(lang, 'weight.targetWeight')).fill('68');
            await page.getByRole('button', { name: t(lang, 'weight.createGoal') }).click();
            await settle();
            await auditPage(page, `${lang}/${vpName} /weight (with goal)`, lang, { skipLink: false });
          }
          if (path === '/weight') {
            await page.getByRole('button', { name: t(lang, 'weight.logWeight'), exact: true }).click();
            await expect(page.locator('#weight-log')).toBeVisible();
            await axeAudit(page, `${lang}/${vpName} /weight (log form open)`);
          }
        }
      });

      test('onboarding: every step', async ({ page, playwright }) => {
        const settle = trackNetwork(page);
        const user = await sharedUser(playwright);
        await prime(page, { lang, token: user.token });
        await page.goto('/onboarding');
        await settle();

        const steps = ['goal', 'body', 'diet', 'targets', 'reminders', 'firstWin'];
        for (const [i, step] of steps.entries()) {
          await expect(page.locator('#onb-progress-label')).toContainText(t(lang, `onb.stepName.${step}`));
          await settle();
          await auditPage(page, `${lang}/${vpName} /onboarding step ${i + 1} (${step})`, lang);
          if (step === 'goal') {
            await page.getByLabel(t(lang, 'onb.goal.lose_weight')).check();
            await page.getByRole('button', { name: t(lang, 'onb.next') }).click();
          } else if (step !== 'firstWin') {
            await page.getByRole('button', { name: t(lang, 'onb.skipStep') }).click();
          }
        }
        // First-win done state (status message + "Go to my dashboard").
        await page.getByRole('button', { name: t(lang, 'onb.win.logWater') }).click();
        await expect(page.getByText(t(lang, 'onb.win.done'))).toBeVisible();
        await settle();
        await auditPage(page, `${lang}/${vpName} /onboarding first win done`, lang, { skipLink: false });
      });

      test('private pages, share dialog, More sheet and the /s/:token page', async ({ page, browser, playwright }) => {
        const settle = trackNetwork(page);
        const user = await sharedUser(playwright);
        await prime(page, { lang, token: user.token });
        await page.goto('/dashboard');
        await settle();

        for (const path of PRIVATE_ROUTES) {
          if (path !== '/dashboard') await spaGo(page, path);
          await settle();
          await auditPage(page, `${lang}/${vpName} ${path}`, lang);
          // The weight page has two states; the first run creates the goal
          // through the form, and every page after sees the goal + log form.
          if (path === '/weight' && (await page.locator('#weight-goal-start').count())) {
            await page.getByLabel(t(lang, 'weight.startWeight')).fill('72');
            await page.getByLabel(t(lang, 'weight.targetWeight')).fill('68');
            await page.getByRole('button', { name: t(lang, 'weight.createGoal') }).click();
            await settle();
            await auditPage(page, `${lang}/${vpName} /weight (with goal)`, lang, { skipLink: false });
          }
          if (path === '/weight') {
            await page.getByRole('button', { name: t(lang, 'weight.logWeight'), exact: true }).click();
            await expect(page.locator('#weight-log')).toBeVisible();
            await axeAudit(page, `${lang}/${vpName} /weight (log form open)`);
          }
        }

        // Share-my-week dialog: open, then with a link created.
        await spaGo(page, '/dashboard');
        await settle();
        await page.getByRole('button', { name: t(lang, 'share.button') }).click();
        const dialog = page.getByRole('dialog', { name: t(lang, 'share.button') });
        await expect(dialog).toBeVisible();
        await settle();
        await axeAudit(page, `${lang}/${vpName} share dialog (open)`);
        await checkStructure(page, `${lang}/${vpName} share dialog (open)`, lang);
        await dialog.getByRole('button', { name: t(lang, 'share.createLink') }).click();
        const urlField = dialog.getByLabel(t(lang, 'share.linkLabel'));
        await expect(urlField).toBeVisible();
        await settle();
        await axeAudit(page, `${lang}/${vpName} share dialog (link ready)`);
        const shareUrl = await urlField.inputValue();
        await page.keyboard.press('Escape');
        await expect(dialog).toBeHidden();

        // Mobile "More" sheet (the bottom nav only exists below md).
        if (vpName === 'mobile') {
          await page.getByRole('button', { name: t(lang, 'nav.more'), exact: true }).click();
          const sheet = page.getByRole('dialog', { name: t(lang, 'nav.moreTitle') });
          await expect(sheet).toBeVisible();
          await settle();
          await axeAudit(page, `${lang}/${vpName} More sheet`);
          await checkStructure(page, `${lang}/${vpName} More sheet`, lang);
          await page.keyboard.press('Escape');
          await expect(sheet).toBeHidden();
        }

        // The public, server-rendered share page, as a stranger sees it.
        const visitor = await browser.newContext({
          ...vp,
          reducedMotion: 'reduce',
          locale: lang === 'he' ? 'he-IL' : 'en-US'
        });
        const vpage = await visitor.newPage();
        const res = await vpage.goto(shareUrl);
        expect(res.status()).toBe(200);
        // A single-link page with no repeated blocks to bypass (WCAG 2.4.1), so
        // no skip link; everything else is checked.
        await auditPage(vpage, `${lang}/${vpName} /s/:token`, lang, { skipLink: false });
        await visitor.close();
      });
    });
  }
}

test('a11y: touch targets in the mobile bottom nav are at least 44×44 px', async ({ page, playwright }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  const user = await sharedUser(playwright);
  await prime(page, { lang: 'he', token: user.token });
  await page.goto('/dashboard');
  const nav = page.getByRole('navigation', { name: t('he', 'a11y.mobileNav') });
  await expect(nav).toBeVisible();
  const boxes = await nav.locator('a, button').evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect();
      return { name: (el.textContent || '').trim(), w: Math.round(r.width), h: Math.round(r.height) };
    })
  );
  expect(boxes.length).toBe(5);
  for (const b of boxes) {
    expect.soft(b.w, `${b.name} width`).toBeGreaterThanOrEqual(44);
    expect.soft(b.h, `${b.name} height`).toBeGreaterThanOrEqual(44);
  }
});

