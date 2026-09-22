import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Flame, UtensilsCrossed, Droplets, Moon, Salad, Trophy, Medal,
  Plus, Dumbbell, Beef, Wheat, Croissant,
} from 'lucide-react';
import { foodLogApi, hydrationApi, sleepApi, targetsApi, streakApi, badgesApi, Badge } from '@/services/api';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/i18n/LanguageContext';
import ProgressRing from '@/components/ui/ProgressRing';
import ProgressBar from '@/components/ui/ProgressBar';

const BADGE_ICONS: Record<string, JSX.Element> = {
  'first-log': <Salad size={22} />,
  'week-streak': <Flame size={22} />,
  'month-streak': <Trophy size={22} />,
  century: <Medal size={22} />,
};

const MACRO_STYLES = {
  protein: { icon: <Beef size={17} />, color: 'bg-rose-500', text: 'text-rose-600', bg: 'bg-rose-100' },
  carbs: { icon: <Wheat size={17} />, color: 'bg-sky-500', text: 'text-sky-600', bg: 'bg-sky-100' },
  fat: { icon: <Croissant size={17} />, color: 'bg-amber-500', text: 'text-amber-600', bg: 'bg-amber-100' },
};

interface DashboardData {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  targets: { calories: number | null; protein_grams: number | null; carbs_grams: number | null; fat_grams: number | null };
  streak: { currentStreak: number; longestStreak: number } | null;
  badges: Badge[];
  waterLiters: number;
  sleepHours: number | null;
  recentMeals: { id: string; name: string; calories: number; meal_type?: string }[];
}

