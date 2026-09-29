import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ForgotPasswordPage, ResetPasswordPage } from './PasswordPages';
import { authApi } from '@/services/api';
import { copy, httpError, renderInApp } from '@/test/render';

vi.mock('@/services/api', () => ({ authApi: { resetPassword: vi.fn(), requestPasswordReset: vi.fn() } }));
const resetPassword = vi.mocked(authApi.resetPassword);
const requestPasswordReset = vi.mocked(authApi.requestPasswordReset);
const answered = (data: unknown) => ({ data }) as never;

/** A token shaped like the server's (utils/auth.js), unsigned: the page only reads it. */
const tokenFor = (email: string) => {
  const b64url = (s: string) => btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const payload = { userId: '7f3c9a2e-5b1d-4e8a-9c6f-2d4b8e1a0f37', email, purpose: 'password_reset', tv: 0, iat: 1790000000, exp: 1790003600 };
  return [b64url('{"alg":"HS256","typ":"JWT"}'), b64url(JSON.stringify(payload)), 'signature'].join('.');
};
// "~" in the address puts a "-" in the payload, so decoding has to undo the
// URL-safe alphabet; plain atob() on it throws.
const EMAIL = 'dana~levi@example.com';
const TOKEN = tokenFor(EMAIL);

/** The server's answer for an expired, already used or forged link (index.js). */
const expiredLink = () => httpError(400, { error: 'Invalid or expired reset token' });

const openReset = (query = `?token=${TOKEN}`, lang: 'en' | 'he' = 'en') =>
  renderInApp(<ResetPasswordPage />, { route: `/reset-password${query}`, lang });

const fillIn = async (password: string, confirm = password) => {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText(copy('en', 'password.reset.new')), password);
  await user.type(screen.getByLabelText(copy('en', 'password.reset.confirm')), confirm);
  await user.click(screen.getByRole('button', { name: copy('en', 'password.reset.submit') }));
  return user;
};

describe('ResetPasswordPage', () => {
  it('uses a token whose payload needs the URL-safe alphabet', () => {
    expect(TOKEN.split('.')[1]).toMatch(/[-_]/);
  });

  it('shows who the link is for', () => {
    openReset();
    expect(screen.getByRole('heading', { name: copy('en', 'password.reset.title') })).toBeTruthy();
    expect(screen.getByText(copy('en', 'password.reset.forEmail', { email: EMAIL }))).toBeTruthy();
  });

  it('greets a customer who has just paid', () => {
    openReset(`?token=${TOKEN}&welcome=1`);
    expect(screen.getByRole('heading', { name: copy('en', 'password.reset.welcomeTitle') })).toBeTruthy();
  });

  it('refuses a password shorter than 10 characters without asking the server', async () => {
    openReset();
    await fillIn('123456789');
    expect(screen.getByRole('alert').textContent).toBe(copy('en', 'password.reset.tooShort', { n: 10 }));
    expect(resetPassword).not.toHaveBeenCalled();
  });

  it('refuses a confirmation that does not match without asking the server', async () => {
    openReset();
    await fillIn('a-long-password', 'a-long-passw0rd');
    expect(screen.getByRole('alert').textContent).toBe(copy('en', 'password.reset.mismatch'));
    expect(resetPassword).not.toHaveBeenCalled();
  });

  it('accepts exactly 10 characters and saves the password with the token', async () => {
    resetPassword.mockResolvedValue(answered({ status: 'ok' }));
    openReset();
    await fillIn('0123456789');
    expect(resetPassword).toHaveBeenCalledWith(TOKEN, '0123456789');
    expect(await screen.findByRole('heading', { name: copy('en', 'password.reset.doneTitle') })).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe(copy('en', 'password.reset.doneDesc'));
    expect(screen.getByRole('link', { name: copy('en', 'auth.signIn') }).getAttribute('href')).toBe('/login');
  });

  it('offers a new link, prefilled with the address from the token, when the link has expired', async () => {
    resetPassword.mockRejectedValue(expiredLink());
    requestPasswordReset.mockResolvedValue(answered({ message: 'If an account exists for that email, password reset instructions were sent.' }));
    openReset();
    const user = await fillIn('a-long-password');

    expect(await screen.findByRole('heading', { name: copy('en', 'password.reset.expiredTitle') })).toBeTruthy();
    expect(screen.queryByLabelText(copy('en', 'password.reset.new'))).toBeNull();
    const email = screen.getByLabelText(copy('en', 'auth.email')) as HTMLInputElement;
    expect(email.value).toBe(EMAIL);

    await user.click(screen.getByRole('button', { name: copy('en', 'password.forgot.submit') }));
    expect(requestPasswordReset).toHaveBeenCalledWith(EMAIL);
    expect((await screen.findByRole('status')).textContent).toBe(copy('en', 'password.forgot.sent'));
  });

  it('keeps the form for a 400 that is not about the link', async () => {
    resetPassword.mockRejectedValue(httpError(400, { error: 'Invalid input' }));
    openReset();
    await fillIn('a-long-password');
    expect((await screen.findByRole('alert')).textContent).toBe(copy('en', 'common.error'));
    expect(screen.getByLabelText(copy('en', 'password.reset.new'))).toBeTruthy();
  });

  it('lets the person try again after a server error', async () => {
    resetPassword.mockRejectedValueOnce(httpError(500)).mockResolvedValueOnce(answered({ status: 'ok' }));
    openReset();
    const user = await fillIn('a-long-password');
    expect((await screen.findByRole('alert')).textContent).toBe(copy('en', 'common.error'));

    await user.click(screen.getByRole('button', { name: copy('en', 'password.reset.submit') }));
    expect(resetPassword).toHaveBeenCalledTimes(2);
    expect(await screen.findByRole('heading', { name: copy('en', 'password.reset.doneTitle') })).toBeTruthy();
  });

  it('goes straight to "send a new link" when the address has no token', () => {
    openReset('');
    expect(screen.getByRole('heading', { name: copy('en', 'password.reset.expiredTitle') })).toBeTruthy();
    expect((screen.getByLabelText(copy('en', 'auth.email')) as HTMLInputElement).value).toBe('');
  });

  it('survives a token it cannot read', async () => {
    resetPassword.mockRejectedValue(expiredLink());
    openReset('?token=not-a-jwt');
    expect(screen.queryByText(/@/)).toBeNull();
    await fillIn('a-long-password');
    expect(await screen.findByRole('heading', { name: copy('en', 'password.reset.expiredTitle') })).toBeTruthy();
    expect((screen.getByLabelText(copy('en', 'auth.email')) as HTMLInputElement).value).toBe('');
  });

  it('speaks Hebrew', () => {
    openReset(`?token=${TOKEN}`, 'he');
    expect(screen.getByRole('heading', { name: copy('he', 'password.reset.title') })).toBeTruthy();
    expect(screen.getByLabelText(copy('he', 'password.reset.new'))).toBeTruthy();
    expect(screen.getByText(copy('he', 'password.reset.hint', { n: 10 }))).toBeTruthy();
  });
});

