import { ReactNode, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AlertCircle, CheckCircle2, Heart, KeyRound, Mail } from 'lucide-react';
import { useLanguage } from '@/i18n/LanguageContext';
import { authApi } from '@/services/api';

/**
 * Choosing a password from an emailed link, and asking for a new link.
 *
 * These pages did not exist. The server has always mailed a link to
 * /reset-password — to every customer right after they pay, since their account
 * is created without one — and the link fell through to the catch-all route
 * and a login screen. So someone who paid could never sign in.
 */

// The server's rule (MIN_PASSWORD_LENGTH in YAHEALTHYbackend/index.js). Checked
// here only to answer before the round trip; the server's answer is the one
// that counts.
const MIN_PASSWORD_LENGTH = 10;

const inputClass =
  'w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 ps-10 text-sm outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-100';

/** The address the link was issued for, read from the token for display only. */
function emailFromToken(token: string): string | null {
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return typeof payload.email === 'string' ? payload.email : null;
  } catch {
    return null;
  }
}

const Shell = ({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) => (
  <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-emerald-50 via-teal-50 to-sky-50 px-4 py-10">
    <main id="main-content" className="w-full max-w-md">
      <Link to="/" className="mb-8 flex flex-col items-center gap-3" aria-label="YAHealthy">
        <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-emerald-600 shadow-lg shadow-emerald-200">
          <Heart size={30} className="text-white" fill="white" />
        </div>
        <span className="text-3xl font-extrabold text-slate-900">YAHealthy</span>
      </Link>
      <div className="rounded-3xl bg-white p-8 shadow-xl ring-1 ring-slate-100">
        <h1 className="text-xl font-bold text-slate-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
        <div className="mt-6">{children}</div>
      </div>
    </main>
  </div>
);

const ErrorBox = ({ id, children }: { id?: string; children: ReactNode }) => (
  <div id={id} role="alert" className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
    <AlertCircle size={16} className="shrink-0" aria-hidden="true" />
    {children}
  </div>
);

const primaryButton =
  'w-full rounded-xl bg-emerald-600 py-3 font-semibold text-white shadow-md shadow-emerald-200 transition hover:bg-emerald-700 disabled:opacity-60';

/** Email field + "send me a link". Used on its own page and when a link has expired. */
const RequestLinkForm = ({ initialEmail = '' }: { initialEmail?: string }) => {
  const { t } = useLanguage();
  const [email, setEmail] = useState(initialEmail);
  const [state, setState] = useState<'idle' | 'busy' | 'sent' | 'error'>('idle');

  if (state === 'sent') {
    return (
      <div role="status" className="flex items-start gap-3 rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-900">
        <CheckCircle2 size={20} className="mt-0.5 shrink-0" aria-hidden="true" />
        <p>{t('password.forgot.sent')}</p>
      </div>
    );
  }

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setState('busy');
        try {
          await authApi.requestPasswordReset(email);
          setState('sent');
        } catch {
          setState('error');
        }
      }}
    >
      <div>
        <label htmlFor="pw-email" className="mb-1.5 block text-sm font-medium text-slate-700">{t('auth.email')}</label>
        <div className="relative">
          <Mail size={17} className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <input
            id="pw-email"
            type="email"
            autoComplete="email"
            dir="ltr"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
            aria-describedby={state === 'error' ? 'pw-email-error' : undefined}
          />
        </div>
      </div>
      {state === 'error' && <ErrorBox id="pw-email-error">{t('common.error')}</ErrorBox>}
      <button type="submit" disabled={state === 'busy'} className={primaryButton}>
        {state === 'busy' ? t('password.forgot.sending') : t('password.forgot.submit')}
      </button>
    </form>
  );
};

export const ForgotPasswordPage = () => {
  const { t } = useLanguage();
  return (
    <Shell title={t('password.forgot.title')} subtitle={t('password.forgot.subtitle')}>
      <RequestLinkForm />
      <p className="mt-6 text-center text-sm text-slate-500">
        <Link to="/login" className="font-semibold text-emerald-700 hover:text-emerald-800">{t('password.backToLogin')}</Link>
      </p>
    </Shell>
  );
};

export const ResetPasswordPage = () => {
  const { t } = useLanguage();
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const isWelcome = params.get('welcome') === '1';
  const email = useMemo(() => (token ? emailFromToken(token) : null), [token]);

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'expired'>(token ? 'idle' : 'expired');

  if (state === 'done') {
    return (
      <Shell title={t('password.reset.doneTitle')}>
        <div role="status" className="flex items-start gap-3 rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-900">
          <CheckCircle2 size={20} className="mt-0.5 shrink-0" aria-hidden="true" />
          <p>{t('password.reset.doneDesc')}</p>
        </div>
        <Link to="/login" className={`${primaryButton} mt-6 block text-center`}>{t('auth.signIn')}</Link>
      </Shell>
    );
  }

  if (state === 'expired') {
    return (
      <Shell title={t('password.reset.expiredTitle')} subtitle={t('password.reset.expiredDesc')}>
        <RequestLinkForm initialEmail={email || ''} />
      </Shell>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < MIN_PASSWORD_LENGTH) return setError(t('password.reset.tooShort', { n: MIN_PASSWORD_LENGTH }));
    if (password !== confirm) return setError(t('password.reset.mismatch'));
    setState('busy');
    try {
      await authApi.resetPassword(token, password);
      setState('done');
    } catch (err: any) {
      // 400 is the server's answer for an expired, already used or forged
      // link. Anything else is ours, and worth trying again.
      if (err.response?.status === 400 && /token/i.test(err.response?.data?.error || '')) setState('expired');
      else {
        setState('idle');
        setError(t('common.error'));
      }
    }
  };

  return (
    <Shell
      title={isWelcome ? t('password.reset.welcomeTitle') : t('password.reset.title')}
      subtitle={email ? t('password.reset.forEmail', { email }) : undefined}
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        <div>
          <label htmlFor="pw-new" className="mb-1.5 block text-sm font-medium text-slate-700">{t('password.reset.new')}</label>
          <div className="relative">
            <KeyRound size={17} className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <input
              id="pw-new"
              type="password"
              autoComplete="new-password"
              required
              minLength={MIN_PASSWORD_LENGTH}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputClass}
              aria-describedby="pw-hint"
            />
          </div>
          <p id="pw-hint" className="mt-1.5 text-xs text-slate-500">{t('password.reset.hint', { n: MIN_PASSWORD_LENGTH })}</p>
        </div>
        <div>
          <label htmlFor="pw-confirm" className="mb-1.5 block text-sm font-medium text-slate-700">{t('password.reset.confirm')}</label>
          <div className="relative">
            <KeyRound size={17} className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <input
              id="pw-confirm"
              type="password"
              autoComplete="new-password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className={inputClass}
            />
          </div>
        </div>
        {error && <ErrorBox>{error}</ErrorBox>}
        <button type="submit" disabled={state === 'busy'} className={primaryButton}>
          {state === 'busy' ? t('password.reset.saving') : t('password.reset.submit')}
        </button>
      </form>
    </Shell>
  );
};
