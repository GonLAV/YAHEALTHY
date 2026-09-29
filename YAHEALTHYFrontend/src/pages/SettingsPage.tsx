import { FormEvent, ReactNode, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { isAxiosError } from 'axios';
import { Bell, Globe, KeyRound, LogOut, Mail, MessageCircle, Settings, Target } from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import { RemindersSettings } from '@/components/settings/RemindersSettings';
import { WhatsAppSettings } from '@/components/settings/WhatsAppSettings';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/i18n/LanguageContext';
import { translations, type Lang } from '@/i18n/translations';
import {
  authApi,
  messagingPrefsApi,
  targetsApi,
  type MessagingPreferences,
  type MessagingPreferencesInput,
  type NutritionTargets,
} from '@/services/api';
import { browserTimeZone } from '@/utils/date';

// Must match the server's MIN_PASSWORD_LENGTH (YAHEALTHYbackend/index.js).
const MIN_PASSWORD_LENGTH = 10;

const SECTIONS = [
  { id: 'messages', key: 'settings.messages.title' },
  { id: 'whatsapp', key: 'settings.whatsapp.title' },
  { id: 'reminders', key: 'settings.reminders.title' },
  { id: 'profile', key: 'settings.profile.title' },
  { id: 'language', key: 'settings.language.title' },
  { id: 'account', key: 'settings.account.title' },
] as const;

const inputClass =
  'mt-1 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200';
const checkboxClass = 'mt-0.5 h-5 w-5 shrink-0 rounded border-slate-300 text-emerald-700 focus:ring-emerald-500 disabled:opacity-60';

/** A labelled region: `aria-labelledby` points at its own h2. Focusable so a #hash link can move focus here. */
const SettingsSection = ({
  id,
  title,
  hint,
  icon,
  children,
}: {
  id: string;
  title: string;
  hint?: string;
  icon: ReactNode;
  children: ReactNode;
}) => (
  <section
    id={id}
    aria-labelledby={`${id}-title`}
    tabIndex={-1}
    className="scroll-mt-20 rounded-3xl bg-slate-100/60 p-4 outline-none ring-emerald-300 focus-visible:ring-2 sm:p-5"
  >
    <div className="mb-4 flex items-center gap-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700" aria-hidden="true">
        {icon}
      </span>
      <div>
        <h2 id={`${id}-title`} className="text-lg font-bold text-slate-900">
          {title}
        </h2>
        {hint && <p className="text-sm text-slate-600">{hint}</p>}
      </div>
    </div>
    {children}
  </section>
);

const Card = ({ children }: { children: ReactNode }) => (
  <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100">{children}</div>
);

const Alert = ({ id, children }: { id?: string; children: ReactNode }) => (
  <p id={id} role="alert" className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700 ring-1 ring-rose-100">
    {children}
  </p>
);

const Status = ({ children }: { children: ReactNode }) => (
  <p role="status" aria-live="polite" className="mt-3 min-h-[1.25rem] text-sm font-medium text-emerald-700">
    {children}
  </p>
);

const Spinner = () => {
  const { t } = useLanguage();
  return (
    <div role="status" aria-live="polite" className="flex justify-center py-8">
      <span className="sr-only">{t('common.loading')}</span>
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-200 border-t-emerald-600" aria-hidden="true" />
    </div>
  );
};

const useDateTime = () => {
  const { lang } = useLanguage();
  return (iso: string) =>
    new Date(iso).toLocaleString(lang === 'he' ? 'he-IL' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' });
};

// ─── Notifications: messages (email / WhatsApp) ─────────────────────────────

type Toggle = 'email_lifecycle' | 'marketing_email' | 'whatsapp';

const MessagesSection = () => {
  const { t } = useLanguage();
  const fmt = useDateTime();
  const [prefs, setPrefs] = useState<MessagingPreferences | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const deviceTz = browserTimeZone();

  useEffect(() => {
    messagingPrefsApi
      .get()
      .then((res) => setPrefs(res.data.preferences))
      .catch(() => setLoadError(true));
  }, []);

  const save = async (key: string, patch: MessagingPreferencesInput) => {
    const previous = prefs;
    setSaving(key);
    setStatus('');
    setError('');
    // Optimistic, so the box flips as it is clicked; undone if the save fails.
    setPrefs((p) => (p ? { ...p, ...patch } : p));
    try {
      const res = await messagingPrefsApi.update(patch);
      setPrefs(res.data.preferences);
      setStatus(t('settings.saved'));
    } catch {
      setPrefs(previous);
      setError(t('settings.saveError'));
    } finally {
      setSaving(null);
    }
  };

  if (loadError) return <Alert>{t('settings.loadError')}</Alert>;
  if (!prefs) return <Spinner />;

  const consentLine = (on: boolean | null, at: string | null, none: string) =>
    on && at ? t('settings.messages.consentGiven', { date: fmt(at) }) : none;

  const rows: { key: Toggle; label: string; desc: string; consent?: string }[] = [
    {
      key: 'email_lifecycle',
      label: t('settings.messages.lifecycle'),
      desc: t('settings.messages.lifecycleDesc'),
    },
    {
      key: 'marketing_email',
      label: t('settings.messages.marketing'),
      desc: t('settings.messages.marketingDesc'),
      consent: consentLine(prefs.marketing_email, prefs.marketing_consent_at, t('settings.messages.marketingNoConsent')),
    },
    {
      key: 'whatsapp',
      label: t('settings.messages.whatsapp'),
      desc: t('settings.messages.whatsappDesc'),
      consent: consentLine(prefs.whatsapp, prefs.whatsapp_consent_at, t('settings.messages.whatsappNoConsent')),
    },
  ];

  return (
    <Card>
      <ul className="divide-y divide-slate-100">
        {rows.map((row) => (
          <li key={row.key} className="py-3 first:pt-0 last:pb-0">
            <div className="flex items-start gap-3">
              <input
                id={`pref-${row.key}`}
                type="checkbox"
                checked={prefs[row.key] === true}
                disabled={saving !== null}
                aria-describedby={`pref-${row.key}-desc${row.consent ? ` pref-${row.key}-consent` : ''}`}
                onChange={(e) => save(row.key, { [row.key]: e.target.checked })}
                className={checkboxClass}
              />
              <div className="min-w-0">
                <label htmlFor={`pref-${row.key}`} className="font-medium text-slate-900">
                  {row.label}
                </label>
                <p id={`pref-${row.key}-desc`} className="text-sm text-slate-500">
                  {row.desc}
                </p>
                {row.consent && (
                  <p id={`pref-${row.key}-consent`} className="mt-1 text-xs text-slate-500">
                    {row.consent}
                  </p>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>

      <div className="mt-4 border-t border-slate-100 pt-4 text-sm text-slate-600">
        <p>
          {t('settings.messages.timezone')}{' '}
          <span className="num font-medium text-slate-800" dir="ltr">
            {prefs.timezone || t('settings.messages.timezoneDefault')}
          </span>
        </p>
        {prefs.timezone !== deviceTz && (
          <button
            type="button"
            onClick={() => save('timezone', { timezone: deviceTz })}
            disabled={saving !== null}
            className="mt-2 rounded-full bg-emerald-50 px-3 py-1.5 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-60"
          >
            {t('settings.messages.useDeviceTz', { tz: deviceTz })}
          </button>
        )}
      </div>

      {error && <Alert>{error}</Alert>}
      <Status>{saving ? t('settings.saving') : status}</Status>
    </Card>
  );
};

// ─── Profile & targets ──────────────────────────────────────────────────────

const ProfileSection = () => {
  const { t } = useLanguage();
  const [targets, setTargets] = useState<NutritionTargets | null>(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    targetsApi
      .get()
      .then((res) => setTargets(res.data.targets))
      .catch(() => setLoadError(true));
  }, []);

  const items: { key: keyof NutritionTargets; label: string; unit: string }[] = [
    { key: 'calories', label: t('settings.profile.calories'), unit: t('settings.profile.kcal') },
    { key: 'protein_grams', label: t('settings.profile.protein'), unit: t('settings.profile.g') },
    { key: 'carbs_grams', label: t('settings.profile.carbs'), unit: t('settings.profile.g') },
    { key: 'fat_grams', label: t('settings.profile.fat'), unit: t('settings.profile.g') },
  ];

  return (
    <Card>
      <h3 className="text-sm font-semibold text-slate-700">{t('settings.profile.current')}</h3>
      {loadError ? (
        <Alert>{t('settings.profile.loadError')}</Alert>
      ) : !targets ? (
        <Spinner />
      ) : (
        <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {items.map((item) => (
            <div key={item.key} className="rounded-xl bg-slate-50 px-3 py-2">
              <dt className="text-xs text-slate-500">{item.label}</dt>
              <dd className="font-semibold text-slate-900">
                {targets[item.key] ? (
                  <span className="num">
                    {Math.round(targets[item.key] as number)} {item.unit}
                  </span>
                ) : (
                  <span className="font-normal text-slate-500">{t('settings.profile.notSet')}</span>
                )}
              </dd>
            </div>
          ))}
        </dl>
      )}
      <div className="mt-4 border-t border-slate-100 pt-4">
        <Link
          to="/onboarding"
          aria-describedby="settings-onboarding-hint"
          className="inline-flex items-center gap-1.5 rounded-full bg-emerald-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-800"
        >
          <Target size={16} aria-hidden="true" />
          {t('settings.profile.rerun')}
        </Link>
        <p id="settings-onboarding-hint" className="mt-2 text-sm text-slate-500">
          {t('settings.profile.rerunHint')}
        </p>
      </div>
    </Card>
  );
};

// ─── Language ───────────────────────────────────────────────────────────────

const LANGS: { value: Lang; label: string }[] = [
  { value: 'he', label: 'עברית' },
  { value: 'en', label: 'English' },
];

const LanguageSection = () => {
  const { t, lang, setLang } = useLanguage();
  const [status, setStatus] = useState('');

  const choose = (next: Lang) => {
    setLang(next);
    // Messages follow the app language. Best effort: the app switches either way.
    messagingPrefsApi
      .update({ lang: next })
      .catch(() => undefined)
      // `t` still speaks the previous language in this closure.
      .finally(() => setStatus(translations[next]['settings.language.saved']));
  };

  return (
    <Card>
      <fieldset aria-describedby="settings-lang-hint">
        <legend className="font-medium text-slate-900">{t('settings.language.legend')}</legend>
        <p id="settings-lang-hint" className="text-sm text-slate-500">
          {t('settings.language.hint')}
        </p>
        <div className="mt-3 flex flex-wrap gap-3">
          {LANGS.map((l) => (
            <label
              key={l.value}
              htmlFor={`settings-lang-${l.value}`}
              className="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-800 has-[:checked]:border-emerald-400 has-[:checked]:bg-emerald-50"
            >
              <input
                id={`settings-lang-${l.value}`}
                type="radio"
                name="settings-lang"
                value={l.value}
                checked={lang === l.value}
                onChange={() => choose(l.value)}
                className="h-4 w-4 border-slate-300 text-emerald-700 focus:ring-emerald-500"
              />
              <span lang={l.value}>{l.label}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <Status>{status}</Status>
    </Card>
  );
};

// ─── Account ────────────────────────────────────────────────────────────────

const AccountSection = () => {
  const { t } = useLanguage();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [invalid, setInvalid] = useState<'current' | 'next' | 'confirm' | null>(null);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setStatus('');
    setInvalid(null);
    if (!current) {
      setInvalid('current');
      setError(t('settings.password.currentRequired'));
      return;
    }
    if (next.length < MIN_PASSWORD_LENGTH) {
      setInvalid('next');
      setError(t('settings.password.tooShort', { n: MIN_PASSWORD_LENGTH }));
      return;
    }
    if (next !== confirm) {
      setInvalid('confirm');
      setError(t('settings.password.mismatch'));
      return;
    }
    setBusy(true);
    try {
      const res = await authApi.changePassword(current, next);
      // Every other session was just cut; this one continues on the new token.
      try {
        if (res.data.token) localStorage.setItem('token', res.data.token);
      } catch {
        /* storage unavailable */
      }
      setCurrent('');
      setNext('');
      setConfirm('');
      setStatus(t('settings.password.changed'));
    } catch (err) {
      if (isAxiosError(err) && err.response?.status === 401) {
        setInvalid('current');
        setError(t('settings.password.wrongCurrent'));
      } else {
        setError(t('settings.password.error'));
      }
    } finally {
      setBusy(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const field = (
    id: 'current' | 'next' | 'confirm',
    label: string,
    value: string,
    set: (v: string) => void,
    autoComplete: string,
    hint?: string,
  ) => (
    <div>
      <label htmlFor={`settings-pw-${id}`} className="text-sm font-medium text-slate-700">
        {label}
      </label>
      <input
        id={`settings-pw-${id}`}
        type="password"
        value={value}
        onChange={(e) => set(e.target.value)}
        autoComplete={autoComplete}
        aria-invalid={invalid === id}
        aria-describedby={[hint ? `settings-pw-${id}-hint` : '', invalid === id ? 'settings-pw-error' : ''].filter(Boolean).join(' ') || undefined}
        className={inputClass}
      />
      {hint && (
        <p id={`settings-pw-${id}-hint`} className="mt-1 text-xs text-slate-500">
          {hint}
        </p>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      <Card>
        <form onSubmit={onSubmit} noValidate aria-labelledby="settings-pw-title">
          <h3 id="settings-pw-title" className="flex items-center gap-2 font-semibold text-slate-900">
            <KeyRound size={18} aria-hidden="true" />
            {t('settings.password.title')}
          </h3>
          <p className="mb-3 text-sm text-slate-500">{t('settings.password.hint')}</p>
          <div className="grid gap-3 sm:grid-cols-3">
            {field('current', t('settings.password.current'), current, setCurrent, 'current-password')}
            {field('next', t('settings.password.new'), next, setNext, 'new-password', t('settings.password.rule', { n: MIN_PASSWORD_LENGTH }))}
            {field('confirm', t('settings.password.confirm'), confirm, setConfirm, 'new-password')}
          </div>
          {error && <Alert id="settings-pw-error">{error}</Alert>}
          <Status>{status}</Status>
          <button
            type="submit"
            disabled={busy}
            className="mt-2 rounded-2xl bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:opacity-60"
          >
            {busy ? t('settings.password.saving') : t('settings.password.submit')}
          </button>
        </form>
      </Card>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm text-slate-500">{t('settings.account.signedInAs')}</p>
            <p className="truncate font-medium text-slate-900" dir="ltr">
              {user?.email}
            </p>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold text-rose-600 ring-1 ring-rose-200 transition hover:bg-rose-50"
          >
            <LogOut size={16} aria-hidden="true" />
            {t('nav.logout')}
          </button>
        </div>
      </Card>
    </div>
  );
};

// ─── page ───────────────────────────────────────────────────────────────────

export const SettingsPage = () => {
  const { t } = useLanguage();
  const { hash } = useLocation();

  // /settings#reminders (old /reminders links, notification clicks): bring
  // that section into view and move focus to it.
  useEffect(() => {
    const id = decodeURIComponent(hash.replace(/^#/, ''));
    if (!id) return;
    const el = document.getElementById(id);
    if (!el || el.tagName !== 'SECTION') return;
    el.scrollIntoView({ block: 'start' });
    el.focus({ preventScroll: true });
  }, [hash]);

  return (
    <div className="mx-auto max-w-3xl p-4 md:p-8">
      <PageHeader title={t('settings.title')} subtitle={t('settings.subtitle')} icon={<Settings size={24} />} />

      <nav aria-label={t('settings.toc')} className="mb-6">
        <ul className="flex flex-wrap gap-2">
          {SECTIONS.map((s) => (
            <li key={s.id}>
              <a
                href={`#${s.id}`}
                className="inline-block rounded-full bg-white px-3 py-1.5 text-sm font-medium text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-50"
              >
                {t(s.key)}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <div className="space-y-6">
        <SettingsSection id="messages" title={t('settings.messages.title')} hint={t('settings.messages.hint')} icon={<Mail size={20} />}>
          <MessagesSection />
        </SettingsSection>

        <SettingsSection id="whatsapp" title={t('settings.whatsapp.title')} hint={t('settings.whatsapp.hint')} icon={<MessageCircle size={20} />}>
          <WhatsAppSettings />
        </SettingsSection>

        <SettingsSection id="reminders" title={t('settings.reminders.title')} hint={t('reminders.subtitle')} icon={<Bell size={20} />}>
          <RemindersSettings />
        </SettingsSection>

        <SettingsSection id="profile" title={t('settings.profile.title')} hint={t('settings.profile.hint')} icon={<Target size={20} />}>
          <ProfileSection />
        </SettingsSection>

        <SettingsSection id="language" title={t('settings.language.title')} icon={<Globe size={20} />}>
          <LanguageSection />
        </SettingsSection>

        <SettingsSection id="account" title={t('settings.account.title')} icon={<KeyRound size={20} />}>
          <AccountSection />
        </SettingsSection>
      </div>
    </div>
  );
};

export default SettingsPage;
