/**
 * /upgrade with charging switched off (the default: CHECKOUT_ENABLED unset).
 *
 * Every plan is listed with "Price on request" (no PLAN_PRICE_* in e2e), and
 * the page offers "Talk to us" on WhatsApp instead of any Pay button. The API
 * agrees: checkout answers 503.
 */
import { test, expect, prime } from './fixtures.mjs';

test('upgrade: checkout disabled → "Talk to us", no Pay button, prices on request', async ({ page, api }) => {
  const user = await api.signup();

  const refused = await api.call('POST', '/api/payments/checkout', {
    token: user.token,
    data: { plan: 'combo_3m', phone: '0501234567' }
  });
  expect(refused.status, JSON.stringify(refused.body)).toBe(503);
  expect(refused.body?.code).toBe('checkout_disabled');

  await prime(page, { lang: 'en', token: user.token });
  await page.goto('/upgrade?plan=yoni');

  await expect(page.getByRole('heading', { level: 1, name: 'Plans' })).toBeVisible();
  const talk = page.getByTestId('upgrade-talk-to-us');
  await expect(talk.getByRole('heading', { name: 'Online payment isn’t open yet' })).toBeVisible();
  await expect(talk.getByRole('link', { name: 'Talk to us on WhatsApp' })).toHaveAttribute('href', /^https:\/\/wa\.me\//);

  const plans = page.getByRole('region', { name: 'All plans' }).getByRole('listitem').filter({ has: page.getByRole('heading', { level: 3 }) });
  await expect(plans).toHaveCount(6);
  // The legacy ?plan=yoni link puts the combo first.
  await expect(plans.first().getByRole('heading', { level: 3 })).toHaveText('Full combo — 3 months');
  await expect(page.getByText('Price on request').first()).toBeVisible();
  await expect(page.getByRole('button', { name: /^Choose / })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Continue to secure payment' })).toHaveCount(0);
  await expect(page.getByText('You’re on the free plan.')).toBeVisible();

  // Hebrew, RTL.
  await page.getByRole('button', { name: 'Switch language' }).first().click();
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.getByRole('heading', { name: 'התשלום באתר עוד לא פתוח' })).toBeVisible();
});
