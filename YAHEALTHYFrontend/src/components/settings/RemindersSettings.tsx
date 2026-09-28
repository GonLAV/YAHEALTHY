import { FormEvent, ReactNode, useEffect, useState } from 'react';
import { Bell, BellOff, Droplets, Flame, MoonStar, Send, UtensilsCrossed } from 'lucide-react';
import { pushApi, ReminderSettings } from '@/services/api';
import { useLanguage } from '@/i18n/LanguageContext';
import { browserTimeZone } from '@/utils/date';
import {
  disablePushOnThisDevice,
  enablePush,
  hasLocalSubscription,
  notificationPermission,
  pushSupport,
} from '@/pwa/push';

const INTERVALS = [60, 90, 120, 180, 240];

type Form = Pick<ReminderSettings, 'enabled' | 'quietHours' | 'water' | 'meal' | 'streak'>;

const toMinutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

const Section = ({
  id,
  icon,
  title,
  hint,
  children,
}: {
  id: string;
  icon: ReactNode;
  title: string;
  hint: string;
  children: ReactNode;
}) => (
  <fieldset className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100" aria-describedby={`${id}-hint`}>
    <legend className="sr-only">{title}</legend>
    <div className="mb-3 flex items-center gap-2.5">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700" aria-hidden="true">
        {icon}
      </span>
      <div>
        <div className="font-semibold text-slate-900">{title}</div>
        <p id={`${id}-hint`} className="text-xs text-slate-500">{hint}</p>
      </div>
    </div>
    {children}
  </fieldset>
);

const inputClass =
  'num mt-1 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200 disabled:bg-slate-50 disabled:text-slate-400';

/**
 * Push reminders (water, meal, streak, quiet hours) — a section of /settings.
 * The old /reminders route redirects to /settings#reminders.
 */
