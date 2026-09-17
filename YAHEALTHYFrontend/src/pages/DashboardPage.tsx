import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Utensils,
  Droplets,
  Scale,
  Moon,
  ChefHat,
  Sparkles,
  Flame,
  TrendingUp,
  Plus,
  Info,
} from 'lucide-react';
import {
  Card,
  Button,
  ProgressRing,
  ProgressBar,
  ErrorState,
  EmptyState,
  SkeletonCard,
  Chip,
} from '@/components/ui';
import { FoodQuickAdd } from '@/components/FoodQuickAdd';
import { WaterModal, SleepModal, WeightModal } from '@/components/QuickLogModals';
import {
  FoodLog,
  HydrationLog,
  SleepLog,
  Targets,
  WeightGoal,
  WeightLog,
  foodLogApi,
  waterApi,
  sleepApi,
  weightApi,
  targetApi,
  streakApi,
  surveyApi,
  prefApi,
} from '@/services/api';
import { useAsync } from '@/hooks/useAsync';
import { todayStr, fmtDateLong } from '@/lib/date';
import {
  computeHealthScore,
  scoreExplanation,
  scoreBand,
  sumCalories,
  sumMacros,
  waterToday,
  weightProgress,
  resolveWaterGoal,
  resolveSleepTarget,
  resolveTargets,
} from '@/lib/health';
import { dailyRecommendations } from '@/lib/coach';

const MEALS = [
  { key: 'breakfast', label: 'Breakfast' },
  { key: 'lunch', label: 'Lunch' },
  { key: 'snack', label: 'Snack' },
  { key: 'dinner', label: 'Dinner' },
];

