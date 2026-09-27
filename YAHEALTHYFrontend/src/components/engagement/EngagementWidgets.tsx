import { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  Sparkles, Flame, Trophy, UtensilsCrossed, Medal, Droplets, Moon, Star, Crown,
  Scale, TrendingDown, Target, ArrowRight, Activity,
} from 'lucide-react';
import { useLanguage } from '@/i18n/LanguageContext';
import ProgressRing from '@/components/ui/ProgressRing';
import ProgressBar from '@/components/ui/ProgressBar';
import type { EngagementSummary, HabitKey, NextMilestone } from '@/services/api';

export const ACHIEVEMENT_ICONS: Record<string, (size: number) => ReactNode> = {
  sparkles: (s) => <Sparkles size={s} />,
  flame: (s) => <Flame size={s} />,
  trophy: (s) => <Trophy size={s} />,
  utensils: (s) => <UtensilsCrossed size={s} />,
  medal: (s) => <Medal size={s} />,
  droplets: (s) => <Droplets size={s} />,
  moon: (s) => <Moon size={s} />,
  star: (s) => <Star size={s} />,
  crown: (s) => <Crown size={s} />,
  scale: (s) => <Scale size={s} />,
  'trending-down': (s) => <TrendingDown size={s} />,
};

export const achievementIcon = (icon: string | undefined, size = 22) =>
  (icon && ACHIEVEMENT_ICONS[icon]?.(size)) ?? <Medal size={size} />;

export const HABITS: HabitKey[] = ['anyLog', 'food', 'hydration', 'sleep'];

export const HABIT_ICONS: Record<HabitKey, ReactNode> = {
  anyLog: <Activity size={16} />,
  food: <UtensilsCrossed size={16} />,
  hydration: <Droplets size={16} />,
  sleep: <Moon size={16} />,
};

/** Score colour bands (display only). */
export const scoreColor = (score: number) =>
  score >= 75 ? { hex: '#059669', text: 'text-emerald-600', bar: 'bg-emerald-500' }
  : score >= 45 ? { hex: '#d97706', text: 'text-amber-600', bar: 'bg-amber-500' }
  : { hex: '#e11d48', text: 'text-rose-600', bar: 'bg-rose-500' };

/** Accessible progress bar wrapper around the visual ProgressBar. */
export const LabeledProgress = ({
  value, max, label, color, height = 'h-2',
}: { value: number; max: number; label: string; color: string; height?: string }) => (
  <div role="progressbar" aria-valuemin={0} aria-valuemax={max} aria-valuenow={value} aria-label={label}>
    <ProgressBar value={value} target={max} color={color} height={height} />
  </div>
);

export const HealthScoreCard = ({ summary }: { summary: EngagementSummary }) => {
  const { t } = useLanguage();
  const score = summary.healthScore.today;
  const c = scoreColor(score);

  return (
    <section
      aria-labelledby="health-score-title"
      className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-100"
    >
      <div className="mb-4">
        <h2 id="health-score-title" className="font-semibold text-slate-900">{t('eng.scoreTitle')}</h2>
        <p className="text-xs text-slate-500">{t('eng.scoreSubtitle')}</p>
      </div>
      <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start">
        <div className="shrink-0" aria-hidden="true">
          <ProgressRing value={score} target={100} size={140} strokeWidth={12} color={c.hex}>
            <span className={`num text-4xl font-extrabold ${c.text}`}>{score}</span>
            <span className="text-xs font-medium text-slate-400">{t('eng.scoreOutOf')}</span>
          </ProgressRing>
        </div>
        <p className="sr-only">{t('eng.scoreAria', { n: score })}</p>
        <ul className="w-full space-y-3">
          {summary.healthScore.components.map((comp) => {
            const label = t(`eng.component.${comp.key}`);
            return (
              <li key={comp.key}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="font-medium text-slate-700">{label}</span>
                  <span className="text-xs font-semibold text-slate-500">
                    {t('eng.points', { n: comp.points, max: comp.weight })}
                  </span>
                </div>
                <LabeledProgress
                  value={comp.score}
                  max={100}
                  label={`${label}: ${comp.score}%`}
                  color={scoreColor(comp.score).bar}
                />
              </li>
            );
          })}
        </ul>
      </div>
      <p className="mt-4 text-xs text-slate-400">{t('eng.scoreDisclaimer')}</p>
    </section>
  );
};