export const RemindersSettings = () => {
  const { t, lang } = useLanguage();
  const [form, setForm] = useState<Form | null>(null);
  const [devices, setDevices] = useState(0);
  const [serverPush, setServerPush] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [permission, setPermission] = useState(notificationPermission());
  const [subscribedHere, setSubscribedHere] = useState(false);
  const support = pushSupport();
  const tz = browserTimeZone();

  const applyServer = (s: ReminderSettings) => {
    setForm({ enabled: s.enabled, quietHours: s.quietHours, water: s.water, meal: s.meal, streak: s.streak });
    setDevices(s.devices);
    setServerPush(s.pushEnabled);
  };

  useEffect(() => {
    pushApi
      .getReminders()
      .then((res) => applyServer(res.data))
      .catch(() => setLoadError(true));
    hasLocalSubscription().then(setSubscribedHere).catch(() => setSubscribedHere(false));
  }, []);

  const save = async (next: Form) => {
    setError('');
    setStatus('');
    if (toMinutes(next.water.start) >= toMinutes(next.water.end)) {
      setError(t('reminders.waterRangeError'));
      return false;
    }
    setSaving(true);
    try {
      const res = await pushApi.saveReminders({ ...next, tz, lang });
      applyServer(res.data);
      setStatus(t('reminders.saved'));
      return true;
    } catch {
      setError(t('reminders.saveError'));
      return false;
    } finally {
      setSaving(false);
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (form) save(form);
  };

  const turnOn = async () => {
    setError('');
    setStatus('');
    setBusy(true);
    try {
      const result = await enablePush(lang);
      setPermission(result);
      if (result !== 'granted') {
        setError(t('reminders.permissionDenied'));
        return;
      }
      setSubscribedHere(true);
      // Turning notifications on here also switches reminders on.
      if (form) await save({ ...form, enabled: true });
    } catch {
      setError(t('reminders.enableError'));
    } finally {
      setBusy(false);
    }
  };

  const turnOff = async () => {
    setError('');
    setStatus('');
    setBusy(true);
    try {
      await disablePushOnThisDevice();
      setSubscribedHere(false);
      const res = await pushApi.getReminders();
      applyServer(res.data);
    } catch {
      setError(t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  const sendTest = async () => {
    setError('');
    setStatus('');
    try {
      await pushApi.sendTest(lang);
      setStatus(t('reminders.testSent'));
    } catch {
      setError(t('reminders.testError'));
    }
  };

  const update = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => (f ? { ...f, [key]: value } : f));

  const deviceMessage =
    !serverPush ? t('reminders.serverDisabled')
      : support === 'ios-needs-install' ? t('reminders.iosInstall')
        : support === 'unsupported' ? t('reminders.unsupported')
          : permission === 'denied' ? t('reminders.permissionDenied')
            : null;

  const off = !form?.enabled;

  return (
    <div>

      {loadError && (
        <p role="alert" className="mb-4 rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-rose-100">
          {t('reminders.loadError')}
        </p>
      )}

      {!form && !loadError && (
        <div role="status" aria-live="polite" className="flex justify-center py-16">
          <span className="sr-only">{t('common.loading')}</span>
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-emerald-200 border-t-emerald-600" aria-hidden="true" />
        </div>
      )}

      {form && (
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          {/* This device */}
          <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="font-semibold text-slate-900">{t('reminders.master')}</div>
                <p className="text-xs text-slate-500">{t('reminders.masterHint', { tz })}</p>
                <p className="mt-1 text-xs text-slate-500">
                  <span className="num">{t('reminders.devices', { n: devices })}</span>
                </p>
              </div>
              {support === 'supported' && serverPush && permission !== 'denied' && (
                subscribedHere && permission === 'granted' ? (
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={sendTest}
                      className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100"
                    >
                      <Send size={16} aria-hidden="true" />
                      {t('reminders.test')}
                    </button>
                    <button
                      type="button"
                      onClick={turnOff}
                      disabled={busy}
                      className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-semibold text-rose-600 transition hover:bg-rose-50 disabled:opacity-60"
                    >
                      <BellOff size={16} aria-hidden="true" />
                      {t('reminders.disable')}
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={turnOn}
                    disabled={busy}
                    className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
                  >
                    <Bell size={16} aria-hidden="true" />
                    {busy ? t('reminders.enabling') : t('reminders.enable')}
                  </button>
                )
              )}
            </div>
            {deviceMessage && (
              <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-100">{deviceMessage}</p>
            )}
            <label htmlFor="rem-enabled" className="mt-4 flex items-center gap-3 text-sm font-medium text-slate-700">
              <input
                id="rem-enabled"
                type="checkbox"
                checked={form.enabled}
                onChange={(e) => update('enabled', e.target.checked)}
                className="h-5 w-5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
              />
              {t('reminders.master')}
            </label>
          </div>

          <Section id="rem-water" icon={<Droplets size={18} />} title={t('reminders.water')} hint={t('reminders.waterHint')}>
            <label htmlFor="rem-water-on" className="flex items-center gap-3 text-sm font-medium text-slate-700">
              <input
                id="rem-water-on"
                type="checkbox"
                checked={form.water.enabled}
                disabled={off}
                onChange={(e) => update('water', { ...form.water, enabled: e.target.checked })}
                className="h-5 w-5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
              />
              {t('reminders.water')}
            </label>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <div>
                <label htmlFor="rem-water-interval" className="text-xs font-medium text-slate-600">{t('reminders.interval')}</label>
                <select
                  id="rem-water-interval"
                  value={form.water.intervalMinutes}
                  disabled={off || !form.water.enabled}
                  onChange={(e) => update('water', { ...form.water, intervalMinutes: Number(e.target.value) })}
                  className={inputClass}
                >
                  {INTERVALS.map((m) => (
                    <option key={m} value={m}>
                      {m % 60 === 0 ? t('reminders.intervalOption', { h: m / 60 }) : t('reminders.intervalOptionMin', { m })}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="rem-water-start" className="text-xs font-medium text-slate-600">{t('reminders.from')}</label>
                <input
                  id="rem-water-start"
                  type="time"
                  value={form.water.start}
                  disabled={off || !form.water.enabled}
                  onChange={(e) => update('water', { ...form.water, start: e.target.value })}
                  className={inputClass}
                  required
                />
              </div>
              <div>
                <label htmlFor="rem-water-end" className="text-xs font-medium text-slate-600">{t('reminders.to')}</label>
                <input
                  id="rem-water-end"
                  type="time"
                  value={form.water.end}
                  disabled={off || !form.water.enabled}
                  onChange={(e) => update('water', { ...form.water, end: e.target.value })}
                  className={inputClass}
                  required
                />
              </div>
            </div>
          </Section>

          <div className="grid gap-4 sm:grid-cols-2">
            <Section id="rem-meal" icon={<UtensilsCrossed size={18} />} title={t('reminders.meal')} hint={t('reminders.mealHint')}>
              <label htmlFor="rem-meal-on" className="flex items-center gap-3 text-sm font-medium text-slate-700">
                <input
                  id="rem-meal-on"
                  type="checkbox"
                  checked={form.meal.enabled}
                  disabled={off}
                  onChange={(e) => update('meal', { ...form.meal, enabled: e.target.checked })}
                  className="h-5 w-5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                />
                {t('reminders.meal')}
              </label>
              <label htmlFor="rem-meal-time" className="mt-3 block text-xs font-medium text-slate-600">{t('reminders.time')}</label>
              <input
                id="rem-meal-time"
                type="time"
                value={form.meal.time}
                disabled={off || !form.meal.enabled}
                onChange={(e) => update('meal', { ...form.meal, time: e.target.value })}
                className={inputClass}
              />
            </Section>

            <Section id="rem-streak" icon={<Flame size={18} />} title={t('reminders.streak')} hint={t('reminders.streakHint')}>
              <label htmlFor="rem-streak-on" className="flex items-center gap-3 text-sm font-medium text-slate-700">
                <input
                  id="rem-streak-on"
                  type="checkbox"
                  checked={form.streak.enabled}
                  disabled={off}
                  onChange={(e) => update('streak', { ...form.streak, enabled: e.target.checked })}
                  className="h-5 w-5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                />
                {t('reminders.streak')}
              </label>
              <label htmlFor="rem-streak-time" className="mt-3 block text-xs font-medium text-slate-600">{t('reminders.time')}</label>
              <input
                id="rem-streak-time"
                type="time"
                value={form.streak.time}
                disabled={off || !form.streak.enabled}
                onChange={(e) => update('streak', { ...form.streak, time: e.target.value })}
                className={inputClass}
              />
            </Section>
          </div>

          <Section id="rem-quiet" icon={<MoonStar size={18} />} title={t('reminders.quiet')} hint={t('reminders.quietHint')}>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="rem-quiet-start" className="text-xs font-medium text-slate-600">{t('reminders.from')}</label>
                <input
                  id="rem-quiet-start"
                  type="time"
                  value={form.quietHours.start}
                  disabled={off}
                  onChange={(e) => update('quietHours', { ...form.quietHours, start: e.target.value })}
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="rem-quiet-end" className="text-xs font-medium text-slate-600">{t('reminders.to')}</label>
                <input
                  id="rem-quiet-end"
                  type="time"
                  value={form.quietHours.end}
                  disabled={off}
                  onChange={(e) => update('quietHours', { ...form.quietHours, end: e.target.value })}
                  className={inputClass}
                />
              </div>
            </div>
          </Section>

          {error && (
            <p role="alert" className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-rose-100">
              {error}
            </p>
          )}
          <p role="status" aria-live="polite" className="text-sm font-medium text-emerald-700">
            {status}
          </p>

          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-2xl bg-emerald-600 px-5 py-3 font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-60 sm:w-auto"
          >
            {saving ? t('reminders.saving') : t('reminders.save')}
          </button>
        </form>
      )}
    </div>
  );
};

export default RemindersSettings;
