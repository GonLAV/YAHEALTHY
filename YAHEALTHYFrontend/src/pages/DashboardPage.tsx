import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Flame, UtensilsCrossed, Droplets, Moon, Salad, Trophy, Medal,
  Plus, Beef, Wheat, Croissant, AlertCircle, RefreshCw,
} from 'lucide-react';
import {
  foodLogApi, hydrationApi, sleepApi, targetsApi, streakApi, badgesApi,
  Badge, FoodLog, NutritionTargets,
} from '@/services/api';
import { useLanguage } from '@/i18n/LanguageContext';
import ProgressRing from '@/components/ui/ProgressRing';
import ProgressBar from '@/components/ui/ProgressBar';
import EmptyState from '@/components/ui/EmptyState';
import WeeklyCalorieTrend from '@/components/WeeklyCalorieTrend';
import QuickLogTemplates from '@/components/QuickLogTemplates';
import ConsistencyCalendar from '@/components/ConsistencyCalendar';
import MacroSplit from '@/components/MacroSplit';
import MealRhythm from '@/components/MealRhythm';
import PlanStatus from '@/components/PlanStatus';

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

/**
 * Today, in the reader's own timezone.
 *
 * This was `new Date().toISOString().split('T')[0]`, which is UTC. The heading
 * beside it uses toLocaleDateString, which is local — so between midnight and
 * 03:00 in Israel the page announced today's date and fetched yesterday's data.
 * Anything logged after midnight vanished from "today" until morning.
 */
const localDateKey = (d = new Date()) => {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

type Totals = { calories: number; protein: number; carbs: number; fat: number };

/** Matches what LanguageContext hands out, rather than a looser guess at it. */
type TranslateFn = ReturnType<typeof useLanguage>["t"];

interface DashboardData {
  totals: Totals;
  targets: NutritionTargets;
  /** A target exists but is withheld until the formula behind it is approved. */
  targetPending: boolean;
  streak: { currentStreak: number; longestStreak: number } | null;
  badges: Badge[];
  waterLiters: number;
  sleepHours: number | null;
  recentMeals: FoodLog[];
  /** All of today, for the per-meal breakdown. recentMeals is only the last four. */
  todayLogs: FoodLog[];
  /** How many things the user has ever logged today. Drives the day-one screen. */
  loggedToday: number;
}

const EMPTY_TARGETS: NutritionTargets = {
  calories: null, protein_grams: null, carbs_grams: null, fat_grams: null,
};

/** A number, isolated from the Hebrew around it. Never wrap a sentence in this. */
const Num = ({ children }: { children: React.ReactNode }) => (
  <span className="num">{children}</span>
);

const Card = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <div className={`rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100 ${className}`}>
    {children}
  </div>
);