export const StreaksStrip = ({ summary }: { summary: EngagementSummary }) => {
  const { t } = useLanguage();
  const main = summary.streaks.anyLog;

  const nudge = main.todayDone
    ? { text: t('eng.nudgeDone'), cls: 'bg-emerald-50 text-emerald-700 ring-emerald-100' }
    : main.current > 0
      ? { text: t('eng.nudge', { n: main.current }), cls: 'bg-orange-50 text-orange-700 ring-orange-200' }
      : { text: t('eng.nudgeStart'), cls: 'bg-slate-50 text-slate-600 ring-slate-200' };

  return (
    <section aria-labelledby="streaks-title" className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-100">
      <h2 id="streaks-title" className="mb-4 font-semibold text-slate-900">{t('eng.streaksTitle')}</h2>
      <ul className="grid grid-cols-2 gap-3">
        {HABITS.map((h) => {
          const s = summary.streaks[h];
          const lit = s.current > 0;
          const habit = t(`eng.habit.${h}`);
          return (
            <li
              key={h}
              className={`rounded-2xl p-3 ring-1 ${lit ? 'bg-gradient-to-br from-orange-50 to-amber-50 ring-amber-100' : 'bg-slate-50 ring-slate-100'}`}
            >
              <span className="sr-only">
                {t('eng.streakAria', { habit, n: s.current, best: s.best })}.{' '}
                {s.todayDone ? t('eng.doneToday') : t('eng.notYetToday')}
              </span>
              <div className="flex items-center gap-2 text-xs font-medium text-slate-500" aria-hidden="true">
                {HABIT_ICONS[h]}
                {habit}
              </div>
              <div className="mt-1.5 flex items-center gap-1.5" aria-hidden="true">
                <Flame
                  size={22}
                  className={lit ? 'text-orange-500' : 'text-slate-300'}
                  fill={lit ? 'currentColor' : 'none'}
                />
                <span className="num text-xl font-bold text-slate-900">{s.current}</span>
              </div>
              <div className="mt-1 flex items-center justify-between text-[11px]" aria-hidden="true">
                <span className="text-slate-400">{t('eng.best', { n: s.best })}</span>
                <span className={s.todayDone ? 'text-emerald-600' : 'text-slate-400'}>
                  {s.todayDone ? t('eng.doneToday') : t('eng.notYetToday')}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
      <p role="status" aria-live="polite" className={`mt-4 rounded-xl px-4 py-2.5 text-sm font-medium ring-1 ${nudge.cls}`}>
        {nudge.text}
      </p>
    </section>
  );
};

export const NextMilestoneCard = ({ milestone, showLink = true }: { milestone: NextMilestone; showLink?: boolean }) => {
  const { t } = useLanguage();
  const name = milestone.id ? t(`ach.${milestone.id}.name`) : '';

  return (
    <section
      aria-labelledby="next-milestone-title"
      className="rounded-3xl bg-gradient-to-br from-violet-50 to-emerald-50 p-6 ring-1 ring-violet-100"
    >
      <div className="mb-3 flex items-center gap-2 text-violet-700">
        <Target size={18} aria-hidden="true" />
        <h2 id="next-milestone-title" className="font-semibold">{t('eng.nextMilestone')}</h2>
      </div>
      {milestone.id ? (
        <>
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-violet-600 shadow-sm" aria-hidden="true">
              {achievementIcon(milestone.icon)}
            </span>
            <div className="min-w-0">
              <div className="font-semibold text-slate-900">{name}</div>
              <div className="text-xs text-slate-500">{t(`ach.${milestone.id}.desc`)}</div>
            </div>
          </div>
          <div className="mt-4">
            <LabeledProgress
              value={milestone.current ?? 0}
              max={milestone.target ?? 1}
              label={t('ach.progressAria', { name, current: milestone.current ?? 0, target: milestone.target ?? 1 })}
              color="bg-violet-500"
            />
            <div className="mt-1.5 flex justify-between text-xs text-slate-500">
              <span>{t('ach.progress', { current: milestone.current ?? 0, target: milestone.target ?? 1 })}</span>
              <span className="font-semibold text-violet-700">{t('eng.remaining', { n: milestone.remaining ?? 0 })}</span>
            </div>
          </div>
        </>
      ) : (
        <p className="text-sm text-slate-600">{t('eng.allDone')}</p>
      )}
      {showLink && (
        <Link
          to="/achievements"
          className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-violet-700 hover:text-violet-900"
        >
          {t('eng.viewAll')}
          <ArrowRight size={16} className="rtl:rotate-180" aria-hidden="true" />
        </Link>
      )}
    </section>
  );
};
