/**
 * AI Coach page: prioritized insight cards (reason + next step + CTA link)
 * above the chat, a chat answer that uses today's remaining calories and
 * never suggests a food matching the user's stated allergy, and Hebrew/RTL.
 *
 * One signup and one page load on purpose: /api/auth is rate limited
 * (50 per 15 min per IP) and the whole suite shares that budget.
 */
import { test, expect, prime } from './fixtures.mjs';

// The browser runs in Asia/Jerusalem (playwright.config.mjs); seed "today" there.
const localToday = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

test('coach: insight cards with reason, next step and CTA; allergy-safe dinner answer; Hebrew cards (RTL)', async ({ page, api }) => {
  const user = await api.signup();
  const prefs = await api.call('PUT', '/api/users/me/preferences', {
    token: user.token,
    data: { preferences: { macroTargets: { calorieOverride: 2000, protein_grams: 120 }, dietary: { vegan: true, allergies: 'peanuts' } } }
  });
  expect(prefs.status, JSON.stringify(prefs.body)).toBe(200);
  const log = await api.call('POST', '/api/food-logs', {
    token: user.token,
    data: { date: localToday(), name: 'Oats', mealType: 'breakfast', calories: 1200, proteinGrams: 40 }
  });
  expect(log.status, JSON.stringify(log.body)).toBe(201);

  await prime(page, { lang: 'en', token: user.token });
  await page.goto('/coaching');

  const list = page.getByRole('list', { name: 'Insights, most important first' });
  await expect(list).toBeVisible();
  const cards = list.getByRole('article');
  expect(await cards.count()).toBeGreaterThan(0);
  expect(await cards.count()).toBeLessThanOrEqual(4);
  const calories = list.getByRole('article', { name: 'Calories today' });
  await expect(calories.getByText('1,200 of your 2,000 kcal today', { exact: false })).toBeVisible();
  await expect(calories.getByText('Why:')).toBeVisible();
  await expect(calories.getByText('Next step:')).toBeVisible();
  await expect(calories.getByRole('link', { name: 'Open food log' })).toHaveAttribute('href', '/food-log');

  await page.getByPlaceholder('Ask me anything about your nutrition…').fill('what should I eat for dinner?');
  await page.getByRole('button', { name: 'Ask', exact: true }).click();
  const reply = page.getByText(/about 800 kcal and 80 g protein left today/);
  await expect(reply).toBeVisible();
  const text = await reply.innerText();
  expect(text).not.toMatch(/peanut sauce|chicken|salmon|beef|shrimp|egg|yogurt|cheese/i);

  // Language toggle refetches the cards in Hebrew.
  await page.getByRole('button', { name: 'Switch language' }).first().click();
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  const heList = page.getByRole('list', { name: 'תובנות, מהחשובה ביותר' });
  await expect(heList.getByRole('article', { name: 'קלוריות היום' })).toBeVisible();
  await expect(heList.getByText(/בעדיפות עליונה|שווה בדיקה|טוב לדעת/).first()).toBeVisible();

  // The CTA goes to the page the insight is about.
  await heList.getByRole('link', { name: 'ליומן המזון' }).first().click();
  await expect(page).toHaveURL(/\/food-log$/);
});
