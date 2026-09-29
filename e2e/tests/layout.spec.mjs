/**
 * Layout guards from the visual QA pass (e2e/scripts/screenshots.mjs):
 *  - no page scrolls sideways on a 390px phone, in Hebrew (RTL) or English;
 *  - the mobile More sheet is not covered by the floating WhatsApp button;
 *  - the dashboard / weight numbers reflect the logs (they used to show 0 kcal
 *    and the oldest weigh-in as "current").
 * One signup for the whole file (the auth limiter is shared by the suite).
 *
 * The viewport is 390px *without* mobile emulation: with isMobile the layout
 * viewport silently widens to fit overflowing content, hiding the bug.
 */
import { test, expect, prime } from './fixtures.mjs';

const WIDTH = 390;
const PRIVATE = ['/dashboard', '/food-log', '/hydration', '/sleep', '/weight', '/coaching', '/progress', '/achievements', '/invite', '/settings'];
const PUBLIC = ['/', '/en', '/guides', '/en/guides/how-much-water', '/login', '/signup'];

test.use({ viewport: { width: WIDTH, height: 844 } });

async function expectNoSideScroll(page, label) {
  try {
    await page.waitForLoadState('networkidle', { timeout: 5000 });
  } catch {
    /* a poll kept the network busy; measure anyway */
  }
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(width, `${label} scrolls sideways (${width}px wide)`).toBeLessThanOrEqual(WIDTH);
}

async function setLang(page, lang) {
  await page.evaluate((l) => localStorage.setItem('yahealthy-lang', l), lang);
}

test('public pages do not scroll sideways at 390px (he + en)', async ({ page }) => {
  for (const lang of ['he', 'en']) {
    await prime(page, { lang });
    for (const path of PUBLIC) {
      await page.goto(path);
      await expect(page.locator('h1').first()).toBeVisible();
      await expectNoSideScroll(page, `${lang} ${path}`);
    }
  }
});

test('app pages with data do not scroll sideways at 390px; numbers match the logs; More sheet is on top', async ({ page, api }) => {
  const user = await api.signup({ name: 'Noa' });
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date());
  const log = (route, data) => api.call('POST', route, { token: user.token, data });
  // Long names in both scripts: they must wrap, not push the calories off-screen.
  for (const [name, mealType, calories] of [
    ['שקשוקה עם לחם מחמצת וסלט ישראלי קצוץ ועוד תוספות', 'breakfast', 520],
    ['Grilled chicken breast with quinoa, roasted vegetables and tahini', 'lunch', 640],
  ]) {
    expect((await log('/api/food-logs', { date: today, name, mealType, calories, proteinGrams: 30, carbsGrams: 40, fatGrams: 20 })).status).toBe(201);
  }
  expect((await log('/api/hydration-logs', { date: today, litersConsumed: 0.25 })).status).toBe(201);
  expect((await log('/api/sleep-logs', { date: today, sleepHours: 7.5, sleepQuality: 'good' })).status).toBe(201);
  const goal = await log('/api/weight-goals', { startWeightKg: 80, targetWeightKg: 75 });
  for (const weightKg of [80, 79.2]) expect((await log('/api/weight-logs', { goalId: goal.body.id, weightKg })).status).toBe(201);

  await prime(page, { lang: 'he', token: user.token });
  for (const lang of ['he', 'en']) {
    if (lang === 'en') await setLang(page, 'en');
    for (const path of PRIVATE) {
      await page.goto(path);
      await expect(page.locator('main h1').first()).toBeVisible();
      await expectNoSideScroll(page, `${lang} ${path}`);
    }
  }

  // English from here on. Today's calories and macros come from today's meals.
  await page.goto('/dashboard');
  await expect(page.getByText('1160', { exact: true })).toBeVisible();
  await expect(page.getByText('Protein')).toBeVisible();
  // The latest weigh-in is "current", and the history lists it first.
  await page.goto('/weight');
  await expect(page.getByText('Current').locator('..')).toContainText('79.2');

  // The More sheet sits above the floating WhatsApp button.
  await page.goto('/dashboard');
  await page.getByRole('button', { name: 'More', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: 'More' });
  await expect(sheet).toBeVisible();
  // Where the floating button sits, the sheet must be what is on top.
  const fab = await page.locator('a[href^="https://wa.me/"]').boundingBox();
  const onTop = await page.evaluate(
    ([x, y]) => !!document.elementFromPoint(x, y)?.closest('[role="dialog"]'),
    [fab.x + fab.width / 2, fab.y + fab.height / 2],
  );
  expect(onTop, 'the WhatsApp button covers the More sheet').toBe(true);
});

test('staff page: the retention table scrolls inside its card, not the page (he, 390px)', async ({ page, api }) => {
  const user = await api.signup();
  await prime(page, { lang: 'he', token: user.token });
  await page.route('**/api/auth/me', async (route) => {
    const res = await route.fetch();
    await route.fulfill({ response: res, json: { ...(await res.json()), isStaff: true } });
  });
  const cells = Array.from({ length: 8 }, (_, week) => ({ week, active: 0, eligible: 0, rate: week === 0 ? 1 : null }));
  await page.route('**/api/analytics/retention*', (route) =>
    route.fulfill({
      json: {
        range: { from: '2026-08-31', to: '2026-09-29', days: 30 },
        generatedAt: new Date().toISOString(),
        weeks: 8,
        cohorts: [{ cohortStart: '2026-09-28', size: 2, cells }],
        overall: cells,
      },
    }),
  );
  await page.goto('/admin/marketing');
  await expect(page.getByRole('table').filter({ has: page.locator('caption') }).first()).toBeVisible();
  await expect(page.getByText('טרם הסתיים').first()).toBeAttached();
  await expectNoSideScroll(page, 'he /admin/marketing');
});
