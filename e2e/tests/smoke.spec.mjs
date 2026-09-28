/**
 * Cross-feature smoke tests for the growth/engagement work: landing + leads,
 * referral attribution through signup and onboarding, Health Score and
 * streaks, invite link, share links (create, visit, revoke), staff gating and
 * the mobile "More" sheet.
 */
import { test, expect, prime, uniqueEmail, PASSWORD } from './fixtures.mjs';

test.describe('landing page', () => {
  for (const lang of ['en', 'he']) {
    test(`${lang}: renders and accepts a consented lead`, async ({ page }) => {
      await prime(page, { lang });
      await page.goto('/');
      const html = page.locator('html');
      await expect(html).toHaveAttribute('lang', lang);
      await expect(html).toHaveAttribute('dir', lang === 'he' ? 'rtl' : 'ltr');

      const submit = lang === 'he' ? 'עדכנו אותי' : 'Keep me posted';
      const success = lang === 'he' ? 'תודה! קיבלנו את הפרטים' : 'Thanks! We got your details';

      await page.locator('#lead-email').fill(uniqueEmail(`lead-${lang}`));
      await page.locator('#lead-name').fill(lang === 'he' ? 'דנה' : 'Dana');

      // Consent is required: submitting without it shows an alert, not a success.
      await page.getByRole('button', { name: submit }).click();
      await expect(page.locator('#lead-error[role="alert"]')).toBeVisible();

      await page.locator('#lead-consent').check();
      await page.getByRole('button', { name: submit }).click();
      await expect(page.getByRole('status').filter({ hasText: success })).toBeVisible();
      // The honeypot is never shown to people.
      await expect(page.locator('#lead-website')).not.toBeInViewport();
    });
  }
});

test('referral + utm on landing → signup → onboarding → dashboard Health Score, and the referrer is credited', async ({ page, api }) => {
  const referrer = await api.signup({ name: 'Dana Levi' });
  const before = await api.call('GET', '/api/referrals/me', { token: referrer.token });
  expect(before.status).toBe(200);
  const code = before.body.code;
  expect(before.body.invitedCount).toBe(0);

  await prime(page, { lang: 'en' });
  await page.goto(`/?ref=${code}&utm_source=e2e&utm_campaign=smoke`);
  // Client-side navigation from the landing page, like a visitor clicking "Sign up".
  await page.locator('a[href="/signup"]').first().click();
  await expect(page).toHaveURL(/\/signup$/);
  await expect(page.getByText('Dana invited you to YAHealthy')).toBeVisible();

  const email = uniqueEmail('referee');
  await page.locator('#signup-email').fill(email);
  await page.locator('#signup-password').fill(PASSWORD);
  await page.locator('#signup-confirm').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign Up' }).click();

  // Onboarding wizard
  await expect(page).toHaveURL(/\/onboarding$/);
  await page.getByLabel('Lose weight').check();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Skip this step' }).click(); // body
  await page.getByRole('button', { name: 'Skip this step' }).click(); // diet
  await page.getByRole('button', { name: 'Skip this step' }).click(); // targets
  await page.getByRole('button', { name: 'Skip this step' }).click(); // reminders (saves)
  await page.getByRole('button', { name: 'Log a glass of water (250 ml)' }).click();
  await expect(page.getByText('Nice! Your first glass is logged.')).toBeVisible();
  await page.getByRole('button', { name: 'Go to my dashboard' }).click();

  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole('heading', { name: 'Health Score' })).toBeVisible();
  // The first-win glass counts today: the any-log streak is running.
  await expect(page.getByText('Any log: 1-day streak, best 1')).toBeAttached();

  // Coming back to the app does not send a finished user to the wizard again.
  await page.goto('/achievements');
  await expect(page).toHaveURL(/\/achievements$/);

  const after = await api.call('GET', '/api/referrals/me', { token: referrer.token });
  expect(after.body.invitedCount).toBe(1);
});

test('a new account is sent to onboarding from any private page', async ({ page, api }) => {
  const fresh = await api.signup({ onboarded: false });
  await prime(page, { lang: 'en', token: fresh.token });
  for (const path of ['/', '/invite', '/achievements', '/admin/marketing']) {
    await page.goto(path);
    await expect(page, `from ${path}`).toHaveURL(/\/onboarding$/);
  }
});

test('log water → streak shows on the dashboard', async ({ page, api }) => {
  const user = await api.signup();
  await prime(page, { lang: 'en', token: user.token });
  await page.goto('/hydration');
  await page.getByRole('button', { name: /glass \(250ml\)/ }).click();
  await expect(page.getByText('0.25').first()).toBeVisible();

  await page.getByRole('link', { name: 'Dashboard' }).first().click();
  await expect(page.getByText('Any log: 1-day streak, best 1')).toBeAttached();
  await expect(page.getByText('Water goal: 0-day streak', { exact: false })).toBeAttached();
});

