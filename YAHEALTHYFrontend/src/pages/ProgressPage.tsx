import { useEffect, useMemo, useState } from 'react';
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { BarChart3 } from 'lucide-react';
import {
  foodLogApi, hydrationApi, sleepApi, weightApi,
  FoodLog, HydrationLog, SleepLog, WeightLog,
} from '@/services/api';
import { useLanguage } from '@/i18n/LanguageContext';
import PageHeader from '@/components/ui/PageHeader';
import EmptyState from '@/components/ui/EmptyState';

const DAY_MS = 24 * 60 * 60 * 1000;
const RANGE_DAYS = 14;

const MACRO_COLORS = ['#10b981', '#3b82f6', '#f59e0b'];

// Local dates, not UTC — the server stores date strings as entered locally.
const localIso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const ChartCard = ({
  title,
  summary,
  children,
}: {
  title: string;
  summary: string;
  children: React.ReactNode;
}) => (
  <section
    className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6"
    aria-label={title}
  >
    <h2 className="mb-4 text-base font-semibold text-slate-900">{title}</h2>
    <figure>
      <div role="img" aria-label={title} className="h-64">
        {children}
      </div>
      <figcaption className="sr-only">{summary}</figcaption>
    </figure>
  </section>
);

interface DailyPoint {
  key: string;
  label: string;
  calories: number;
  liters: number;
  sleepHours: number;
}

