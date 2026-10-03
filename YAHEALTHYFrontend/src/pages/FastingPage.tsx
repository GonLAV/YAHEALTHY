import { useEffect, useMemo, useRef, useState } from 'react';
import { isAxiosError } from 'axios';
import { Timer, Play, Square, Trash2, Trophy, Flame, Clock, Hourglass, Info, CheckCircle2 } from 'lucide-react';
import { fastingApi, Fast, FastingStats } from '@/services/fastingApi';
import { useLanguage } from '@/i18n/LanguageContext';
import PageHeader from '@/components/ui/PageHeader';
import ProgressRing from '@/components/ui/ProgressRing';
import StatCard from '@/components/ui/StatCard';
import EmptyState from '@/components/ui/EmptyState';

type ProtocolId = '13' | '16' | '18' | '20' | '24' | 'custom';

const PROTOCOLS: { id: Exclude<ProtocolId, 'custom'>; hours: number; label: string }[] = [
  { id: '13', hours: 13, label: '13:11' },
  { id: '16', hours: 16, label: '16:8' },
  { id: '18', hours: 18, label: '18:6' },
  { id: '20', hours: 20, label: '20:4' },
  { id: '24', hours: 24, label: '24h' },
];

const MIN_HOURS = 8;
const MAX_HOURS = 72;

// Deliberately mild, general statements — see fasting.disclaimer.
const STAGES = [
  { key: 'fed', from: 0 },
  { key: 'settling', from: 4 },
  { key: 'fatBurn', from: 12 },
  { key: 'ketosis', from: 16 },
  { key: 'extended', from: 24 },
] as const;

const HOUR_MS = 3600 * 1000;

const stageIndexFor = (hours: number) => {
  let idx = 0;
  STAGES.forEach((s, i) => {
    if (hours >= s.from) idx = i;
  });
  return idx;
};

const pad = (n: number) => String(n).padStart(2, '0');

/** H:MM:SS, hours unbounded (a 30h fast reads 30:00:00). */
const formatClock = (ms: number) => {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
};

/** H:MM, for secondary lines that should not tick every second. */
const formatShort = (ms: number) => {
  const totalMin = Math.max(0, Math.floor(ms / 60000));
  return `${Math.floor(totalMin / 60)}:${pad(totalMin % 60)}`;
};

const formatHours = (h: number) => (Number.isInteger(h) ? String(h) : h.toFixed(1));

const protocolFor = (hours: number): ProtocolId =>
  PROTOCOLS.find((p) => p.hours === hours)?.id ?? 'custom';

/** datetime-local value (local time, minutes precision) for a Date. */
const toLocalInput = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

