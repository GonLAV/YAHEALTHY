/**
 * Fast food logging: "log again" chip → Undo snackbar, catalog search with the
 * keyboard (listbox) → portion → log, same-as-yesterday meal copy, save a
 * meal / rename / one-tap log, calories-only quick add, recent searches.
 */
import { test, expect, prime } from './fixtures.mjs';

// The browser runs in Asia/Jerusalem (playwright.config.mjs); "today" is its day.
const TZ = 'Asia/Jerusalem';
const localDay = (offsetDays = 0) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(
    new Date(Date.now() + offsetDays * 86400000)
  );

test('food log: one-tap log again + undo, catalog search by keyboard, copy yesterday, saved meal, quick add', async ({ page, api }) => {
  const user = await api.signup();
  for (const d of [1, 2, 3]) {
    const res = await api.call('POST', '/api/food-logs', {
      token: user.token,
      data: { date: localDay(-d), name: 'Oatmeal', calories: 300, mealType: 'breakfast', quantity: 60, unit: 'g' }
    });
    expect(res.status).toBe(201);
  }
  await api.call('POST', '/api/food-logs', {
    token: user.token,
    data: { date: localDay(-1), name: 'Chickpea salad', calories: 350, mealType: 'lunch' }
  });

  await prime(page, { lang: 'en', token: user.token });
  await page.goto('/food-log');
  await expect(page.getByRole('heading', { level: 1, name: 'Food Log' })).toBeVisible();

  // ── log again (breakfast) → Undo ──
  const breakfastPill = page.getByRole('group', { name: 'Logging to' }).getByRole('button', { name: /Breakfast/ });
  await breakfastPill.click();
  await expect(breakfastPill).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Log Oatmeal again (300 kcal)' }).click();
  const snackbar = page.getByTestId('undo-snackbar');
  await expect(snackbar).toContainText('Logged Oatmeal');
  const breakfast = page.getByRole('region', { name: /^Breakfast/ });
  await expect(breakfast.getByRole('heading', { level: 4, name: 'Oatmeal' })).toBeVisible();
  await expect(breakfast.getByText('60 g')).toBeVisible();
  await snackbar.getByRole('button', { name: 'Undo' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText('Undone — removed from your log.')).toBeVisible();
  await expect(breakfast.getByRole('heading', { level: 4, name: 'Oatmeal' })).toHaveCount(0);

  // ── catalog search with the keyboard ──
  const search = page.getByRole('combobox', { name: 'Search foods' });
  await search.fill('tomato');
  const listbox = page.getByRole('listbox');
  await expect(listbox.getByRole('option').first()).toContainText('Tomatoes');
  await expect(listbox.getByRole('option').last()).toContainText('Quick add “tomato”');
  await search.press('ArrowDown');
  await expect(search).toHaveAttribute('aria-activedescendant', /.+/);
  await expect(listbox.getByRole('option', { selected: true })).toContainText('Tomatoes');
  await search.press('Enter');
  const amount = page.getByLabel('Amount (grams)');
  await amount.fill('200');
  // 18 kcal per 100 g (USDA fdcId 170457), computed by the backend.
  await expect(page.getByText('36 kcal', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /^Log Tomatoes/ }).click();
  await expect(snackbar).toContainText('Logged Tomatoes');
  await expect(breakfast.getByRole('heading', { level: 4, name: /^Tomatoes/ })).toBeVisible();

  // Recent searches appear in an empty box.
  await search.focus();
  await expect(page.getByRole('listbox', { name: 'Recent searches' }).getByRole('option', { name: 'tomato' })).toBeVisible();
  await search.press('Escape');

  // ── same as yesterday's lunch ──
  await page.getByRole('button', { name: 'Log the same Lunch as yesterday' }).click();
  const lunch = page.getByRole('region', { name: /^Lunch/ });
  await expect(lunch.getByRole('heading', { level: 4, name: 'Chickpea salad' })).toBeVisible();
  await expect(snackbar).toContainText('Logged Chickpea salad');

  // ── save lunch as a meal, rename, log in one tap ──
  await lunch.getByRole('button', { name: 'Save Lunch as a saved meal' }).click();
  await expect(page.getByText(/Saved “My Lunch”/)).toBeVisible();
  const saved = page.getByRole('region', { name: 'Favorites & saved meals' });
  await saved.getByRole('button', { name: 'Manage' }).click();
  await saved.getByRole('button', { name: 'Rename My Lunch' }).click();
  await saved.getByLabel('New name for My Lunch').fill('Work lunch');
  await saved.getByLabel('New name for My Lunch').press('Enter');
  await saved.getByRole('button', { name: 'Done' }).click();
  await page.getByRole('group', { name: 'Logging to' }).getByRole('button', { name: /Dinner/ }).click();
  await saved.getByRole('button', { name: 'Log Work lunch' }).click();
  const dinner = page.getByRole('region', { name: /^Dinner/ });
  await expect(dinner.getByRole('heading', { level: 4, name: 'Chickpea salad' })).toBeVisible();

  // ── favourite star on a logged item ──
  await lunch.getByRole('button', { name: 'Add Chickpea salad to favorites' }).click();
  await expect(lunch.getByRole('button', { name: 'Remove Chickpea salad from favorites' })).toHaveAttribute('aria-pressed', 'true');

  // ── quick add, calories only ──
  await page.getByRole('button', { name: 'Not in the database? Quick add (calories only)' }).click();
  await page.getByRole('button', { name: 'Log Food' }).click();
  await expect(page.getByRole('alert')).toHaveText('Please enter calories');
  await page.getByLabel('Calories').fill('120');
  await page.getByRole('button', { name: 'Log Food' }).click();
  await expect(snackbar).toContainText('Logged Quick add');
  await expect(dinner.getByRole('heading', { level: 4, name: 'Quick add' })).toBeVisible();

  // Everything landed on the user's today.
  const today = await api.call('GET', `/api/food-logs?date=${localDay(0)}`, { token: user.token });
  expect(today.body.map((l) => l.name).sort()).toEqual(['Chickpea salad', 'Chickpea salad', 'Quick add', 'Tomatoes, red, ripe, raw, year round average']);
});
