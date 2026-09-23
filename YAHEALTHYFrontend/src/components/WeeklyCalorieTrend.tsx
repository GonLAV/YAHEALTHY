import { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, ReferenceLine, Cell } from 'recharts';
import { CalendarDays } from 'lucide-react';
import { foodLogApi } from '@/services/api';
import { useLanguage } from '@/i18n/LanguageContext';
import ChartCard, { TICK_STYLE, useAxisDate } from '@/components/ui/ChartCard';
import EmptyState from '@/components/ui/EmptyState';
import { COLOR } from '@/theme';

/**
 * The last seven days of logged calories.
 *
 * The dashboard could only answer "what did I eat today". It could not answer
 * "is this going anywhere", which is the question that decides whether somebody
 * keeps using a tracking app. This is the smallest honest answer to it.
 *
 * Deliberately past-facing and deliberately flat in tone. It shows days the
 * person logged, with a line at their own target if they set one. It does not
 * project, does not grade a day red or green, and does not say whether a number
 * is good — those are clinical judgements, and docs/nutrition tells us the
 * formulas underneath them are not verified. A bar is a bar.
 */

const localDateKey = (d: Date) => {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
};

// Enough days to be a shape rather than noise. One or two bars is not a trend,
// and showing it as one is the most discouraging thing a new user could meet.
const MIN_DAYS_WITH_DATA = 3;

type Day = { date: string; calories: number; logged: boolean };

export const WeeklyCalorieTrend = ({ target }: { target: number | null }) => {
  const { t } = useLanguage();
  const axisDate = useAxisDate();
  const [days, setDays] = useState<Day[] | null>(null);

  useEffect(() => {
    let cancelled = false;

    foodLogApi
      .getRangeSummary(localDateKey(daysAgo(6)), localDateKey(new Date()))
      .then((res) => {
        if (cancelled) return;
        setDays(
          (res.data.days ?? []).map((d) => ({
            date: d.date,
            calories: Math.round(d.totals.calories || 0),
            logged: (d.count ?? 0) > 0,
          })),
        );
      })
      .catch(() => { if (!cancelled) setDays([]); });

    return () => { cancelled = true; };
  }, []);

  if (days === null) {
    return <div className="h-64 animate-pulse rounded-2xl bg-slate-100" />;
  }

  const loggedDays = days.filter((d) => d.logged);

  if (loggedDays.length < MIN_DAYS_WITH_DATA) {
    return <EmptyState icon={<CalendarDays size={26} />} text={t('trend.needMoreDays')} />;
  }

  const average = Math.round(
    loggedDays.reduce((s, d) => s + d.calories, 0) / loggedDays.length,
  );

  // Headroom so the target line is never flush against the top edge.
  const peak = Math.max(...days.map((d) => d.calories), target ?? 0);
  const yMax = Math.ceil((peak * 1.15) / 100) * 100;

  return (
    <ChartCard
      title={t('trend.title')}
      aside={
        <span>
          {t('trend.average')} <span className="num font-semibold text-slate-600">{average}</span>{' '}
          {t('common.kcal')}
        </span>
      }
      footer={t('trend.daysLogged', { n: loggedDays.length })}
      height={200}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={days} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
          <XAxis
            dataKey="date"
            tickFormatter={axisDate.weekday}
            tick={TICK_STYLE}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            domain={[0, yMax]}
            tick={TICK_STYLE}
            axisLine={false}
            tickLine={false}
            width={48}
          />

          {/* The person's own number, when they have set one. No line at all
              rather than a line at some default — an invented denominator is
              exactly what this dashboard was doing before. */}
          {target != null && (
            <ReferenceLine
              y={target}
              stroke={COLOR.muted}
              strokeDasharray="4 4"
              label={{ value: String(target), position: 'insideTopRight', ...TICK_STYLE }}
            />
          )}

          <Bar dataKey="calories" radius={[6, 6, 0, 0]} isAnimationActive={false}>
            {days.map((d) => (
              /* A day with nothing logged is drawn hollow rather than as a
                 zero-calorie day. "I didn't log" and "I ate nothing" are not
                 the same fact and the chart should not merge them. */
              <Cell key={d.date} fill={d.logged ? COLOR.brand : COLOR.track} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
};

export default WeeklyCalorieTrend;
