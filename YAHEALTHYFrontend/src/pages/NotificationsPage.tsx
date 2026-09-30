import { useEffect, useState } from 'react';
import { AlertCircle, Bell, CheckCircle2, Droplets, HeartHandshake, MessageCircle, Sparkles, Sunrise, UtensilsCrossed } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Num } from '@/components/ui/Num';
import { useLanguage } from '@/i18n/LanguageContext';
import { NudgeKind, NudgeSettings, notificationsApi } from '@/services/api';

const KINDS: { kind: NudgeKind; icon: JSX.Element }[] = [
  { kind: 'menu', icon: <UtensilsCrossed size={18} aria-hidden="true" /> },
  { kind: 'breakfast', icon: <Sunrise size={18} aria-hidden="true" /> },
  { kind: 'water', icon: <Droplets size={18} aria-hidden="true" /> },
  { kind: 'praise', icon: <Sparkles size={18} aria-hidden="true" /> },
];

/** A switch that is a real checkbox underneath, so keyboards and screen readers get it for free. */
const Toggle = ({ id, checked, onChange, disabled }: { id: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) => (
  <span className="relative inline-flex shrink-0 items-center">
    <input id={id} type="checkbox" role="switch" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
    <span
      aria-hidden="true"
      className="h-6 w-11 rounded-full bg-slate-300 transition peer-checked:bg-emerald-700 peer-focus-visible:ring-2 peer-focus-visible:ring-emerald-500 peer-focus-visible:ring-offset-2 peer-disabled:opacity-50"
    />
    <span aria-hidden="true" className="pointer-events-none absolute start-0.5 h-5 w-5 rounded-full bg-white shadow transition peer-checked:translate-x-5 rtl:peer-checked:-translate-x-5" />
  </span>
);

export const NotificationsPage = () => {
  const { t } = useLanguage();
  const [data, setData] = useState<NudgeSettings | null>(null);
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [test, setTest] = useState<{ state: 'idle' | 'busy' | 'sent' | 'wait' | 'error'; body?: string; channel?: string }>({ state: 'idle' });

  useEffect(() => {
    notificationsApi.settings().then(({ data }) => setData(data)).catch(() => setFailed(true));
  }, []);

  const save = async (next: NudgeSettings['settings']) => {
    if (!data) return;
    setData({ ...data, settings: next });
    setSaving(true);
    try {
      const { data: saved } = await notificationsApi.save(next);
      setData(saved);
    } catch {
      setFailed(true);
    } finally {
      setSaving(false);
    }
  };

  const sendTest = async () => {
    setTest({ state: 'busy' });
    try {
      const { data: r } = await notificationsApi.test('water');
      setTest({ state: 'sent', body: r.body, channel: r.channel });
    } catch (err: any) {
      setTest({ state: err.response?.status === 429 ? 'wait' : 'error' });
    }
  };

  const hoursFor = (kind: NudgeKind) => (data?.schedule || []).filter((s) => s.kind === kind).map((s) => `${String(s.hour).padStart(2, '0')}:00`);

  return (
    <div className="mx-auto max-w-3xl p-4 md:p-8">
      <PageHeader title={t('nudges.pageTitle')} subtitle={t('nudges.pageSubtitle')} icon={<Bell size={22} />} />

      {failed && <p role="alert" className="text-rose-600">{t('common.error')}</p>}
      {!data && !failed && <p role="status" className="text-slate-500">{t('common.loading')}</p>}

      {data && (
        <div className="space-y-5">
          {data.pausedForHealth && (
            <div role="status" className="flex items-start gap-3 rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900">
              <HeartHandshake size={20} className="mt-0.5 shrink-0" aria-hidden="true" />
              <p>{t('nudges.pausedForHealth')}</p>
            </div>
          )}

          <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-100">
            <div className="flex items-center justify-between gap-4">
              <label htmlFor="nudges-enabled" className="cursor-pointer">
                <span className="block font-bold text-slate-900">{t('nudges.master')}</span>
                <span className="mt-1 block text-sm text-slate-600">{t('nudges.masterDesc')}</span>
              </label>
              <Toggle id="nudges-enabled" checked={data.settings.enabled} disabled={saving || data.pausedForHealth} onChange={(v) => save({ ...data.settings, enabled: v })} />
            </div>
            <p className="mt-4 flex items-start gap-2 text-sm text-slate-600">
              <MessageCircle size={16} className="mt-0.5 shrink-0 text-emerald-700" aria-hidden="true" />
              {data.whatsapp ? t('nudges.whatsappOn') : data.hasPhone ? t('nudges.whatsappAppOnly') : t('nudges.noPhone')}
            </p>
          </section>

          <section aria-labelledby="nudge-kinds" className={`rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-100 ${data.settings.enabled ? '' : 'opacity-60'}`}>
            <h2 id="nudge-kinds" className="mb-4 font-bold text-slate-900">{t('nudges.which')}</h2>
            <ul className="divide-y divide-slate-100">
              {KINDS.map(({ kind, icon }) => (
                <li key={kind} className="flex items-center justify-between gap-4 py-3">
                  <label htmlFor={`nudge-${kind}`} className="flex cursor-pointer items-start gap-3">
                    <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">{icon}</span>
                    <span>
                      <span className="block font-semibold text-slate-900">{t(`nudges.kind.${kind}.name`)}</span>
                      <span className="block text-sm text-slate-600">{t(`nudges.kind.${kind}.desc`)}</span>
                      <span className="mt-1 block text-xs text-slate-500">
                        {hoursFor(kind).map((h, i) => (
                          <span key={h}>{i > 0 && ' · '}<Num>{h}</Num></span>
                        ))}
                      </span>
                    </span>
                  </label>
                  <Toggle
                    id={`nudge-${kind}`}
                    checked={data.settings[kind]}
                    disabled={saving || !data.settings.enabled}
                    onChange={(v) => save({ ...data.settings, [kind]: v })}
                  />
                </li>
              ))}
            </ul>
            <p className="mt-4 text-xs text-slate-500">{t('nudges.smart')}</p>
          </section>

          <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-100">
            <h2 className="font-bold text-slate-900">{t('nudges.testTitle')}</h2>
            <p className="mt-1 text-sm text-slate-600">{t('nudges.testDesc')}</p>
            <button
              onClick={sendTest}
              disabled={test.state === 'busy' || data.pausedForHealth}
              className="mt-4 rounded-xl bg-emerald-700 px-5 py-2.5 font-semibold text-white shadow-md shadow-emerald-200 transition hover:bg-emerald-800 disabled:opacity-60"
            >
              {test.state === 'busy' ? t('nudges.testSending') : t('nudges.testButton')}
            </button>
            {test.state === 'sent' && (
              <div role="status" className="mt-4 flex items-start gap-3 rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-900">
                <CheckCircle2 size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
                <div>
                  <p className="font-semibold">{test.channel === 'whatsapp' ? t('nudges.testSentWhatsapp') : t('nudges.testSentApp')}</p>
                  <p className="mt-1 whitespace-pre-line">{test.body}</p>
                </div>
              </div>
            )}
            {(test.state === 'wait' || test.state === 'error') && (
              <p role="alert" className="mt-4 flex items-center gap-2 text-sm text-rose-700">
                <AlertCircle size={16} aria-hidden="true" /> {test.state === 'wait' ? t('nudges.testWait') : t('common.error')}
              </p>
            )}
          </section>

          <p className="text-center text-xs text-slate-500">{t('nudges.stopHint')}</p>
        </div>
      )}
    </div>
  );
};
