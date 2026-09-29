/**
 * Weekly meal planner (/meal-plan): generate a week sized to the user's
 * targets, respecting diet + allergy; lock, swap, regenerate (locked meal
 * stays); shopping list ticks persist across reload; WhatsApp share link.
 * Mobile + Hebrew: day tabs, RTL, the planner is in the More sheet.
 */
import { test, expect, prime } from './fixtures.mjs';

const PREFS = {
  macroTargets: { calorieOverride: 2000, protein_grams: 110 },
  dietary: { vegetarian: true, allergies: 'peanuts' }
};

test('meal planner: generate, lock, swap, regenerate keeps the lock, shopping list ticks persist (en, desktop)', async ({ page, api }) => {
  const user = await api.signup();
  const prefs = await api.call('PUT', '/api/users/me/preferences', { token: user.token, data: { preferences: PREFS } });
  expect(prefs.status).toBe(200);

  await prime(page, { lang: 'en', token: user.token });
  await page.goto('/dashboard');
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Meal Plan' }).click();
  await expect(page).toHaveURL(/\/meal-plan$/);
  await expect(page.getByRole('heading', { name: 'Weekly meal plan' })).toBeVisible();

  await page.getByRole('button', { name: 'Plan my week' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Your week is planned.' })).toBeVisible();
  await expect(page.getByText('Daily target: 2,000 kcal · 110 g protein')).toBeVisible();

  // Vegetarian + peanut allergy: nothing from the excluded groups anywhere on the plan.
  const panel = page.getByRole('tabpanel', { name: 'Meals' });
  const text = await panel.innerText();
  expect(text).not.toMatch(/peanut|chicken|turkey|beef|salmon|tuna|tilapia|shrimp/i);
  // Every day shows its calories against the target.
  await expect(panel.locator('p:visible', { hasText: /of 2,000 kcal/ })).toHaveCount(7);

  // Lock Sunday's dinner.
  const lockBtn = page.getByRole('button', { name: /^Lock .+ \(Sunday, Dinner\)$/ });
  const lockedName = (await lockBtn.getAttribute('aria-label')).replace(/^Lock (.+) \(Sunday, Dinner\)$/, '$1');
  await lockBtn.click();
  const unlockBtn = page.getByRole('button', { name: `Unlock ${lockedName} (Sunday, Dinner)` });
  await expect(unlockBtn).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: `Swap ${lockedName} (Sunday, Dinner)` })).toBeDisabled();

  // Swap Monday's lunch for something else.
  const swapBtn = page.getByRole('button', { name: /^Swap .+ \(Monday, Lunch\)$/ });
  const before = await swapBtn.getAttribute('aria-label');
  await swapBtn.click();
  await expect(page.getByRole('status').filter({ hasText: 'Meal swapped' })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Swap .+ \(Monday, Lunch\)$/ })).not.toHaveAttribute('aria-label', before);

  // A new plan keeps the locked dinner.
  await page.getByRole('button', { name: 'New plan (keeps locked meals)' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Your week is planned.' })).toBeVisible();
  await expect(page.getByRole('button', { name: `Unlock ${lockedName} (Sunday, Dinner)` })).toBeVisible();

  // Shopping list: tick an item, reload, it is still ticked.
  await page.getByRole('tab', { name: 'Shopping list' }).click();
  const shopping = page.getByRole('tabpanel', { name: 'Shopping list' });
  await expect(shopping.getByRole('heading', { name: 'Fruit & vegetables' })).toBeVisible();
  const first = shopping.getByRole('checkbox').first();
  const saved = page.waitForResponse((r) => r.url().includes('/shopping-list') && r.request().method() === 'PUT');
  await first.check();
  expect((await saved).status()).toBe(200);
  await expect(shopping.getByText(/^1 of \d+ in the cart$/)).toBeVisible();
  const wa = shopping.getByRole('link', { name: 'Share on WhatsApp' });
  await expect(wa).toHaveAttribute('href', /^https:\/\/wa\.me\/\?text=Shopping%20list/);
  expect(await shopping.innerText()).not.toMatch(/peanut/i);

  await page.reload();
  await page.getByRole('tab', { name: 'Shopping list' }).click();
  await expect(page.getByRole('tabpanel', { name: 'Shopping list' }).getByRole('checkbox').first()).toBeChecked();
  await expect(page.getByText(/^1 of \d+ in the cart$/)).toBeVisible();
});

test.describe('mobile', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test('meal planner (he, RTL): in the More sheet, day tabs switch days, swap has a Hebrew accessible name', async ({ page, api }) => {
    const user = await api.signup();
    await api.call('PUT', '/api/users/me/preferences', { token: user.token, data: { preferences: PREFS } });
    await prime(page, { lang: 'he', token: user.token });
    await page.goto('/dashboard');
    await page.getByRole('button', { name: 'עוד' }).click();
    await page.getByRole('dialog', { name: 'עוד' }).getByRole('link', { name: 'תפריט שבועי' }).click();
    await expect(page).toHaveURL(/\/meal-plan$/);
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');

    await page.getByRole('button', { name: 'לתכנן את השבוע' }).click();
    const days = page.getByRole('tablist', { name: 'ימי השבוע' });
    await expect(days.getByRole('tab')).toHaveCount(7);
    await days.getByRole('tab').nth(2).click();
    await expect(days.getByRole('tab').nth(2)).toHaveAttribute('aria-selected', 'true');
    const panel = page.locator('#mp-daypanel');
    await expect(panel.getByRole('heading', { level: 3 }).first()).toHaveText('יום שלישי');
    await expect(panel.getByRole('button', { name: /^החלפת .+ \(יום שלישי, ארוחת ערב\)$/ })).toBeVisible();
    await expect(panel.getByText(/מתוך 2,000 קק"ל/)).toBeVisible();
  });
});
