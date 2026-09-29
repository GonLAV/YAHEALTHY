/**
 * Settings → WhatsApp: get a one-time code, "send" it to the bot from a phone
 * (a WHAPI webhook delivery), watch the page flip to connected, then
 * disconnect. A phone number on its own never links — only the code does.
 * (WHAPI_TOKEN is unset in e2e, so the bot's reply send fails; the link is
 * made before that, which is what this checks.)
 */
import { test, expect, prime } from './fixtures.mjs';

test('settings: connect WhatsApp with a one-time code, then disconnect', async ({ page, api }) => {
  const user = await api.signup();
  await prime(page, { lang: 'en', token: user.token });
  await page.goto('/settings#whatsapp');

  const section = page.getByRole('region', { name: 'WhatsApp' });
  await expect(section).toBeVisible();
  await expect(section.getByText('WhatsApp is not connected.')).toBeVisible();

  await section.getByRole('button', { name: 'Connect WhatsApp' }).click();
  const codeEl = section.getByTestId('whatsapp-code');
  await expect(codeEl).toHaveText(/^YH-[A-Z0-9]{6}$/);
  await expect(codeEl).toBeFocused();
  await expect(section.getByText(/^Expires in \d+:\d{2}$/)).toBeVisible();
  const code = (await codeEl.textContent()).trim();

  // The code arrives from the phone.
  const phone = `97252${String(Date.now()).slice(-7)}`;
  const hook = await api.call('POST', '/api/whapi/messages', {
    data: {
      messages: [
        {
          id: `wamid.e2e.${Date.now()}`,
          from_me: false,
          type: 'text',
          chat_id: `${phone}@s.whatsapp.net`,
          from: phone,
          text: { body: `Connect my food log: ${code}` }
        }
      ]
    }
  });
  expect(hook.status).toBe(200);

  // The page polls; "I sent it" checks at once.
  await expect(async () => {
    await section.getByRole('button', { name: 'I sent it' }).click({ timeout: 1000 }).catch(() => undefined);
    await expect(section.getByTestId('whatsapp-linked')).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 15000 });
  await expect(section.getByText(`052-***-${phone.slice(-4)}`)).toBeVisible();
  await expect(section.getByRole('status')).toHaveText('WhatsApp connected.');

  // Survives a reload (server state, not page state).
  await page.reload();
  const again = page.getByRole('region', { name: 'WhatsApp' });
  await expect(again.getByTestId('whatsapp-linked')).toBeVisible();

  await again.getByRole('button', { name: 'Disconnect' }).click();
  await expect(again.getByText('WhatsApp is not connected.')).toBeVisible();
  await expect(again.getByRole('status')).toHaveText('WhatsApp disconnected.');
  const status = await api.call('GET', '/api/whatsapp/link', { token: user.token });
  expect(status.body.linked).toBe(false);
});

test('settings (he): the WhatsApp section is RTL and in Hebrew', async ({ page, api }) => {
  const user = await api.signup();
  await prime(page, { lang: 'he', token: user.token });
  await page.goto('/settings#whatsapp');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  const section = page.getByRole('region', { name: 'וואטסאפ' });
  await expect(section.getByRole('button', { name: 'חיבור וואטסאפ' })).toBeVisible();
});