export const ProgressPage = () => {
  const { t, lang } = useLanguage();
  const [daily, setDaily] = useState<DailyPoint[]>([]);
  const [weightSeries, setWeightSeries] = useState<{ label: string; weight: number }[]>([]);
  const [macros, setMacros] = useState<{ name: string; value: number }[]>([]);
  const [hasFood, setHasFood] = useState(false);
  const [hasHydration, setHasHydration] = useState(false);
  const [hasSleep, setHasSleep] = useState(false);
  const [hasWeight, setHasWeight] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const dayLabel = useMemo(() => {
    const fmt = new Intl.DateTimeFormat(lang === 'he' ? 'he-IL' : 'en-GB', {
      day: 'numeric',
      month: 'numeric',
    });
    return (d: Date) => fmt.format(d);
  }, [lang]);

  useEffect(() => {
    const load = async () => {
      try {
        const [foodRes, hydrationRes, sleepRes, weightRes] = await Promise.all([
          foodLogApi.getAll(),
          hydrationApi.getAll(),
          sleepApi.getAll(),
          weightApi.getLogs(),
        ]);

        const foods: FoodLog[] = foodRes.data || [];
        const hydration: HydrationLog[] = hydrationRes.data || [];
        const sleep: SleepLog[] = sleepRes.data || [];
        const weights: WeightLog[] = weightRes.data || [];

        // Day buckets for the range window
        const byKey = new Map<string, { calories: number; liters: number; sleepHours: number }>();
        for (let i = 0; i < RANGE_DAYS; i++) {
          const d = new Date(Date.now() - i * DAY_MS);
          byKey.set(localIso(d), { calories: 0, liters: 0, sleepHours: 0 });
        }
        const inWindow = (date: string) => byKey.has(String(date || '').slice(0, 10));

        const add = (date: string, field: 'calories' | 'liters' | 'sleepHours', value: number) => {
          const key = String(date || '').slice(0, 10);
          const bucket = byKey.get(key);
          if (bucket) bucket[field] += value || 0;
        };

        foods.forEach((l) => add(l.date, 'calories', l.calories || 0));
        hydration.forEach((l) => add(l.date, 'liters', l.liters_consumed || 0));
        sleep.forEach((l) => add(l.date, 'sleepHours', l.sleep_hours || 0));

        // Oldest → newest for the charts
        const points: DailyPoint[] = [];
        for (let i = RANGE_DAYS - 1; i >= 0; i--) {
          const d = new Date(Date.now() - i * DAY_MS);
          const key = localIso(d);
          const bucket = byKey.get(key)!;
          points.push({
            key,
            label: dayLabel(d),
            calories: Math.round(bucket.calories),
            liters: Math.round(bucket.liters * 10) / 10,
            sleepHours: Math.round(bucket.sleepHours * 10) / 10,
          });
        }
        setDaily(points);

        // Weight trend — every log with a usable date, oldest first
        const weightPoints = weights
          .map((w) => ({ date: String(w.date || w.created_at || '').slice(0, 10), weight: w.weight_kg }))
          .filter((w) => w.date)
          .sort((a, b) => a.date.localeCompare(b.date))
          .map((w) => ({
            label: dayLabel(new Date(`${w.date}T00:00:00`)),
            weight: w.weight,
          }));
        setWeightSeries(weightPoints);

        // Macros totals over the window
        const windowFoods = foods.filter((l) => inWindow(l.date));
        const protein = windowFoods.reduce((s, l) => s + (l.protein_grams || 0), 0);
        const carbs = windowFoods.reduce((s, l) => s + (l.carbs_grams || 0), 0);
        const fats = windowFoods.reduce((s, l) => s + (l.fat_grams || 0), 0);
        setMacros([
          { name: t('progress.protein'), value: Math.round(protein) },
          { name: t('progress.carbs'), value: Math.round(carbs) },
          { name: t('progress.fats'), value: Math.round(fats) },
        ]);

        setHasFood(foods.length > 0);
        setHasHydration(hydration.length > 0);
        setHasSleep(sleep.length > 0);
        setHasWeight(weightPoints.length > 0);
      } catch (err) {
        console.error('Failed to load progress data:', err);
        setError(t('common.error'));
      } finally {
        setLoading(false);
      }
    };
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);

  if (loading) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex min-h-[50vh] items-center justify-center"
      >
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-emerald-200 border-t-emerald-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <p role="alert" className="rounded-xl bg-rose-50 p-4 text-sm text-rose-700">
          {error}
        </p>
      </div>
    );
  }

  const noDataAtAll = !hasFood && !hasHydration && !hasSleep && !hasWeight;

  const loggedDays = daily.filter((d) => d.calories > 0).length;
  const avgCalories = loggedDays
    ? Math.round(daily.reduce((s, d) => s + d.calories, 0) / loggedDays)
    : 0;
  const totalLiters = Math.round(daily.reduce((s, d) => s + d.liters, 0) * 10) / 10;
  const avgSleep = hasSleep
    ? Math.round((daily.reduce((s, d) => s + d.sleepHours, 0) / RANGE_DAYS) * 10) / 10
    : 0;
  const weightSummary = weightSeries.length
    ? `${weightSeries[0].weight} → ${weightSeries[weightSeries.length - 1].weight} ${t('common.kg')}`
    : '';
  const macrosSummary = macros
    .map((m) => `${m.name}: ${m.value} ${t('common.grams')}`)
    .join(', ');

  const noChartData = (
    <p className="flex h-full items-center justify-center px-6 text-center text-sm text-slate-400">
      {t('progress.noData')}
    </p>
  );

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        title={t('progress.title')}
        subtitle={t('progress.subtitle')}
        icon={<BarChart3 size={24} />}
      />

      {noDataAtAll ? (
        <EmptyState icon={<BarChart3 size={28} />} text={t('progress.noData')} />
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <ChartCard
            title={t('progress.calories')}
            summary={`${t('progress.avgPerDay')}: ${avgCalories} ${t('progress.kcal')}`}
          >
            {hasFood ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={daily}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                  <YAxis dir="ltr" />
                  <Tooltip />
                  <Line
                    type="monotone"
                    dataKey="calories"
                    name={t('progress.calories')}
                    stroke="#10b981"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              noChartData
            )}
          </ChartCard>

          <ChartCard
            title={t('progress.hydration')}
            summary={`${totalLiters} ${t('common.liters')}`}
          >
            {hasHydration ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={daily}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                  <YAxis dir="ltr" />
                  <Tooltip />
                  <Bar
                    dataKey="liters"
                    name={t('progress.hydration')}
                    fill="#0ea5e9"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              noChartData
            )}
          </ChartCard>

          <ChartCard
            title={t('progress.sleep')}
            summary={`${t('progress.avgPerDay')}: ${avgSleep} ${t('progress.hours')}`}
          >
            {hasSleep ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={daily}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                  <YAxis dir="ltr" />
                  <Tooltip />
                  <Bar
                    dataKey="sleepHours"
                    name={t('progress.sleep')}
                    fill="#8b5cf6"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              noChartData
            )}
          </ChartCard>

          <ChartCard title={t('progress.weight')} summary={weightSummary}>
            {hasWeight ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={weightSeries}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                  <YAxis domain={['auto', 'auto']} dir="ltr" />
                  <Tooltip />
                  <Line
                    type="monotone"
                    dataKey="weight"
                    name={t('progress.weight')}
                    stroke="#f59e0b"
                    strokeWidth={2}
                    dot
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              noChartData
            )}
          </ChartCard>

          <ChartCard title={t('progress.macros')} summary={macrosSummary}>
            {macros.some((m) => m.value > 0) ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={macros}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={85}
                  >
                    {macros.map((entry, i) => (
                      <Cell key={entry.name} fill={MACRO_COLORS[i % MACRO_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              noChartData
            )}
          </ChartCard>
        </div>
      )}
    </div>
  );
};

export default ProgressPage;
