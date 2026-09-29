import { useCallback, useEffect, useState } from 'react';
import { Activity, RefreshCw } from 'lucide-react';
import { useLanguage } from '@/i18n/LanguageContext';
import '@/i18n/strings/staff'; // health.* strings
import { getSystemHealth, type JobHealth, type SystemHealth } from '@/services/systemHealth';

type State = { status: 'loading' } | { status: 'error' } | { status: 'ready'; data: SystemHealth };

const thText = 'px-3 py-2 text-start font-semibold';
const thNum = 'px-3 py-2 text-end font-semibold';
const tdText = 'px-3 py-2 text-start align-top';
const tdNum = 'num px-3 py-2 text-end tabular-nums align-top';

/**
 * "System health" for the staff dashboard: server overview, background jobs
 * and recent server errors, from GET /api/admin/health. Plain tables with
 * captions and scoped headers; loading/errors announced to screen readers.
 */
export const SystemHealthSection = () => {
  const { t, lang } = useLanguage();
  const [state, setState] = useState<State>({ status: 'loading' });
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await getSystemHealth();
      setState({ status: 'ready', data: res.data });
    } catch {
      setState({ status: 'error' });
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const locale = lang === 'he' ? 'he-IL' : 'en-GB';
  const num = new Intl.NumberFormat(locale);
  const when = (iso: string | null) =>
    iso ? new Date(iso).toLocaleString(locale, { dateStyle: 'short', timeStyle: 'medium' }) : t('analytics.none');

  const uptime = (seconds: number) => {
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return t('health.uptimeValue', { d, h, m });
  };

  const jobName = (name: string) => {
    const key = `health.jobs.name.${name}`;
    const label = t(`health.jobs.name.${name}`);
    return label === key ? name : label;
  };

  const jobState = (job: JobHealth) => {
    if (!job.enabled) return { text: t('health.jobs.notScheduled', { reason: job.disabledReason ?? '?' }), tone: 'text-slate-500' };
    if (job.running) return { text: t('health.jobs.running'), tone: 'text-sky-700' };
    if (!job.lastStatus) return { text: t('health.jobs.never'), tone: 'text-slate-500' };
    if (job.lastStatus === 'error') return { text: t('health.jobs.failedRun'), tone: 'font-semibold text-rose-700' };
    return { text: t('health.jobs.ok'), tone: 'text-emerald-700' };
  };

  return (
    <section aria-labelledby="system-health-title" className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 id="system-health-title" className="flex items-center gap-2 text-base font-semibold text-slate-900">
            <Activity size={18} aria-hidden="true" />
            {t('health.title')}
          </h2>
          <p className="text-xs text-slate-500">{t('health.subtitle')}</p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={refreshing}
          className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-200 disabled:opacity-60"
        >
          <RefreshCw size={14} aria-hidden="true" className={refreshing ? 'motion-safe:animate-spin' : ''} />
          {t('health.refresh')}
        </button>
      </div>

      {state.status === 'loading' && (
        <p role="status" aria-live="polite" className="py-6 text-center text-sm text-slate-500">
          {t('health.loading')}
        </p>
      )}
      {state.status === 'error' && (
        <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {t('health.error')}
        </p>
      )}

      {state.status === 'ready' && (
        <div className="space-y-6">
          <p
            role="status"
            aria-live="polite"
            className={`rounded-xl px-4 py-2 text-sm font-semibold ${
              state.data.status === 'ok' ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-900'
            }`}
          >
            {t(state.data.status === 'ok' ? 'health.status.ok' : 'health.status.degraded')}
          </p>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="mb-2 text-start text-xs text-slate-500">{t('health.overview')}</caption>
              <thead className="sr-only">
                <tr>
                  <th scope="col">{t('health.item')}</th>
                  <th scope="col">{t('health.value')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                <tr>
                  <th scope="row" className={`${tdText} font-medium text-slate-600`}>{t('health.uptime')}</th>
                  <td className={tdText}>{uptime(state.data.uptimeSeconds)}</td>
                </tr>
                <tr>
                  <th scope="row" className={`${tdText} font-medium text-slate-600`}>{t('health.version')}</th>
                  <td className={tdText}>
                    <span className="num font-mono text-xs" dir="ltr">{state.data.version.app}</span>
                  </td>
                </tr>
                <tr>
                  <th scope="row" className={`${tdText} font-medium text-slate-600`}>{t('health.commit')}</th>
                  <td className={tdText}>
                    {state.data.version.commit ? (
                      <span className="num font-mono text-xs" dir="ltr" title={state.data.version.commit}>
                        {state.data.version.commit.slice(0, 7)}
                      </span>
                    ) : (
                      t('analytics.none')
                    )}
                  </td>
                </tr>
                <tr>
                  <th scope="row" className={`${tdText} font-medium text-slate-600`}>{t('health.environment')}</th>
                  <td className={tdText}>
                    <span className="num font-mono text-xs" dir="ltr">
                      {state.data.version.environment} · {state.data.version.platform} · {state.data.version.node}
                    </span>
                  </td>
                </tr>
                <tr>
                  <th scope="row" className={`${tdText} font-medium text-slate-600`}>{t('health.db')}</th>
                  <td className={tdText}>
                    {t(state.data.db.mode === 'memory' ? 'health.db.memory' : 'health.db.supabase')} —{' '}
                    <span className={state.data.db.ok ? 'text-emerald-700' : 'font-semibold text-rose-700'}>
                      {state.data.db.ok
                        ? t('health.db.ok', { ms: num.format(state.data.db.latencyMs ?? 0) })
                        : t('health.db.down')}
                    </span>
                  </td>
                </tr>
                <tr>
                  <th scope="row" className={`${tdText} font-medium text-slate-600`}>{t('health.errorTracking')}</th>
                  <td className={tdText}>{t(state.data.errorTracking.enabled ? 'health.on' : 'health.off')}</td>
                </tr>
                <tr>
                  <th scope="row" className={`${tdText} font-medium text-slate-600`}>{t('health.disabled')}</th>
                  <td className={tdText}>
                    {state.data.config.disabledFeatures.length ? (
                      <ul className="flex flex-wrap gap-1.5">
                        {state.data.config.disabledFeatures.map((f) => (
                          <li key={f} className="rounded-full bg-slate-100 px-2 py-0.5 font-mono text-xs text-slate-700" dir="ltr">
                            {f}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      t('health.disabled.none')
                    )}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <caption className="mb-2 text-start">
                <span className="block text-sm font-semibold text-slate-900">{t('health.jobs.title')}</span>
                <span className="block text-xs text-slate-500">{t('health.jobs.caption')}</span>
              </caption>
              <thead className="bg-slate-50 text-xs text-slate-600">
                <tr>
                  <th scope="col" className={thText}>{t('health.jobs.job')}</th>
                  <th scope="col" className={thText}>{t('health.jobs.state')}</th>
                  <th scope="col" className={thText}>{t('health.jobs.lastRun')}</th>
                  <th scope="col" className={thNum}>{t('health.jobs.duration')}</th>
                  <th scope="col" className={thNum}>{t('health.jobs.sent')}</th>
                  <th scope="col" className={thNum}>{t('health.jobs.failed')}</th>
                  <th scope="col" className={thNum}>{t('health.jobs.skipped')}</th>
                  <th scope="col" className={thText}>{t('health.jobs.lastError')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {state.data.jobs.map((job) => {
                  const s = jobState(job);
                  return (
                    <tr key={job.name}>
                      <th scope="row" className={`${tdText} font-medium text-slate-800`}>{jobName(job.name)}</th>
                      <td className={`${tdText} ${s.tone}`}>{s.text}</td>
                      <td className={tdText}>{when(job.lastFinishedAt ?? job.lastStartedAt)}</td>
                      <td className={tdNum}>
                        {job.lastDurationMs === null ? t('analytics.none') : t('health.jobs.ms', { ms: num.format(job.lastDurationMs) })}
                      </td>
                      <td className={tdNum}>{job.lastCounts ? num.format(job.lastCounts.sent) : t('analytics.none')}</td>
                      <td className={tdNum}>{job.lastCounts ? num.format(job.lastCounts.failed) : t('analytics.none')}</td>
                      <td className={tdNum}>{job.lastCounts ? num.format(job.lastCounts.skipped) : t('analytics.none')}</td>
                      <td className={`${tdText} max-w-xs break-words text-xs text-slate-600`}>
                        {job.lastError ? (
                          <>
                            <span dir="ltr" className="font-mono">{job.lastError.message}</span>
                            <span className="block text-slate-400">{when(job.lastError.at)}</span>
                          </>
                        ) : (
                          t('analytics.none')
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <caption className="mb-2 text-start">
                <span className="block text-sm font-semibold text-slate-900">
                  {t('health.errors.title', { n: state.data.errors.windowMinutes })}
                </span>
                <span className="block text-xs text-slate-500">{t('health.errors.caption')}</span>
              </caption>
              <thead className="bg-slate-50 text-xs text-slate-600">
                <tr>
                  <th scope="col" className={thText}>{t('health.errors.route')}</th>
                  <th scope="col" className={thNum}>{t('health.errors.count')}</th>
                  <th scope="col" className={thNum}>{t('health.errors.lastStatus')}</th>
                  <th scope="col" className={thText}>{t('health.errors.lastAt')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {state.data.errors.routes.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-3 py-4 text-center text-slate-500">{t('health.errors.none')}</td>
                  </tr>
                ) : (
                  state.data.errors.routes.map((r) => (
                    <tr key={r.route}>
                      <th scope="row" className={`${tdText} font-mono text-xs font-normal`}>
                        <span dir="ltr">{r.route}</span>
                      </th>
                      <td className={tdNum}>{num.format(r.count)}</td>
                      <td className={tdNum}>{r.lastStatus}</td>
                      <td className={tdText}>{when(r.lastAt)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-slate-500">
              {t('health.errors.client', { n: num.format(state.data.errors.clientErrors) })}
            </p>
          </div>
        </div>
      )}
    </section>
  );
};

export default SystemHealthSection;