const CardHeading = ({ icon, bg, text, children }: {
  icon: React.ReactNode; bg: string; text: string; children: React.ReactNode;
}) => (
  <div className="mb-3 flex items-center gap-2.5">
    <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${bg} ${text}`}>{icon}</span>
    <span className="font-medium text-slate-700">{children}</span>
  </div>
);

const Skeleton = ({ className = '' }: { className?: string }) => (
  <div className={`animate-pulse rounded-lg bg-slate-100 ${className}`} />
);

export const DashboardPage = () => {
  const { t, lang } = useLanguage();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    const today = localDateKey();

    const results = await Promise.allSettled([
      foodLogApi.getDaySummary(today),
      targetsApi.get(),
      streakApi.get(),
      badgesApi.get(),
      hydrationApi.getAll({ date: today }),
      sleepApi.getAll({ date: today }),
      foodLogApi.getAll({ date: today }),
    ]);

    const [summaryRes, targetsRes, streakRes, badgesRes, waterRes, sleepRes, mealsRes] = results;

    // A failed request is not a zero. Before this, every rejection fell through
    // to a default and the page rendered a flawless day-one dashboard — so a
    // returning user with a twelve-day streak saw zeros during an outage and
    // could only conclude their data was gone. The two states are now
    // distinguishable, and the distinction is the whole point.
    const criticalFailed =
      summaryRes.status === 'rejected' && mealsRes.status === 'rejected';

    if (criticalFailed) {
      setFailed(true);
      setLoading(false);
      return;
    }

    const summary = summaryRes.status === 'fulfilled' ? summaryRes.value.data : null;
    const meals: FoodLog[] = mealsRes.status === 'fulfilled' ? mealsRes.value.data ?? [] : [];

    // Prefer the server's own totals; fall back to summing the raw logs the
    // page already holds rather than showing zero because one call failed.
    const totals: Totals = summary
      ? {
          calories: summary.totals.calories,
          protein: summary.totals.protein_grams,
          carbs: summary.totals.carbs_grams,
          fat: summary.totals.fat_grams,
        }
      : meals.reduce<Totals>(
          (acc, m) => ({
            calories: acc.calories + (m.calories || 0),
            protein: acc.protein + (m.protein_grams || 0),
            carbs: acc.carbs + (m.carbs_grams || 0),
            fat: acc.fat + (m.fat_grams || 0),
          }),
          { calories: 0, protein: 0, carbs: 0, fat: 0 },
        );

    const targetsBody = targetsRes.status === 'fulfilled' ? targetsRes.value.data : null;
    const waterLogs = waterRes.status === 'fulfilled' ? waterRes.value.data ?? [] : [];
    const sleepLogs = sleepRes.status === 'fulfilled' ? sleepRes.value.data ?? [] : [];

    setData({
      totals,
      targets: targetsBody?.targets ?? EMPTY_TARGETS,
      targetPending: Boolean(targetsBody?.withheldPendingApproval),
      streak: streakRes.status === 'fulfilled' ? streakRes.value.data : null,
      badges: badgesRes.status === 'fulfilled' ? badgesRes.value.data?.badges ?? [] : [],
      waterLiters: waterLogs.reduce((s: number, l: any) => s + (l.liters_consumed || 0), 0),
      sleepHours: sleepLogs.length
        ? sleepLogs.reduce((s: number, l: any) => s + (l.sleep_hours || 0), 0)
        : null,
      recentMeals: meals.slice(0, 4),
      todayLogs: meals,
      loggedToday: summary?.count ?? meals.length,
    });
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const dateStr = new Date().toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-US', {
    weekday: 'long', day: 'numeric', month: 'long',
  });

  const header = (
    <div className="mb-6">
      <h1 className="text-2xl font-bold text-slate-900 md:text-3xl">{t('dash.greeting')}</h1>
      <p className="mt-1 text-sm text-slate-500">{dateStr}</p>
    </div>
  );

  // ── the request failed ──────────────────────────────────────────────────
  if (failed) {
    return (
      <div className="mx-auto max-w-6xl p-4 md:p-8">
        {header}
        <Card className="flex flex-col items-center gap-4 py-10 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-50 text-rose-500">
            <AlertCircle size={26} />
          </span>
          <div>
            <p className="font-semibold text-slate-900">{t('dash.loadFailed')}</p>
            {/* Said plainly, because the alternative reading is "my data is gone". */}
            <p className="mt-1 max-w-sm text-sm text-slate-500">{t('dash.loadFailedHint')}</p>
          </div>
          <button
            onClick={load}
            className="flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700"
          >
            <RefreshCw size={16} />
            {t('common.retry')}
          </button>
        </Card>
      </div>
    );
  }

  // ── first load ──────────────────────────────────────────────────────────
  // The shell renders immediately. Only the numbers wait, because only the
  // numbers need the network — the greeting, the date and the quick actions
  // used to sit behind seven round trips that returned nothing anyway.
  if (loading && !data) {
    return (
      <div className="mx-auto max-w-6xl p-4 md:p-8">
        {header}
        <div className="grid gap-6 lg:grid-cols-5">
          <Card className="lg:col-span-2"><Skeleton className="mx-auto h-44 w-44 rounded-full" /></Card>
          <div className="space-y-4 lg:col-span-3">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        </div>
        <QuickActions t={t} />
      </div>
    );
  }

  // ── day one ─────────────────────────────────────────────────────────────
  // Not the same layout with zeros in it. A zero nobody asked for reads as
  // failure; an absence you were invited to fill reads as an invitation. The
  // old screen showed seven zeros, an empty ring, three flat bars and a
  // personal record of 0 before the person had done anything at all.
  if (data && data.loggedToday === 0 && !data.streak?.currentStreak) {
    return (
      <div className="mx-auto max-w-6xl p-4 md:p-8">
        {header}
        <Card className="flex flex-col items-center gap-5 py-12 text-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
            <UtensilsCrossed size={30} />
          </span>
          <div>
            <p className="text-lg font-semibold text-slate-900">{t('dash.firstDayTitle')}</p>
            <p className="mx-auto mt-2 max-w-sm text-sm text-slate-500">{t('dash.firstDayBody')}</p>
          </div>
          <Link
            to="/food-log"
            className="flex items-center gap-2 rounded-2xl bg-emerald-600 px-6 py-3 font-semibold text-white shadow-md shadow-emerald-200 transition hover:bg-emerald-700"
          >
            <Plus size={20} />
            {t('dash.firstDayCta')}
          </Link>
        </Card>
      </div>
    );
  }

  const targets = data?.targets ?? EMPTY_TARGETS;
  const calorieTarget = targets.calories;
  const caloriePct = calorieTarget
    ? Math.round(((data?.totals.calories ?? 0) / calorieTarget) * 100)
    : null;

  const macros = [
    { key: 'protein', label: t('dash.protein'), value: data?.totals.protein ?? 0, target: targets.protein_grams },
    { key: 'carbs', label: t('dash.carbs'), value: data?.totals.carbs ?? 0, target: targets.carbs_grams },
    { key: 'fat', label: t('dash.fat'), value: data?.totals.fat ?? 0, target: targets.fat_grams },
  ] as const;

  return (
    <div className="mx-auto max-w-6xl p-4 md:p-8">
      {header}

      <div className="grid gap-6 lg:grid-cols-5">
        {/* Calories */}
        <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-100 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-semibold text-slate-900">{t('dash.overview')}</h2>
            <span className="text-xs font-medium text-slate-400">{t('dash.calories')}</span>
          </div>
          <div className="flex flex-col items-center gap-4">
            <ProgressRing
              value={data?.totals.calories ?? 0}
              /* No invented denominator. It used to fall back to 2000 kcal
                 while the caption read "no targets" — the ring was measuring
                 against a number the app made up for a body it knows nothing
                 about. With no target the ring now shows the intake alone. */
              target={calorieTarget ?? 0}
              color={caloriePct && caloriePct > 100 ? '#e11d48' : '#059669'}
            >
              <Num>
                <span className="text-3xl font-extrabold text-slate-900">
                  {Math.round(data?.totals.calories ?? 0)}
                </span>
              </Num>
              <span className="text-xs font-medium text-slate-400">
                {calorieTarget ? (
                  <Num>{`/ ${calorieTarget}`}</Num>
                ) : data?.targetPending ? (
                  /* Two different sentences, and the screen used to give the
                     first for both: "you haven't set targets", when in fact a
                     computed target exists and is being withheld because the
                     formula behind it has no clinical sign-off. Not a link —
                     there is nothing the person can do about this one. */
                  t('dash.targetPending')
                ) : (
                  /* Now it goes somewhere. This caption used to read "set your
                     targets for accurate tracking" and there was no screen to
                     set them on. */
                  <Link to="/targets" className="underline decoration-dotted underline-offset-2 hover:text-emerald-600">
                    {t('dash.noTarget')}
                  </Link>
                )}
              </span>
            </ProgressRing>
            {caloriePct !== null && (
              <p className={`text-sm font-semibold ${caloriePct > 100 ? 'text-rose-600' : 'text-emerald-600'}`}>
                {/* .num goes around the number only. It used to wrap the whole
                    phrase, which forced the Hebrew to LTR and pushed the
                    percentage to the wrong edge of the line. */}
                <Num>{caloriePct}%</Num> {t('common.of')} {t('common.target')}
              </p>
            )}
          </div>
        </div>

        {/* Macros + streak */}
        <div className="space-y-4 lg:col-span-3">
          {macros.map((m) => {
            const style = MACRO_STYLES[m.key];
            return (
              <Card key={m.key}>
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${style.bg} ${style.text}`}>
                      {style.icon}
                    </span>
                    <span className="font-medium text-slate-700">{m.label}</span>
                  </div>
                  <span className="text-sm font-semibold text-slate-500">
                    <Num>
                      <span className="text-slate-900">{Math.round(m.value)}</span>
                      {m.target ? ` / ${Math.round(m.target)}` : ''}
                    </Num>
                    {' '}{t('common.grams')}
                  </span>
                </div>
                <ProgressBar value={m.value} target={m.target ?? 0} color={style.color} />
              </Card>
            );
          })}

          <div className="flex items-center justify-between rounded-2xl bg-gradient-to-r from-orange-50 to-amber-50 p-5 ring-1 ring-amber-100">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-100 text-amber-600">
                <Flame size={22} />
              </span>
              <div>
                <Num><span className="text-xl font-bold text-slate-900">{data?.streak?.currentStreak ?? 0}</span></Num>
                <div className="text-xs font-medium text-slate-500">{t('dash.streak')}</div>
              </div>
            </div>
            {/* Was wrapped in .num as a whole. 'שיא: {n} ימים' forced to LTR
                renders backwards for a Hebrew reader — the sentence arrived
                last word first. Only the count is isolated now. */}
            <p className="text-xs font-medium text-amber-600">
              {t('dash.longestStreak', { n: data?.streak?.longestStreak ?? 0 })}
            </p>
          </div>
        </div>
      </div>

      {/* Seven days back. The dashboard could only answer "what did I eat
          today"; this is the smallest honest answer to "is this going
          anywhere". Past-facing only — no projection, no verdict. */}
      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <WeeklyCalorieTrend target={calorieTarget} />
        </div>
        {/* Needs no target to mean something, which the three macro bars above
            do — so on day one this is the only macro reading that says
            anything at all. */}
        <MacroSplit
          protein={data?.totals.protein ?? 0}
          carbs={data?.totals.carbs ?? 0}
          fat={data?.totals.fat ?? 0}
        />
      </div>

      {/* Evidence for the streak number, and a broken streak shown as one pale
          square rather than a counter back at zero. */}
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <ConsistencyCalendar />
        </div>
        {/* Where the day actually went. The recent-meals list shows the last
            four entries in write order and never shows that two thirds of the
            day arrived after eight in the evening. */}
        <MealRhythm logs={data?.todayLogs ?? []} />
      </div>

      {/* Water + Sleep + Badges */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeading icon={<Droplets size={18} />} bg="bg-sky-100" text="text-sky-600">
            {t('dash.waterToday')}
          </CardHeading>
          <div className="flex items-baseline gap-1">
            <Num><span className="text-2xl font-bold text-slate-900">{(data?.waterLiters ?? 0).toFixed(2)}</span></Num>
            <span className="text-sm font-medium text-slate-400">{t('common.liters')}</span>
          </div>
          {/* The 2.5 L bar is gone with the rest of the invented denominators:
              the backend computes a personal water target from body weight and
              this screen was ignoring it in favour of a literal. */}
        </Card>

        <Card>
          <CardHeading icon={<Moon size={18} />} bg="bg-indigo-100" text="text-indigo-600">
            {t('dash.sleepToday')}
          </CardHeading>
          {data?.sleepHours != null ? (
            <div className="flex items-baseline gap-1">
              <Num><span className="text-2xl font-bold text-slate-900">{data.sleepHours.toFixed(1)}</span></Num>
              {/* Was a hardcoded Latin "h" in the middle of a Hebrew card. */}
              <span className="text-sm font-medium text-slate-400">{t('common.hours')}</span>
            </div>
          ) : (
            <p className="text-sm text-slate-400">{t('dash.noSleepLogged')}</p>
          )}
        </Card>

        <Card>
          <CardHeading icon={<Medal size={18} />} bg="bg-violet-100" text="text-violet-600">
            {t('dash.badges')}
          </CardHeading>
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
        </Card>
      </div>

      <QuickActions t={t} />

      {/* A saved meal is one tap. The endpoints for this have existed the whole
          time and nothing in the app called them. */}
      <div className="mt-4">
        <QuickLogTemplates onLogged={load} />
      </div>

      {/* Quiet, at the end. Nobody opens a nutrition app to think about
          billing — but a subscription that silently lapsed or silently failed
          to renew has no other detector. */}
      <div className="mt-6">
        <PlanStatus />
      </div>

      {/* Recent meals */}
      <div className="mt-6">
        {data?.recentMeals?.length ? (
          <Card>
            <div className="mb-4 flex items-center gap-2.5">
              {/* Was a Dumbbell. For meals. */}
              <UtensilsCrossed size={18} className="text-slate-400" />
              <h2 className="font-semibold text-slate-900">{t('dash.recentMeals')}</h2>
            </div>
            <ul className="divide-y divide-slate-100">
              {data.recentMeals.map((meal) => (
                <li key={meal.id} className="flex items-center justify-between py-3">
                  <div>
                    <div className="font-medium text-slate-800">{meal.name}</div>
                    {meal.meal_type && (
                      <div className="text-xs text-slate-400">{t(`meal.${meal.meal_type}`)}</div>
                    )}
                  </div>
                  <span className="text-sm font-semibold text-slate-600">
                    <Num>{meal.calories}</Num> {t('common.kcal')}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        ) : (
          /* The component built for exactly this, which this page was the only
             one not using. */
          <EmptyState icon={<UtensilsCrossed size={26} />} text={t('dash.noMealsYet')} />
        )}
      </div>
    </div>
  );
};

/**
 * One filled primary, one quiet secondary. They used to be two equally loud
 * saturated buttons with the same icon and the same subtitle — which meant the
 * page had no primary action at all.
 */
const QuickActions = ({ t }: { t: TranslateFn }) => (
  <div className="mt-6 grid gap-4 sm:grid-cols-2">
    <Link
      to="/food-log"
      className="group flex items-center justify-between rounded-2xl bg-emerald-600 p-5 text-white shadow-md shadow-emerald-200 transition hover:bg-emerald-700"
    >
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/20">
          <UtensilsCrossed size={22} />
        </span>
        <div className="font-semibold">{t('dash.logFood')}</div>
      </div>
      <Plus size={22} className="transition group-hover:rotate-90" />
    </Link>
    <Link
      to="/hydration"
      className="group flex items-center justify-between rounded-2xl bg-white p-5 text-sky-700 shadow-sm ring-1 ring-sky-100 transition hover:bg-sky-50"
    >
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-100 text-sky-600">
          <Droplets size={22} />
        </span>
        <div className="font-semibold">{t('dash.addWater')}</div>
      </div>
      <Plus size={22} className="transition group-hover:rotate-90" />
    </Link>
  </div>
);
