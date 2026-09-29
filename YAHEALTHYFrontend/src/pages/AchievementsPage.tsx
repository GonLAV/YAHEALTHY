import { useEffect, useState } from 'react';
import { Trophy, Lock, CheckCircle2, Flame, PartyPopper } from 'lucide-react';
import { engagementApi, EngagementSummary, Achievement } from '@/services/api';
import { useLanguage } from '@/i18n/LanguageContext';
import PageHeader from '@/components/ui/PageHeader';
import { ShareWeekButton } from '@/components/share/ShareWeek';
import {
  achievementIcon, HABITS, HABIT_ICONS, LabeledProgress, NextMilestoneCard, scoreColor,
} from '@/components/engagement/EngagementWidgets';

const SEEN_KEY = 'yahealthy-seen-achievements';

const readSeen = (): string[] => {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const writeSeen = (ids: string[]) => {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify(ids));
  } catch {
    /* storage unavailable — celebration just repeats next time */
  }
};

export const AchievementsPage = () => {
  const { t, lang } = useLanguage();
  const [data, setData] = useState<EngagementSummary | null>(null);
  const [error, setError] = useState(false);
  const [celebrate, setCelebrate] = useState<Achievement | null>(null);

  useEffect(() => {
    let cancelled = false;
    engagementApi
      .getSummary(lang)
      .then((res) => {
        if (cancelled) return;
        setData(res.data);
        setError(false);
        const unlocked = res.data.achievements.filter((a) => a.unlocked);
        const seen = new Set(readSeen());
        const fresh = unlocked
          .filter((a) => !seen.has(a.id))
          .sort((a, b) => String(b.unlockedAt).localeCompare(String(a.unlockedAt)));
        if (fresh.length) setCelebrate(fresh[0]);
        writeSeen(unlocked.map((a) => a.id));
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [lang]);

  const locale = lang === 'he' ? 'he-IL' : 'en-US';
  const fmtDate = (d: string, opts: Intl.DateTimeFormatOptions) =>
    new Date(`${d}T12:00:00Z`).toLocaleDateString(locale, { timeZone: 'UTC', ...opts });

  if (error) {
    return (
      <div className="mx-auto max-w-5xl p-4 md:p-8">
        <PageHeader title={t('ach.title')} subtitle={t('ach.subtitle')} icon={<Trophy size={24} />} />
        <p role="alert" className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-rose-100">
          {t('eng.loadError')}
        </p>
      </div>
    );
  }

  if (!data) {
    return (
      <div role="status" aria-live="polite" className="flex min-h-[50vh] items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-emerald-200 border-t-emerald-600" />
        <span className="sr-only">{t('eng.loading')}</span>
      </div>
    );
  }

  const trend = data.healthScore.trend7d;
  const trendList = trend
    .map((d) => `${fmtDate(d.date, { weekday: 'short', day: 'numeric', month: 'numeric' })}: ${d.score}`)
    .join(', ');

  return (
    <div className="mx-auto max-w-5xl p-4 md:p-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageHeader title={t('ach.title')} subtitle={t('ach.subtitle')} icon={<Trophy size={24} />} />
        <ShareWeekButton className="mb-6" />
      </div>

      {/* Celebration for newly unlocked achievements */}
      <div role="status" aria-live="polite">
        {celebrate && (
          <div className="mb-6 flex items-center gap-3 rounded-2xl bg-gradient-to-r from-amber-100 to-violet-100 p-4 ring-1 ring-amber-200">
            <span className="celebrate-pop flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white text-amber-600 shadow" aria-hidden="true">
              <PartyPopper size={24} />
            </span>
            <p className="font-semibold text-slate-900">
              {t('ach.newUnlock', { name: t(`ach.${celebrate.id}.name`) })}
            </p>
          </div>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        {/* 7-day score trend */}
        <figure className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-100 lg:col-span-3">
          <h2 className="mb-4 font-semibold text-slate-900">{t('ach.trendTitle')}</h2>
          <div className="flex h-40 items-end justify-between gap-2" aria-hidden="true">
            {trend.map((d) => (
              <div key={d.date} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                <span className="num text-xs font-semibold text-slate-600">{d.score}</span>
                <div
                  className={`w-full max-w-[2.5rem] rounded-t-lg ${scoreColor(d.score).bar} transition-all duration-500`}
                  style={{ height: `${Math.max(4, d.score)}%` }}
                />
                <span className="text-[11px] text-slate-500">{fmtDate(d.date, { weekday: 'short' })}</span>
              </div>
            ))}
          </div>
          <figcaption className="sr-only">{t('ach.trendAlt', { list: trendList })}</figcaption>
        </figure>

        <div className="lg:col-span-2">
          <NextMilestoneCard milestone={data.nextMilestone} showLink={false} />
        </div>
      </div>

      {/* Best streaks */}
      <section aria-labelledby="best-streaks-title" className="mt-6">
        <h2 id="best-streaks-title" className="mb-3 font-semibold text-slate-900">{t('ach.bestStreaks')}</h2>
        <ul className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {HABITS.map((h) => {
            const s = data.streaks[h];
            const habit = t(`eng.habit.${h}`);
            return (
              <li key={h} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
                <span className="sr-only">{t('eng.streakAria', { habit, n: s.current, best: s.best })}</span>
                <div aria-hidden="true">
                  <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
                    {HABIT_ICONS[h]}
                    {habit}
                  </div>
                  <div className="mt-2 flex items-center gap-1.5">
                    <Flame size={20} className={s.best > 0 ? 'text-orange-500' : 'text-slate-300'} fill={s.best > 0 ? 'currentColor' : 'none'} />
                    <span className="num text-2xl font-bold text-slate-900">{s.best}</span>
                  </div>
                  <div className="mt-1 text-xs text-slate-500">{t('ach.current', { n: s.current })}</div>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {/* Badge grid */}
      <section aria-labelledby="badges-title" className="mt-6">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 id="badges-title" className="font-semibold text-slate-900">{t('ach.badges')}</h2>
          <span className="text-sm text-slate-500">
            {t('ach.countSummary', { n: data.unlockedCount, total: data.achievements.length })}
          </span>
        </div>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.achievements.map((a) => {
            const name = t(`ach.${a.id}.name`);
            const status = a.unlocked ? t('ach.unlocked') : t('ach.locked');
            return (
              <li
                key={a.id}
                className={`flex gap-3 rounded-2xl p-4 ring-1 ${
                  a.unlocked ? 'bg-white shadow-sm ring-violet-100' : 'bg-slate-50 ring-slate-100'
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${
                    a.unlocked ? 'bg-violet-100 text-violet-600' : 'bg-slate-200 text-slate-500'
                  } ${celebrate?.id === a.id ? 'celebrate-pop' : ''}`}
                >
                  {achievementIcon(a.icon)}
                  {!a.unlocked && (
                    <span className="absolute -bottom-1 -end-1 flex h-5 w-5 items-center justify-center rounded-full bg-white text-slate-500 shadow">
                      <Lock size={11} />
                    </span>
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold text-slate-900">
                    {name}
                    <span className="sr-only"> — {status}</span>
                  </h3>
                  <p className="text-xs text-slate-500">{t(`ach.${a.id}.desc`)}</p>
                  {a.unlocked && a.unlockedAt ? (
                    <p className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
                      <CheckCircle2 size={14} aria-hidden="true" />
                      {t('ach.unlockedOn', { date: fmtDate(a.unlockedAt, { day: 'numeric', month: 'short', year: 'numeric' }) })}
                    </p>
                  ) : !a.available ? (
                    <p className="mt-2 text-xs text-slate-500">{t('ach.unavailable')}</p>
                  ) : (
                    <div className="mt-2">
                      <LabeledProgress
                        value={a.progress.current}
                        max={a.progress.target}
                        label={t('ach.progressAria', { name, current: a.progress.current, target: a.progress.target })}
                        color="bg-violet-400"
                        height="h-1.5"
                      />
                      <p className="mt-1 text-[11px] text-slate-500">
                        {t('ach.progress', { current: a.progress.current, target: a.progress.target })}
                      </p>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
};

export default AchievementsPage;