export const DashboardPage = () => {
  const { user } = useAuth();
  const { t, lang } = useLanguage();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const today = new Date().toISOString().split('T')[0];
      const results = await Promise.allSettled([
        foodLogApi.getStats({ startDate: today, endDate: today }),
        targetsApi.get(),
        streakApi.get(),
        badgesApi.get(),
        hydrationApi.getAll({ date: today }),
        sleepApi.getAll({ date: today }),
        foodLogApi.getAll({ date: today }),
      ]);

      const [statsRes, targetsRes, streakRes, badgesRes, waterRes, sleepRes, mealsRes] = results;

      const stats: any = statsRes.status === 'fulfilled' ? statsRes.value.data : {};
      const targets = targetsRes.status === 'fulfilled'
        ? targetsRes.value.data?.targets
        : { calories: null, protein_grams: null, carbs_grams: null, fat_grams: null };
      const streak = streakRes.status === 'fulfilled' ? streakRes.value.data : null;
      const badges = badgesRes.status === 'fulfilled' ? badgesRes.value.data?.badges ?? [] : [];
      const waterLogs = waterRes.status === 'fulfilled' ? waterRes.value.data ?? [] : [];
      const sleepLogs = sleepRes.status === 'fulfilled' ? sleepRes.value.data ?? [] : [];
      const meals = mealsRes.status === 'fulfilled' ? mealsRes.value.data ?? [] : [];

      const waterLiters = waterLogs.reduce((sum: number, log: any) => sum + (log.liters_consumed || 0), 0);
      const sleepHours = sleepLogs.length > 0 ? sleepLogs.reduce((s: number, l: any) => s + (l.sleep_hours || 0), 0) : null;

      setData({
        calories: stats.total_calories || 0,
        protein: stats.total_protein || 0,
        carbs: stats.total_carbs || 0,
        fat: stats.total_fat || 0,
        targets,
        streak,
        badges,
        waterLiters,
        sleepHours,
        recentMeals: meals.slice(0, 4),
      });
      setLoading(false);
    };
    load();
  }, []);

  const today = new Date();
  const dateStr = today.toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-US', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-emerald-200 border-t-emerald-600" />
      </div>
    );
  }

  const calorieTarget = data?.targets.calories;
  const caloriePct = calorieTarget ? Math.round(((data?.calories ?? 0) / calorieTarget) * 100) : null;

  const macros = [
    { key: 'protein', label: t('dash.protein'), value: data?.protein ?? 0, target: data?.targets.protein_grams },
    { key: 'carbs', label: t('dash.carbs'), value: data?.carbs ?? 0, target: data?.targets.carbs_grams },
    { key: 'fat', label: t('dash.fat'), value: data?.fat ?? 0, target: data?.targets.fat_grams },
  ] as const;

  return (
    <div className="mx-auto max-w-6xl p-4 md:p-8">
      {/* Greeting */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 md:text-3xl">
          {t('dash.greeting')}{user?.email ? '' : ''}
        </h1>
        <p className="mt-1 text-sm text-slate-500">{dateStr}</p>
      </div>

      {/* Top grid: calorie ring + macros */}
      <div className="grid gap-6 lg:grid-cols-5">
        {/* Calories card */}
        <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-100 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-semibold text-slate-900">{t('dash.overview')}</h2>
            <span className="text-xs font-medium text-slate-400">{t('dash.calories')}</span>
          </div>
          <div className="flex flex-col items-center gap-4">
            <ProgressRing
              value={data?.calories ?? 0}
              target={calorieTarget ?? 2000}
              color={caloriePct && caloriePct > 100 ? '#e11d48' : '#059669'}
            >
              <span className="num text-3xl font-extrabold text-slate-900">{data?.calories ?? 0}</span>
              <span className="text-xs font-medium text-slate-400">
                {calorieTarget ? `/ ${calorieTarget}` : t('dash.noTargets')}
              </span>
            </ProgressRing>
            {caloriePct !== null && (
              <p className={`num text-sm font-semibold ${caloriePct > 100 ? 'text-rose-600' : 'text-emerald-600'}`}>
                {caloriePct}% {t('common.of')} {t('common.target')}
              </p>
            )}
          </div>
        </div>

        {/* Macros + streak */}
        <div className="space-y-4 lg:col-span-3">
          {macros.map((m) => {
            const style = MACRO_STYLES[m.key];
            return (
              <div key={m.key} className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${style.bg} ${style.text}`}>
                      {style.icon}
                    </span>
                    <span className="font-medium text-slate-700">{m.label}</span>
                  </div>
                  <span className="num text-sm font-semibold text-slate-500">
                    <span className="text-slate-900">{Math.round(m.value)}</span>
                    {m.target ? ` / ${Math.round(m.target)}${t('common.grams')}` : t('common.grams')}
                  </span>
                </div>
                <ProgressBar value={m.value} target={m.target ?? 0} color={style.color} />
              </div>
            );
          })}

          {/* Streak */}
          <div className="flex items-center justify-between rounded-2xl bg-gradient-to-r from-orange-50 to-amber-50 p-5 ring-1 ring-amber-100">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-100 text-amber-600">
                <Flame size={22} />
              </span>
              <div>
                <div className="num text-xl font-bold text-slate-900">{data?.streak?.currentStreak ?? 0}</div>
                <div className="text-xs font-medium text-slate-500">{t('dash.streak')}</div>
              </div>
            </div>
            <p className="num text-xs font-medium text-amber-600">
              {t('dash.longestStreak', { n: data?.streak?.longestStreak ?? 0 })}
            </p>
          </div>
        </div>
      </div>

      {/* Water + Sleep + Badges row */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {/* Water */}
        <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
          <div className="mb-3 flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-100 text-sky-600">
              <Droplets size={18} />
            </span>
            <span className="font-medium text-slate-700">{t('dash.waterToday')}</span>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="num text-2xl font-bold text-slate-900">
              {(data?.waterLiters ?? 0).toFixed(2)}
            </span>
            <span className="text-sm font-medium text-slate-400">{t('common.liters')}</span>
          </div>
          <ProgressBar value={data?.waterLiters ?? 0} target={2.5} color="bg-sky-500" height="h-2" />
        </div>

        {/* Sleep */}
        <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
          <div className="mb-3 flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600">
              <Moon size={18} />
            </span>
            <span className="font-medium text-slate-700">{t('dash.sleepToday')}</span>
          </div>
          {data?.sleepHours != null ? (
            <>
              <div className="flex items-baseline gap-1">
                <span className="num text-2xl font-bold text-slate-900">{data.sleepHours.toFixed(1)}</span>
                <span className="text-sm font-medium text-slate-400">h</span>
              </div>
              <ProgressBar value={data.sleepHours} target={8} color="bg-indigo-500" height="h-2" />
            </>
          ) : (
            <p className="text-sm text-slate-400">{t('dash.noSleepLogged')}</p>
          )}
        </div>

        {/* Badges */}
        <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
          <div className="mb-3 flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-100 text-violet-600">
              <Medal size={18} />
            </span>
            <span className="font-medium text-slate-700">{t('dash.badges')}</span>
          </div>
          {data?.badges?.length ? (
            <div className="flex flex-wrap gap-2">
              {data.badges.map((b) => (
                <div
                  key={b.id}
                  title={t(`badge.${b.id}.desc`)}
                  className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-50 text-violet-600"
                  aria-label={t(`badge.${b.id}.name`)}
                >
                  {BADGE_ICONS[b.id] ?? <Medal size={20} />}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-400">{t('dash.noBadgesYet')}</p>
          )}
        </div>
      </div>

      {/* Quick actions */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <Link
          to="/food-log"
          className="group flex items-center justify-between rounded-2xl bg-emerald-600 p-5 text-white shadow-md shadow-emerald-200 transition hover:bg-emerald-700"
        >
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/20">
              <UtensilsCrossed size={22} />
            </span>
            <div>
              <div className="font-semibold">{t('dash.logFood')}</div>
              <div className="text-xs text-emerald-100">{t('dash.quickActions')}</div>
            </div>
          </div>
          <Plus size={22} className="transition group-hover:rotate-90" />
        </Link>
        <Link
          to="/hydration"
          className="group flex items-center justify-between rounded-2xl bg-sky-600 p-5 text-white shadow-md shadow-sky-200 transition hover:bg-sky-700"
        >
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/20">
              <Droplets size={22} />
            </span>
            <div>
              <div className="font-semibold">{t('dash.addWater')}</div>
              <div className="text-xs text-sky-100">{t('dash.quickActions')}</div>
            </div>
          </div>
          <Plus size={22} className="transition group-hover:rotate-90" />
        </Link>
      </div>

      {/* Recent meals */}
      <div className="mt-6 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
        <div className="mb-4 flex items-center gap-2.5">
          <Dumbbell size={18} className="text-slate-400" />
          <h2 className="font-semibold text-slate-900">{t('dash.recentMeals')}</h2>
        </div>
        {data?.recentMeals?.length ? (
          <ul className="divide-y divide-slate-100">
            {data.recentMeals.map((meal) => (
              <li key={meal.id} className="flex items-center justify-between py-3">
                <div>
                  <div className="font-medium text-slate-800">{meal.name}</div>
                  {meal.meal_type && (
                    <div className="text-xs text-slate-400">{t(`meal.${meal.meal_type}`)}</div>
                  )}
                </div>
                <span className="num text-sm font-semibold text-slate-600">
                  {meal.calories} kcal
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="py-4 text-center text-sm text-slate-400">{t('dash.noMealsYet')}</p>
        )}
      </div>
    </div>
  );
};