test('invite page: copy link puts the referral signup URL on the clipboard', async ({ page, context, api, baseURL }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: baseURL });
  const user = await api.signup({ name: 'Noa' });
  const { body } = await api.call('GET', '/api/referrals/me', { token: user.token });

  await prime(page, { lang: 'en', token: user.token });
  await page.goto('/invite');
  await expect(page.getByRole('textbox').first()).toHaveValue(body.shareUrl);
  expect(body.shareUrl).toBe(`${baseURL}/signup?ref=${body.code}`);

  await page.getByRole('button', { name: 'Copy link' }).click();
  await expect(page.getByText('Link copied to clipboard')).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(body.shareUrl);
});

test('share my week: create a link, visit /s/:token, sign up from it, revoke it', async ({ page, context, api, browser }) => {
  const owner = await api.signup({ name: 'Maya Cohen' });
  await prime(page, { lang: 'en', token: owner.token });
  await page.goto('/dashboard');

  await page.getByRole('button', { name: 'Share my week' }).click();
  const dialog = page.getByRole('dialog', { name: 'Share my week' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Create share link' }).click();
  await expect(dialog.getByText('Your share link is ready.')).toBeVisible();
  const url = await dialog.getByLabel('Your share link').inputValue();
  expect(url).toMatch(/\/s\/[A-Za-z0-9_-]{32}$/);

  // A stranger opens it: server-rendered page, OG tags, first name only, CTA with ref + utm.
  const visitor = await browser.newContext({ locale: 'en-US', timezoneId: 'Asia/Jerusalem' });
  const vpage = await visitor.newPage();
  const res = await vpage.goto(url);
  expect(res.status()).toBe(200);
  await expect(vpage).toHaveTitle(/Maya’s week on YAHealthy/);
  const html = await vpage.content();
  expect(html).not.toContain(owner.email);
  expect(html).not.toContain('Cohen');
  await expect(vpage.locator('meta[property="og:image"]')).toHaveAttribute('content', /\/s\/[A-Za-z0-9_-]{32}\/card\.(svg|png)$/);
  const cta = vpage.getByRole('link', { name: 'Start tracking free' });
  const href = await cta.getAttribute('href');
  expect(href).toMatch(/\/signup\?ref=[A-Z0-9]+&utm_source=share&utm_medium=weekly_card/);

  // Signing up from the card credits the owner.
  await vpage.evaluate(() => localStorage.setItem('yahealthy-lang', 'en'));
  await cta.click();
  await expect(vpage).toHaveURL(/\/signup\?ref=/);
  await vpage.locator('#signup-email').fill(uniqueEmail('from-card'));
  await vpage.locator('#signup-password').fill(PASSWORD);
  await vpage.locator('#signup-confirm').fill(PASSWORD);
  await vpage.getByRole('button', { name: 'Sign Up' }).click();
  await expect(vpage).toHaveURL(/\/onboarding$/);
  const refs = await api.call('GET', '/api/referrals/me', { token: owner.token });
  expect(refs.body.invitedCount).toBe(1);
  await visitor.close();

  // Revoke → the public page is gone.
  await dialog.getByRole('button', { name: 'Remove link' }).click();
  await expect(dialog.getByText('Link removed. It no longer works for anyone.')).toBeVisible();
  const gone = await context.request.get(url);
  expect(gone.status()).toBe(404);
  expect(await gone.text()).toContain('This share link has expired');

  // Escape closes the dialog and focus returns to the opener.
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('button', { name: 'Share my week' })).toBeFocused();
});

test('staff analytics is blocked for a non-staff user (UI and API)', async ({ page, api }) => {
  const user = await api.signup();
  await prime(page, { lang: 'en', token: user.token });
  await page.goto('/admin/marketing');
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole('link', { name: 'Marketing' })).toHaveCount(0);

  for (const route of ['/api/analytics/funnel', '/api/marketing/leads']) {
    const res = await api.call('GET', route, { token: user.token });
    expect(res.status, route).toBe(404);
  }
});

test.describe('mobile', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test('More sheet: keyboard open, focus trap, Escape returns focus (he, RTL)', async ({ page, api }) => {
    const user = await api.signup();
    await prime(page, { lang: 'he', token: user.token });
    await page.goto('/dashboard');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');

    const more = page.getByRole('button', { name: 'עוד' });
    await more.focus();
    await page.keyboard.press('Enter');
    const sheet = page.getByRole('dialog', { name: 'עוד' });
    await expect(sheet).toBeVisible();
    await expect(more).toHaveAttribute('aria-expanded', 'true');

    // Non-staff: invite + achievements are there, the staff page is not.
    await expect(sheet.getByRole('link', { name: 'הזמנת חברים' })).toBeVisible();
    await expect(sheet.getByRole('link', { name: 'הישגים' })).toBeVisible();
    await expect(sheet.getByRole('link', { name: 'שיווק' })).toHaveCount(0);

    // Focus is inside the sheet and Tab keeps it there.
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press('Tab');
      expect(await sheet.evaluate((el) => el.contains(document.activeElement))).toBe(true);
    }

    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();
    await expect(more).toBeFocused();
    await expect(more).toHaveAttribute('aria-expanded', 'false');

    // Navigating from the sheet closes it and lands on the page.
    await more.click();
    await page.getByRole('dialog', { name: 'עוד' }).getByRole('link', { name: 'הזמנת חברים' }).click();
    await expect(page).toHaveURL(/\/invite$/);
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });
});