export const DashboardPage = () => {
  const today = todayStr();
  const [modal, setModal] = useState<null | 'food' | 'water' | 'sleep' | 'weight'>(null);
  const navigate = useNavigate();

  const loadAll = useCallback(async () => {
    const [logs, water, sleep, goals, weights, targets, streak, surveys, prefs] = await Promise.all([
      foodLogApi.getAll({ date: today }).then((r) => r.data || []),
      waterApi.list().then((r) => r.data || []),
      sleepApi.list().then((r) => r.data || []),
      weightApi.goals().then((r) => r.data || []),
      weightApi.logs().then((r) => r.data || []),
      targetApi.get().then((r) => r.data),
      streakApi.get().then((r) => r.data),
      surveyApi.list().then((r) => r.data || []),
      prefApi.get().catch(() => ({})),
    ]);
    return { logs, water, sleep, goals, weights, targets, streak, surveys, prefs };
  }, [today]);

  const { data, loading, error, reload } = useAsync(loadAll, [today]);

  const reloadWater = useCallback(() => reload(), [reload]);

  const targets: Targets | null = data?.targets?.targets ?? null;
  const survey = data?.surveys?.[0] ?? null;
  const goal: WeightGoal | null = data?.goals?.[0] ?? null;

  const view = useMemo(() => {
    if (!data) return null;
    const t = resolveTargets(targets);
    const logs = data.logs as FoodLog[];
    const calories = sumCalories(logs);
    const macros = sumMacros(logs);
    const water = waterToday(data.water as HydrationLog[], today);
    const waterGoal = resolveWaterGoal(
      (data.prefs as { hydrationGoalLiters?: number }).hydrationGoalLiters,
      survey?.water_target_liters
    );
    const sleepTarget = resolveSleepTarget(survey?.sleep_target_hours);
    const lastNight = (data.sleep as SleepLog[]).find((l) => l.date === today) ?? null;
    const progress = goal ? weightProgress(goal, data.weights as WeightLog[]) : null;
    const score = computeHealthScore({
      calories,
      targetCalories: t.calories,
      protein: macros.protein,
      targetProtein: t.protein,
      waterLiters: water,
      waterGoal,
      sleepHours: lastNight?.sleep_hours ?? null,
      sleepTarget,
      streak: data.streak?.currentStreak ?? 0,
    });
    return {
      calories,
      macros,
      water,
      waterGoal,
      sleepTarget,
      lastNight,
      progress,
      score,
      streak: data.streak?.currentStreak ?? 0,
      longestStreak: data.streak?.longestStreak ?? 0,
    };
  }, [data, targets, survey, goal, today]);

  if (loading && !data) {
    return (
      <div className="space-y-4">
        <SkeletonCard />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      </div>
    );
  }

  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!data || !view) return null;

  const hasAnyData = data.logs.length > 0 || (data.water as HydrationLog[]).length > 0 || (data.sleep as SleepLog[]).length > 0;
  const t = resolveTargets(targets);
  const recommendations = dailyRecommendations({
    date: today,
    targets,
    todayLogs: data.logs as FoodLog[],
    waterLogs: data.water as HydrationLog[],
    waterGoal: view.waterGoal,
    sleepLogs: data.sleep as SleepLog[],
    sleepTarget: view.sleepTarget,
    goal,
    weightLogs: data.weights as WeightLog[],
    streak: view.streak,
    recipes: [],
  });

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 18) return 'Good afternoon';
    return 'Good evening';
  };

  return (
    <div className="animate-fade-up space-y-5">
      {/* Header */}
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight">
            {greeting()} 👋
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">{fmtDateLong(today)}</p>
        </div>
        {view.streak > 0 && (
          <Chip color="amber" className="text-sm py-1">
            <Flame className="w-3.5 h-3.5" /> {view.streak}-day streak
          </Chip>
        )}
      </div>

      {!hasAnyData && (
        <Card className="border-teal-100 bg-gradient-to-br from-teal-50 to-emerald-50">
          <EmptyState
            icon={<Utensils className="w-7 h-7" />}
            title="Welcome! Let's log your first data"
            text="Log a meal, water or sleep and your daily health picture appears here — calories, macros, hydration and a personal health score."
            action={
              <div className="flex gap-2 flex-wrap justify-center">
                <Button onClick={() => setModal('food')}>
                  <Plus className="w-4 h-4" /> Log food
                </Button>
                <Button variant="secondary" onClick={() => setModal('water')}>
                  <Droplets className="w-4 h-4" /> Add water
                </Button>
              </div>
            }
          />
        </Card>
      )}

      {/* Today's progress */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Calories ring */}
        <Card className="lg:col-span-1 flex flex-col items-center">
          <p className="text-sm font-semibold text-slate-500 self-start">Today's calories</p>
          <div className="my-3">
            <ProgressRing
              percent={t.calories ? (view.calories / t.calories) * 100 : 0}
              size={140}
              color={t.calories && view.calories > t.calories ? '#f59e0b' : '#0d9488'}
            >
              <span className="text-3xl font-extrabold text-slate-900 tabular">{Math.round(view.calories)}</span>
              <span className="text-xs text-slate-400">
                {t.calories ? `of ${t.calories} kcal` : 'no target set'}
              </span>
            </ProgressRing>
          </div>
          <div className="w-full space-y-2.5">
            <MacroRow label="Protein" value={view.macros.protein} target={t.protein} color="bg-teal-500" />
            <MacroRow label="Carbs" value={view.macros.carbs} target={t.carbs} color="bg-amber-500" />
            <MacroRow label="Fat" value={view.macros.fat} target={t.fat} color="bg-purple-500" />
          </div>
          <Button variant="soft" size="sm" className="mt-4 w-full" onClick={() => setModal('food')}>
            <Plus className="w-4 h-4" /> Log food
          </Button>
        </Card>

        {/* Water + Sleep + Weight tiles */}
        <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4 content-start">
          <TileCard
            icon={<Droplets className="w-4 h-4" />}
            title="Water"
            accent="text-sky-600"
            main={`${(view.water * 1000).toFixed(0)}ml`}
            sub={`of ${(view.waterGoal * 1000).toFixed(0)}ml goal`}
            footer={<ProgressBar value={view.water} max={view.waterGoal} color="bg-sky-500" />}
            action={
              <Button size="sm" variant="soft" className="!bg-sky-50 !text-sky-700 hover:!bg-sky-100" onClick={() => setModal('water')}>
                <Plus className="w-4 h-4" /> Add
              </Button>
            }
          />
          <TileCard
            icon={<Moon className="w-4 h-4" />}
            title="Sleep last night"
            accent="text-indigo-600"
            main={view.lastNight ? `${view.lastNight.sleep_hours}h` : '—'}
            sub={view.lastNight ? view.lastNight.sleep_quality ? `${view.lastNight.sleep_quality} quality` : 'logged' : 'not logged'}
            footer={
              view.lastNight ? <ProgressBar value={view.lastNight.sleep_hours} max={view.sleepTarget} color="bg-indigo-500" /> : undefined
            }
            action={
              <Button size="sm" variant="soft" className="!bg-indigo-50 !text-indigo-700 hover:!bg-indigo-100" onClick={() => setModal('sleep')}>
                <Plus className="w-4 h-4" /> Log
              </Button>
            }
          />
          <TileCard
            icon={<Scale className="w-4 h-4" />}
            title="Current weight"
            accent="text-emerald-600"
            main={view.progress ? `${view.progress.current}kg` : '—'}
            sub={
              view.progress
                ? `${view.progress.pct}% to ${view.progress.target}kg goal`
                : goal
                ? 'no weigh-ins yet'
                : 'no goal set'
            }
            footer={
              view.progress ? (
                <ProgressBar value={view.progress.pct} max={100} color="bg-emerald-500" />
              ) : undefined
            }
            action={
              <Button
                size="sm"
                variant="soft"
                className="!bg-emerald-50 !text-emerald-700 hover:!bg-emerald-100"
                onClick={() => (goal ? setModal('weight') : navigate('/progress'))}
              >
                <Plus className="w-4 h-4" /> {goal ? 'Log' : 'Set goal'}
              </Button>
            }
          />
          <TileCard
            icon={<Sparkles className="w-4 h-4" />}
            title="Daily health score"
            accent="text-teal-600"
            main={`${view.score.score}`}
            sub={scoreBand(view.score.score).label}
            footer={
              <div className="flex items-center gap-2">
                <Info className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <p className="text-xs text-slate-500 line-clamp-2">{scoreExplanation(view.score)}</p>
              </div>
            }
          />
        </div>
      </div>

      {/* Explainable score detail */}
      <Card title="Why your score is what it is" subtitle="A general wellness indicator built from your logged data — not medical advice.">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {view.score.factors.map((f) => (
            <div key={f.key} className="rounded-xl bg-slate-50 px-4 py-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-700">{f.label}</p>
                <p className="text-sm font-bold text-slate-900 tabular">
                  {f.points}<span className="text-slate-400 font-medium">/{f.max}</span>
                </p>
              </div>
              <ProgressBar className="mt-2" value={f.points} max={f.max} color="bg-teal-500" />
              <p className="text-xs text-slate-500 mt-2">{f.detail}</p>
            </div>
          ))}
        </div>
      </Card>

      {/* Today's meals */}
      <Card
        title="Today's meals"
        action={
          <Button variant="secondary" size="sm" onClick={() => navigate('/food-log')}>
            Open food log
          </Button>
        }
      >
        {data.logs.length === 0 ? (
          <EmptyState
            title="No meals logged yet today"
            text="Log breakfast, lunch, dinner or a snack — it only takes a few seconds."
            action={
              <Button size="sm" onClick={() => setModal('food')}>
                <Plus className="w-4 h-4" /> Log your first meal
              </Button>
            }
          />
        ) : (
          <div className="space-y-4">
            {MEALS.map((meal) => {
              const items = (data.logs as FoodLog[]).filter((l) => (l.meal_type || 'snack') === meal.key);
              if (items.length === 0) return null;
              const cal = sumCalories(items);
              return (
                <div key={meal.key}>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-bold text-slate-700">{meal.label}</p>
                    <p className="text-sm text-slate-400 tabular">{Math.round(cal)} kcal</p>
                  </div>
                  <div className="space-y-1.5">
                    {items.map((l) => (
                      <div key={l.id} className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-2.5">
                        <span className="text-sm font-medium text-slate-800 truncate">{l.name}</span>
                        <span className="text-sm text-slate-500 tabular shrink-0 ml-3">{Math.round(l.calories)} kcal</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Recommended next actions */}
      <Card title="Your coach recommends" action={<Button variant="ghost" size="sm" onClick={() => navigate('/coach')}>Open coach</Button>}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {recommendations.map((r, i) => (
            <div key={i} className="rounded-xl border border-slate-100 p-4 flex gap-3">
              <span className="text-2xl shrink-0">{r.icon}</span>
              <div>
                <p className="text-sm font-bold text-slate-800">{r.title}</p>
                <p className="text-sm text-slate-500 mt-0.5">{r.text}</p>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Quick actions */}
      <Card title="Quick actions">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <QuickAction icon={<Utensils className="w-5 h-5" />} label="Log food" onClick={() => setModal('food')} />
          <QuickAction icon={<Droplets className="w-5 h-5" />} label="Add water" onClick={() => setModal('water')} />
          <QuickAction icon={<Scale className="w-5 h-5" />} label="Log weight" onClick={() => (goal ? setModal('weight') : navigate('/progress'))} />
          <QuickAction icon={<Moon className="w-5 h-5" />} label="Log sleep" onClick={() => setModal('sleep')} />
          <QuickAction icon={<ChefHat className="w-5 h-5" />} label="Recipes" onClick={() => navigate('/recipes')} />
          <QuickAction icon={<Sparkles className="w-5 h-5" />} label="Ask coach" onClick={() => navigate('/coach')} />
        </div>
      </Card>

      {t.calories == null && (
        <Card className="border-amber-100 bg-amber-50/60">
          <div className="flex items-start gap-3">
            <TrendingUp className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-slate-800">Set your daily targets</p>
              <p className="text-sm text-slate-600 mt-0.5">
                Complete your body metrics (age, height, weight) to auto-calculate calorie & protein targets, or set custom ones in Settings.
              </p>
              <div className="flex gap-2 mt-3">
                <Button size="sm" onClick={() => navigate('/profile')}>Body metrics</Button>
                <Button size="sm" variant="secondary" onClick={() => navigate('/settings')}>Custom targets</Button>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Modals */}
      <FoodQuickAdd open={modal === 'food'} onClose={() => setModal(null)} onSaved={reload} />
      <WaterModal open={modal === 'water'} onClose={() => setModal(null)} onSaved={reloadWater} />
      <SleepModal open={modal === 'sleep'} onClose={() => setModal(null)} onSaved={reload} />
      <WeightModal open={modal === 'weight'} onClose={() => setModal(null)} onSaved={reload} goal={goal} />
    </div>
  );
};

function MacroRow({ label, value, target, color }: { label: string; value: number; target: number | null; color: string }) {
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="font-semibold text-slate-500">{label}</span>
        <span className="text-slate-500 tabular">
          {Math.round(value)}g{target ? ` / ${target}g` : ''}
        </span>
      </div>
      <ProgressBar value={value} max={target || value || 1} color={color} />
    </div>
  );
}

function TileCard({
  icon,
  title,
  accent,
  main,
  sub,
  footer,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  accent: string;
  main: string;
  sub: string;
  footer?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <Card className="flex flex-col">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-500">
          <span className={accent}>{icon}</span> {title}
        </p>
        {action}
      </div>
      <p className="text-3xl font-extrabold text-slate-900 tabular mt-2">{main}</p>
      <p className="text-xs text-slate-400 mt-0.5">{sub}</p>
      {footer && <div className="mt-3">{footer}</div>}
    </Card>
  );
}

function QuickAction({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-2 rounded-2xl border border-slate-100 bg-white hover:border-teal-200 hover:bg-teal-50/40 transition py-4 px-2"
    >
      <span className="w-10 h-10 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center">{icon}</span>
      <span className="text-xs font-semibold text-slate-600">{label}</span>
    </button>
  );
}