describe('ForgotPasswordPage', () => {
  const ask = async (email: string, lang: 'en' | 'he' = 'en') => {
    const user = userEvent.setup();
    const view = renderInApp(<ForgotPasswordPage />, { route: '/forgot-password', lang });
    await user.type(screen.getByLabelText(copy(lang, 'auth.email')), email);
    await user.click(screen.getByRole('button', { name: copy(lang, 'password.forgot.submit') }));
    return { user, view };
  };

  // The server answers the same for every address; the page must not add a
  // difference of its own. It shows its own sentence, never the server's.
  it('shows the same message whether or not the address has an account', async () => {
    requestPasswordReset.mockResolvedValueOnce(answered({ message: 'sent to a real account' }));
    const known = await ask('customer@example.com');
    const knownHtml = (await screen.findByRole('status')).outerHTML;
    known.view.unmount();

    requestPasswordReset.mockResolvedValueOnce(answered({ message: 'nobody by that name' }));
    await ask('stranger@example.com');
    const unknownHtml = (await screen.findByRole('status')).outerHTML;

    expect(requestPasswordReset.mock.calls).toEqual([['customer@example.com'], ['stranger@example.com']]);
    expect(unknownHtml).toBe(knownHtml);
    expect(screen.getByRole('status').textContent).toBe(copy('en', 'password.forgot.sent'));
    expect(screen.queryByText(/nobody|real account/)).toBeNull();
  });

  it('says so in Hebrew too', async () => {
    requestPasswordReset.mockResolvedValue(answered({ message: 'If an account exists for that email, password reset instructions were sent.' }));
    await ask('customer@example.com', 'he');
    expect((await screen.findByRole('status')).textContent).toBe(copy('he', 'password.forgot.sent'));
  });

  it('reports a request that never arrived, keeps the address, and can send again', async () => {
    requestPasswordReset.mockRejectedValueOnce(new Error('Network Error')).mockResolvedValueOnce(answered({}));
    const { user } = await ask('customer@example.com');
    expect((await screen.findByRole('alert')).textContent).toBe(copy('en', 'common.error'));
    expect((screen.getByLabelText(copy('en', 'auth.email')) as HTMLInputElement).value).toBe('customer@example.com');

    await user.click(screen.getByRole('button', { name: copy('en', 'password.forgot.submit') }));
    expect((await screen.findByRole('status')).textContent).toBe(copy('en', 'password.forgot.sent'));
  });
});
