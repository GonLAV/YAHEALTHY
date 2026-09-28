/**
 * The unified /settings page: messaging preferences persist across a reload,
 * the old /reminders route (and push notification links) lands on the
 * reminders section, password change, the nav entry, and the staff
 * lifecycle-campaigns table.
 */
import { test, expect, prime, PASSWORD } from './fixtures.mjs';

test('settings: marketing consent is opt-in, a toggle persists across reload, consent time shown', async ({ page, api }) => {
  const user = await api.signup();
  await prime(page, { lang: 'en', token: user.token });
  await page.goto('/settings');

  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
  const messages = page.getByRole('region', { name: 'Notifications — email & WhatsApp' });
  await expect(messages).toBeVisible();
  for (const name of ['Notifications — push reminders', 'Profile & targets', 'Language', 'Account']) {
    await expect(page.getByRole('region', { name })).toBeVisible();
  }

  const marketing = messages.getByRole('checkbox', { name: 'Offers and news by email (advertising)' });
  // Opt-in: off until the person turns it on.
  await expect(marketing).not.toBeChecked();
  await expect(messages.getByText('You have not agreed to receive advertising emails.')).toBeVisible();
  await expect(messages.getByRole('checkbox', { name: 'Tips and progress emails' })).toBeChecked();

  // click + assertion rather than check(): the box is controlled and saves
  // straight away, so its state settles a tick after the click.
  await marketing.click();
  await expect(marketing).toBeChecked();
  await expect(messages.getByRole('status')).toHaveText('Saved.');
  await expect(messages.getByText(/^You agreed on /)).toBeVisible();

  await page.reload();
  const again = page.getByRole('region', { name: 'Notifications — email & WhatsApp' });
  await expect(again.getByRole('checkbox', { name: 'Offers and news by email (advertising)' })).toBeChecked();
  await expect(again.getByText(/^You agreed on /)).toBeVisible();

  const prefs = await api.call('GET', '/api/marketing/preferences', { token: user.token });
  expect(prefs.body.preferences.marketing_email).toBe(true);
  expect(prefs.body.preferences.marketing_consent_at).toBeTruthy();

  // Withdrawing clears the recorded consent.
  await again.getByRole('checkbox', { name: 'Offers and news by email (advertising)' }).click();
  await expect(again.getByRole('checkbox', { name: 'Offers and news by email (advertising)' })).not.toBeChecked();
  await expect(again.getByRole('status')).toHaveText('Saved.');
  await expect(again.getByText('You have not agreed to receive advertising emails.')).toBeVisible();
  const after = await api.call('GET', '/api/marketing/preferences', { token: user.token });
  expect(after.body.preferences.marketing_consent_at).toBeNull();
});

test('/reminders redirects to the reminders section of settings, and the nav links to settings', async ({ page, api }) => {
  const user = await api.signup();
  await prime(page, { lang: 'en', token: user.token });
  await page.goto('/reminders');
  await expect(page).toHaveURL(/\/settings#reminders$/);
  const reminders = page.getByRole('region', { name: 'Notifications — push reminders' });
  await expect(reminders).toBeFocused();
  await expect(reminders.getByRole('checkbox', { name: 'Push reminders' })).toBeVisible();

  const nav = page.getByRole('navigation', { name: 'Main navigation' });
  const link = nav.getByRole('link', { name: 'Settings' });
  await expect(link).toHaveAttribute('aria-current', 'page');
});

test('settings: profile shows targets and links to onboarding; password change validates and works (he)', async ({ page, api }) => {
  const user = await api.signup();
  await prime(page, { lang: 'he', token: user.token });
  await page.goto('/settings#account');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');

  const profile = page.getByRole('region', { name: 'פרופיל ויעדים' });
  await expect(profile.getByText('היעדים היומיים הנוכחיים')).toBeVisible();
  await expect(profile.getByRole('link', { name: 'עדכון המטרה והיעדים' })).toHaveAttribute('href', '/onboarding');

  const account = page.getByRole('region', { name: 'חשבון' });
  await expect(account).toBeFocused();
  await account.getByLabel('הסיסמה הנוכחית').fill('not the password at all');
  await account.getByLabel('סיסמה חדשה').fill('a brand new passphrase');
  await account.getByLabel('אימות הסיסמה החדשה').fill('a brand new passphrase');
  await account.getByRole('button', { name: 'שינוי סיסמה' }).click();
  await expect(account.getByRole('alert')).toHaveText('הסיסמה הנוכחית שגויה.');
  // A wrong password is not a sign-out.
  await expect(page).toHaveURL(/\/settings/);

  await account.getByLabel('הסיסמה הנוכחית').fill(PASSWORD);
  await account.getByRole('button', { name: 'שינוי סיסמה' }).click();
  await expect(account.getByRole('status')).toHaveText('הסיסמה שונתה. שאר המכשירים שלכם נותקו.');

  // This session continues on the fresh token; the old one is dead.
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'הגדרות' })).toBeVisible();
  const old = await api.call('GET', '/api/auth/me', { token: user.token });
  expect(old.status).toBe(401);
  const login = await api.call('POST', '/api/auth/login', { data: { email: user.email, password: 'a brand new passphrase' } });
  expect(login.status).toBe(200);

  // A finished user can go through the wizard again from here.
  await page.getByRole('region', { name: 'פרופיל ויעדים' }).getByRole('link', { name: 'עדכון המטרה והיעדים' }).click();
  await expect(page).toHaveURL(/\/onboarding$/);
});

test('staff page: lifecycle campaigns table (UI, stats mocked)', async ({ page, api }) => {
  const user = await api.signup();
  await prime(page, { lang: 'en', token: user.token });
  // There is no way to mint a staff user from the outside; the server still
  // refuses the real endpoints (see smoke.spec). This checks the rendering.
  await page.route('**/api/auth/me', async (route) => {
    const res = await route.fetch();
    await route.fulfill({ response: res, json: { ...(await res.json()), isStaff: true } });
  });
  await page.route('**/api/marketing/campaigns/stats', (route) =>
    route.fulfill({
      json: {
        campaigns: {
          lead_nurture: {
            campaign: 'lead_nurture', marketing: true, sent: 3, failed: 1, pending: 0, opened: null, converted: 1,
            conversionRate: 0.333, byChannel: { email: 3, whatsapp: 0 },
            byStep: { day2: { sent: 1, failed: 0, pending: 0, converted: 0 }, welcome: { sent: 2, failed: 1, pending: 0, converted: 1 } }
          },
          win_back: {
            campaign: 'win_back', marketing: true, sent: 0, failed: 0, pending: 0, opened: null, converted: 0,
            conversionRate: null, byChannel: { email: 0, whatsapp: 0 }, byStep: {}
          }
        }
      }
    })
  );
  await page.goto('/admin/marketing');
  const table = page.getByRole('table', { name: /Automated email and WhatsApp messages/ });
  await expect(table).toBeVisible();
  await expect(table.getByRole('columnheader')).toHaveText(['Campaign / step', 'Sent', 'Failed', 'Pending', 'Converted', 'Conversion']);
  await expect(table.getByRole('columnheader', { name: /open/i })).toHaveCount(0);
  const welcome = table.getByRole('row', { name: /Lead nurture — Step welcome/ });
  await expect(welcome.getByRole('cell')).toHaveText(['2', '1', '0', '1', '50%']);
  // Steps follow send order, not arrival order.
  const rowHeaders = await table.getByRole('rowheader').allInnerTexts();
  expect(rowHeaders.findIndex((t) => t.includes('welcome'))).toBeLessThan(rowHeaders.findIndex((t) => t.includes('day2')));
});