export const FastingPage = () => {
  const { t, lang } = useLanguage();
  const locale = lang === 'he' ? 'he-IL' : 'en-US';

  const [active, setActive] = useState<Fast | null>(null);
  const [history, setHistory] = useState<Fast[]>([]);
  const [stats, setStats] = useState<FastingStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<'start' | 'end' | null>(null);
  const [error, setError] = useState('');
  const [announcement, setAnnouncement] = useState('');

  const [protocol, setProtocol] = useState<ProtocolId>('16');
  const [customHours, setCustomHours] = useState('');
  const [startedEarlier, setStartedEarlier] = useState('');
  const [now, setNow] = useState(() => Date.now());

  const loadAll = async () => {
    try {
      const [activeRes, listRes, statsRes] = await Promise.all([
        fastingApi.getActive(),
        fastingApi.getAll(30),
        fastingApi.getStats(),
      ]);
      setNow(Date.now());
      setActive(activeRes.data);
      setHistory(listRes.data.filter((f) => f.ended_at));
      setStats(statsRes.data);
      if (activeRes.data) setProtocol(protocolFor(activeRes.data.target_hours));
    } catch (err) {
      console.error('Failed to load fasts:', err);
      setError(t('common.error'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tick once a second only while a fast is running.
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [active]);

  const targetHours =
    protocol === 'custom' ? Number(customHours) : PROTOCOLS.find((p) => p.id === protocol)!.hours;
  const targetValid =
    Number.isFinite(targetHours) && targetHours >= MIN_HOURS && targetHours <= MAX_HOURS;

  const elapsedMs = active ? Math.max(0, now - new Date(active.started_at).getTime()) : 0;
  const elapsedHours = elapsedMs / HOUR_MS;
  const activeTarget = active?.target_hours ?? (targetValid ? targetHours : 16);
  const goalMs = activeTarget * HOUR_MS;
  const goalReached = !!active && elapsedMs >= goalMs;
  const stageIdx = stageIndexFor(elapsedHours);

  // Announce milestones only (stage change, goal reached) — never every second.
  const lastStage = useRef<number | null>(null);
  const lastGoal = useRef<boolean | null>(null);
  useEffect(() => {
    if (!active) {
      lastStage.current = null;
      lastGoal.current = null;
      return;
    }
    if (lastGoal.current === false && goalReached) {
      setAnnouncement(t('fasting.announce.goal'));
    } else if (lastStage.current !== null && lastStage.current !== stageIdx) {
      setAnnouncement(
        t('fasting.announce.stage', { stage: t(`fasting.stage.${STAGES[stageIdx].key}.name`) }),
      );
    }
    lastStage.current = stageIdx;
    lastGoal.current = goalReached;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, stageIdx, goalReached]);

  const refreshAfterChange = async () => {
    try {
      const [listRes, statsRes] = await Promise.all([fastingApi.getAll(30), fastingApi.getStats()]);
      setHistory(listRes.data.filter((f) => f.ended_at));
      setStats(statsRes.data);
    } catch (err) {
      console.error('Failed to refresh fasts:', err);
    }
  };

  const handleStart = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetValid) {
      setError(t('fasting.protocol.customInvalid'));
      return;
    }
    setBusy('start');
    setError('');
    try {
      const startedAt = startedEarlier ? new Date(startedEarlier).toISOString() : undefined;
      const res = await fastingApi.start(targetHours, startedAt);
      // Refresh the clock in the same render, so the first frame of the new
      // fast isn't computed from a stale `now` (false stage announcement).
      setNow(Date.now());
      setActive(res.data);
      setStartedEarlier('');
      setAnnouncement(t('fasting.announce.started', { hours: formatHours(res.data.target_hours) }));
    } catch (err) {
      if (isAxiosError(err) && err.response?.status === 409 && err.response.data?.active) {
        setNow(Date.now());
        setActive(err.response.data.active as Fast);
        setError(t('fasting.alreadyActive'));
      } else {
        setError(t('common.error'));
      }
    } finally {
      setBusy(null);
    }
  };

  const handleEnd = async () => {
    if (!active) return;
    setBusy('end');
    setError('');
    try {
      const res = await fastingApi.end(active.id);
      const hours = formatHours(res.data.duration_hours ?? 0);
      setAnnouncement(
        res.data.completed
          ? t('fasting.announce.completed', { hours })
          : t('fasting.announce.endedEarly', { hours }),
      );
      setActive(null);
      await refreshAfterChange();
    } catch (err) {
      if (isAxiosError(err) && (err.response?.status === 409 || err.response?.status === 404)) {
        // Ended or deleted elsewhere (another tab/device): resync.
        setActive(null);
        await refreshAfterChange();
      } else {
        setError(t('common.error'));
      }
    } finally {
      setBusy(null);
    }
  };

  const handleDelete = async (fast: Fast) => {
    setError('');
    try {
      await fastingApi.remove(fast.id);
      setHistory((prev) => prev.filter((f) => f.id !== fast.id));
      setAnnouncement(t('fasting.announce.deleted'));
      await refreshAfterChange();
    } catch (err) {
      setError(t('common.error'));
    }
  };

  const formatDateTime = (iso: string) =>
    new Date(iso).toLocaleString(locale, {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' });

  // Minute-granularity accessible name for the timer; the ticking digits are aria-hidden.
  const elapsedMinutesTotal = Math.floor(elapsedMs / 60000);
  const timerAria = useMemo(
    () =>
      t('fasting.timer.aria', {
        hours: Math.floor(elapsedMinutesTotal / 60),
        minutes: elapsedMinutesTotal % 60,
        target: formatHours(activeTarget),
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [elapsedMinutesTotal, activeTarget, lang],
  );

  const ringColor = goalReached ? '#d97706' : '#059669';
  const ringTrack = goalReached ? '#fef3c7' : '#d1fae5';

  return (
    <div className="mx-auto max-w-4xl p-4 md:p-8">
      <PageHeader title={t('fasting.title')} subtitle={t('fasting.subtitle')} icon={<Timer size={24} />} />

      {/* Screen-reader announcements for milestones and actions only */}
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>

      {loading ? (
        <p role="status" aria-live="polite" className="py-10 text-center text-sm text-slate-400">
          {t('common.loading')}
        </p>
      ) : (
        <>
          {/* Timer card */}
          <section
            aria-labelledby="fasting-timer-heading"
            className="flex flex-col items-center gap-6 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-100 md:p-8"
          >
            <h2 id="fasting-timer-heading" className="sr-only">
              {t('fasting.timer.label')}
            </h2>

            <ProgressRing
              value={active ? elapsedHours : 0}
              target={activeTarget}
              size={240}
              strokeWidth={16}
              color={ringColor}
              trackColor={ringTrack}
            >
              {active ? (
                <>
                  <span className="text-xs font-medium uppercase tracking-wide text-slate-400">
                    {t('fasting.timer.elapsed')}
                  </span>
                  <span role="timer" aria-live="off" aria-atomic="true" aria-label={timerAria}>
                    <span aria-hidden="true" className="num text-4xl font-extrabold tabular-nums text-slate-900">
                      {formatClock(elapsedMs)}
                    </span>
                  </span>
                  <span
                    className={`mt-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                      goalReached ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
                    }`}
                  >
                    {goalReached
                      ? t('fasting.timer.over', { time: formatShort(elapsedMs - goalMs) })
                      : t('fasting.timer.remaining', { time: formatShort(goalMs - elapsedMs) })}
                  </span>
                  <span className="mt-1 text-xs text-slate-400">
                    {t('fasting.timer.goal', { hours: formatHours(activeTarget) })}
                  </span>
                </>
              ) : (
                <>
                  <span className="num text-4xl font-extrabold tabular-nums text-slate-300">00:00:00</span>
                  <span className="mt-1 text-xs text-slate-400">{t('fasting.timer.ready')}</span>
                </>
              )}
            </ProgressRing>

            {active ? (
              <div className="flex w-full flex-col items-center gap-3">
                <p className="text-center text-xs text-slate-500">
                  {t('fasting.startedAt', { time: formatDateTime(active.started_at) })}
                  <span aria-hidden="true"> · </span>
                  {t('fasting.endsAt', {
                    time: formatDateTime(new Date(new Date(active.started_at).getTime() + goalMs).toISOString()),
                  })}
                </p>
                <button
                  type="button"
                  onClick={handleEnd}
                  disabled={busy !== null}
                  className={`flex w-full max-w-xs items-center justify-center gap-2 rounded-2xl py-3.5 font-semibold text-white shadow-md transition disabled:opacity-50 ${
                    goalReached
                      ? 'bg-emerald-600 shadow-emerald-200 hover:bg-emerald-700'
                      : 'bg-rose-600 shadow-rose-200 hover:bg-rose-700'
                  }`}
                >
                  <Square size={18} aria-hidden="true" />
                  {busy === 'end' ? t('fasting.ending') : t('fasting.end')}
                </button>
              </div>
            ) : (
              <form onSubmit={handleStart} className="flex w-full flex-col gap-4">
                <fieldset>
                  <legend className="mb-2 text-sm font-semibold text-slate-700">
                    {t('fasting.protocol.legend')}
                  </legend>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {[...PROTOCOLS, { id: 'custom' as const, hours: 0, label: '' }].map((p) => {
                      const checked = protocol === p.id;
                      return (
                        <label
                          key={p.id}
                          className={`flex cursor-pointer flex-col items-start rounded-2xl px-4 py-3 ring-1 transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-emerald-600 ${
                            checked
                              ? 'bg-emerald-50 text-emerald-800 ring-emerald-500'
                              : 'bg-slate-50 text-slate-700 ring-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          <input
                            type="radio"
                            name="fasting-protocol"
                            value={p.id}
                            checked={checked}
                            onChange={() => setProtocol(p.id)}
                            className="sr-only"
                          />
                          <span className={`text-lg font-bold ${p.id === 'custom' ? '' : 'num'}`}>
                            {p.id === 'custom' ? t('fasting.protocol.custom') : p.label}
                          </span>
                          {p.id !== 'custom' && (
                            <span className="text-xs text-slate-500">{t(`fasting.protocol.${p.id}`)}</span>
                          )}
                        </label>
                      );
                    })}
                  </div>
                </fieldset>

                {protocol === 'custom' && (
                  <div>
                    <label htmlFor="fasting-custom-hours" className="mb-1 block text-sm font-medium text-slate-700">
                      {t('fasting.protocol.customLabel')}
                    </label>
                    <input
                      id="fasting-custom-hours"
                      type="number"
                      inputMode="decimal"
                      min={MIN_HOURS}
                      max={MAX_HOURS}
                      step="0.5"
                      required
                      value={customHours}
                      onChange={(e) => setCustomHours(e.target.value)}
                      aria-invalid={customHours !== '' && !targetValid}
                      className="num w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-100"
                    />
                  </div>
                )}

                <div>
                  <label htmlFor="fasting-started-at" className="mb-1 block text-sm font-medium text-slate-700">
                    {t('fasting.startedEarlier')}
                  </label>
                  <input
                    id="fasting-started-at"
                    type="datetime-local"
                    value={startedEarlier}
                    max={toLocalInput(new Date())}
                    onChange={(e) => setStartedEarlier(e.target.value)}
                    aria-describedby="fasting-started-at-hint"
                    className="num w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-100"
                  />
                  <p id="fasting-started-at-hint" className="mt-1 text-xs text-slate-400">
                    {t('fasting.startedEarlierHint')}
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={busy !== null || !targetValid}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 py-3.5 font-semibold text-white shadow-md shadow-emerald-200 transition hover:bg-emerald-700 disabled:opacity-50"
                >
                  <Play size={18} aria-hidden="true" />
                  {busy === 'start' ? t('fasting.starting') : t('fasting.start')}
                </button>
              </form>
            )}

            {error && (
              <p role="alert" className="text-sm text-rose-600">
                {error}
              </p>
            )}
          </section>

          {/* Stages */}
          <section aria-labelledby="fasting-stages-heading" className="mt-6 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
            <h2 id="fasting-stages-heading" className="mb-4 font-semibold text-slate-900">
              {t('fasting.stages.title')}
            </h2>
            <ol className="flex flex-col gap-3">
              {STAGES.map((s, i) => {
                const current = !!active && i === stageIdx;
                const passed = !!active && i < stageIdx;
                return (
                  <li
                    key={s.key}
                    aria-current={current ? 'step' : undefined}
                    className={`flex items-start gap-3 rounded-xl p-3 ${
                      current ? 'bg-emerald-50 ring-1 ring-emerald-200' : ''
                    }`}
                  >
                    <span
                      className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                        current
                          ? 'bg-emerald-600 text-white'
                          : passed
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-slate-100 text-slate-400'
                      }`}
                      aria-hidden="true"
                    >
                      {passed ? <CheckCircle2 size={14} /> : <span className="num">{i + 1}</span>}
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-slate-800">
                        {t(`fasting.stage.${s.key}.name`)}{' '}
                        <span className="text-xs font-normal text-slate-400">
                          ({t('fasting.stage.from', { hours: s.from })})
                        </span>
                      </p>
                      <p className="text-xs text-slate-500">{t(`fasting.stage.${s.key}.desc`)}</p>
                    </div>
                  </li>
                );
              })}
            </ol>
            <p className="mt-4 flex items-start gap-2 rounded-xl bg-slate-50 p-3 text-xs text-slate-500">
              <Info size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
              {t('fasting.disclaimer')}
            </p>
          </section>

          {/* Stats */}
          {stats && (
            <section aria-label={t('fasting.stats.title')} className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
              <StatCard
                label={t('fasting.stats.completed')}
                value={stats.totalCompleted}
                icon={<Trophy size={18} aria-hidden="true" />}
                color="emerald"
              />
              <StatCard
                label={t('fasting.stats.streak')}
                value={stats.currentStreakDays}
                unit={t('fasting.days')}
                icon={<Flame size={18} aria-hidden="true" />}
                color="amber"
              />
              <StatCard
                label={t('fasting.stats.longest')}
                value={formatHours(stats.longestHours)}
                unit={t('fasting.hoursShort')}
                icon={<Hourglass size={18} aria-hidden="true" />}
                color="violet"
              />
              <StatCard
                label={t('fasting.stats.average')}
                value={stats.averageHours === null ? '—' : formatHours(stats.averageHours)}
                unit={stats.averageHours === null ? undefined : t('fasting.hoursShort')}
                icon={<Clock size={18} aria-hidden="true" />}
                color="sky"
              />
            </section>
          )}

          {/* History */}
          <section aria-labelledby="fasting-history-heading" className="mt-6">
            <h2 id="fasting-history-heading" className="mb-3 font-semibold text-slate-900">
              {t('fasting.history.title')}
            </h2>
            {history.length === 0 ? (
              <EmptyState icon={<Timer size={26} />} text={t('fasting.history.empty')} />
            ) : (
              <ul className="divide-y divide-slate-100 rounded-2xl bg-white px-5 shadow-sm ring-1 ring-slate-100">
                {history.map((f) => (
                  <li key={f.id} className="flex items-center justify-between gap-3 py-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <span
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                          f.completed ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'
                        }`}
                        aria-hidden="true"
                      >
                        {f.completed ? <CheckCircle2 size={16} /> : <Timer size={16} />}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-800">
                          {formatDateTime(f.started_at)}
                        </p>
                        <p className="text-xs text-slate-500">
                          {t('fasting.history.duration', {
                            duration: formatHours(f.duration_hours ?? 0),
                            target: formatHours(f.target_hours),
                          })}
                          <span
                            className={`ms-2 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                              f.completed ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                            }`}
                          >
                            {f.completed ? t('fasting.history.completed') : t('fasting.history.early')}
                          </span>
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDelete(f)}
                      aria-label={t('fasting.deleteFast', { date: formatDate(f.started_at) })}
                      className="shrink-0 rounded-lg p-2 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                    >
                      <Trash2 size={16} aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
};

export default FastingPage;
