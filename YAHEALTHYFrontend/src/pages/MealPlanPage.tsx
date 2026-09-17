import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Wand2,
  Trash2,
  Utensils,
  Clock,
  Flame,
  ChefHat,
  Settings2,
  ArrowRightLeft,
} from 'lucide-react';
import { Card, Button, Modal, Field, inputCls, ErrorState, EmptyState, SkeletonCard, Chip, Segmented } from '@/components/ui';
import { MealPlan, Recipe, mealPlanApi, recipeApi, targetApi, prefApi, foodLogApi, apiError, Targets } from '@/services/api';
import { useAsync } from '@/hooks/useAsync';
import { useToast } from '@/hooks/useToast';
import { addDays, fmtDateLong, todayStr } from '@/lib/date';

const MEAL_TYPES = [
  { key: 'breakfast', label: 'Breakfast' },
  { key: 'lunch', label: 'Lunch' },
  { key: 'snack', label: 'Snack' },
  { key: 'dinner', label: 'Dinner' },
];

interface DietaryPrefs {
  maxCookingMinutes: number;
  dislikes: string;
  allergies: string;
}

export const MealPlanPage = () => {
  const navigate = useNavigate();
  const { push } = useToast();
  const [days, setDays] = useState<'1' | '3' | '7'>('3');
  const [mealTypes, setMealTypes] = useState<string[]>(['breakfast', 'lunch', 'dinner']);
  const [showPrefs, setShowPrefs] = useState(false);
  const [dietary, setDietary] = useState<DietaryPrefs>({ maxCookingMinutes: 30, dislikes: '', allergies: '' });
  const [generating, setGenerating] = useState(false);
  const [busyMealId, setBusyMealId] = useState<string | null>(null);
  const [openRecipe, setOpenRecipe] = useState<Recipe | null>(null);

  const load = useCallback(async () => {
    const [plans, recipes, targets, prefs] = await Promise.all([
      mealPlanApi.all().then((r) => r.data || []),
      recipeApi.all().then((r) => r.data || []),
      targetApi.get().then((r) => r.data.targets as Targets),
      prefApi.get().catch(() => ({}) as { dietary?: { maxCookingMinutes?: number; dislikes?: string[]; allergies?: string[] } }),
    ]);
    const d = prefs.dietary || {};
    setDietary({
      maxCookingMinutes: d.maxCookingMinutes ?? 30,
      dislikes: (d.dislikes || []).join(', '),
      allergies: (d.allergies || []).join(', '),
    });
    return { plans, recipes, targets: targets as Targets };
  }, []);
  const { data, loading, error, reload } = useAsync(load, []);

  const recipeById = useMemo(() => {
    const map = new Map<string, Recipe>();
    (data?.recipes || []).forEach((r) => map.set(r.id, r));
    return map;
  }, [data]);

  /** Recipes that respect cooking-time + dislikes + allergies constraints */
  const eligible = useCallback(
    (preferredCategory?: string) => {
      const dislikeSet = dietary.dislikes
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
      const allergySet = dietary.allergies
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
      const blocked = [...dislikeSet, ...allergySet];
      const pool = (data?.recipes || []).filter(
        (r) => r.time_minutes <= dietary.maxCookingMinutes && !r.ingredients.some((i) => blocked.includes(i.toLowerCase()))
      );
      const matching = preferredCategory ? pool.filter((r) => r.category === preferredCategory) : [];
      return matching.length > 0 ? matching : pool.length > 0 ? pool : (data?.recipes || []);
    },
    [data, dietary]
  );

  const saveDietary = async () => {
    const list = (s: string) =>
      s
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean);
    try {
      await prefApi.merge({
        dietary: {
          maxCookingMinutes: dietary.maxCookingMinutes,
          dislikes: list(dietary.dislikes),
          allergies: list(dietary.allergies),
        },
      });
      setShowPrefs(false);
      push('Meal preferences saved');
    } catch (err) {
      push(apiError(err), 'error');
    }
  };

  const generate = async () => {
    if (generating) return;
    if (mealTypes.length === 0) {
      push('Pick at least one meal type', 'error');
      return;
    }
    setGenerating(true);
    try {
      const start = todayStr();
      const n = Number(days);
      // Replace existing plans in the target window
      const existing = (data?.plans || []).filter(
        (p) => p.date >= start && p.date < addDays(start, n)
      );
      await Promise.all(existing.map((p) => mealPlanApi.remove(p.id)));

      // Create new plans that respect preferences
      for (let d = 0; d < n; d++) {
        const date = addDays(start, d);
        for (const mealType of mealTypes) {
          const pool = eligible(mealType === 'breakfast' ? 'breakfast' : mealType === 'snack' ? 'salad' : undefined);
          if (pool.length === 0) continue;
          const recipe = pool[Math.floor(Math.random() * pool.length)];
          await mealPlanApi.create(recipe.id, date, mealType);
        }
      }
      push(`${n}-day meal plan generated`);
      reload();
    } catch (err) {
      push(apiError(err), 'error');
    } finally {
      setGenerating(false);
    }
  };

  const replaceMeal = async (plan: MealPlan) => {
    if (busyMealId) return;
    setBusyMealId(plan.id);
    try {
      const pool = eligible(plan.meal_type === 'breakfast' ? 'breakfast' : plan.meal_type === 'snack' ? 'salad' : undefined)
        .filter((r) => r.id !== plan.recipe_id);
      if (pool.length === 0) {
        push('No alternative recipe available — try relaxing your meal preferences', 'error');
        return;
      }
      const next = pool[Math.floor(Math.random() * pool.length)];
      await mealPlanApi.update(plan.id, { recipe_id: next.id });
      push(`Swapped to ${next.name}`);
      reload();
    } catch (err) {
      push(apiError(err), 'error');
    } finally {
      setBusyMealId(null);
    }
  };

  const logMeal = async (plan: MealPlan, recipe: Recipe) => {
    if (busyMealId) return;
    setBusyMealId(plan.id);
    try {
      await foodLogApi.create({
        date: todayStr(),
        name: recipe.name,
        mealType: plan.meal_type,
        calories: recipe.calories,
      });
      push(`${recipe.name} logged to your food log`);
    } catch (err) {
      push(apiError(err), 'error');
    } finally {
      setBusyMealId(null);
    }
  };

  const removeMeal = async (plan: MealPlan) => {
    if (busyMealId) return;
    setBusyMealId(plan.id);
    try {
      await mealPlanApi.remove(plan.id);
      push('Meal removed');
      reload();
    } catch (err) {
      push(apiError(err), 'error');
    } finally {
      setBusyMealId(null);
    }
  };

  const plansByDate = useMemo(() => {
    const map = new Map<string, MealPlan[]>();
    for (const p of data?.plans || []) {
      if (!map.has(p.date)) map.set(p.date, []);
      map.get(p.date)!.push(p);
    }
    const order = ['breakfast', 'lunch', 'snack', 'dinner'];
    return Array.from(map.entries())
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([date, plans]) => [date, plans.sort((a, b) => order.indexOf(a.meal_type) - order.indexOf(b.meal_type))] as const);
  }, [data]);

  return (
    <div className="animate-fade-up space-y-5">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight">Meal Planner</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Generate a plan around your schedule, then swap or log each meal in one tap
          </p>
        </div>
        <Button variant="secondary" size="sm" className="shrink-0" onClick={() => setShowPrefs(true)}>
          <Settings2 className="w-4 h-4" /> Preferences
        </Button>
      </div>

      {/* Generator */}
      <Card>
        <div className="flex flex-col sm:flex-row sm:items-end gap-4">
          <div>
            <p className="text-sm font-semibold text-slate-700 mb-1.5">Plan length</p>
            <Segmented
              value={days}
              onChange={setDays}
              options={[
                { value: '1', label: '1 day' },
                { value: '3', label: '3 days' },
                { value: '7', label: '7 days' },
              ]}
            />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-slate-700 mb-1.5">Meals per day</p>
            <div className="flex gap-2 flex-wrap">
              {MEAL_TYPES.map((m) => {
                const active = mealTypes.includes(m.key);
                return (
                  <button
                    key={m.key}
                    type="button"
                    onClick={() =>
                      setMealTypes((cur) => (active ? cur.filter((x) => x !== m.key) : [...cur, m.key]))
                    }
                    className={`px-3.5 py-1.5 rounded-xl text-sm font-semibold border transition ${
                      active ? 'bg-teal-600 text-white border-teal-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    {m.label}
                  </button>
                );
              })}
            </div>
          </div>
          <Button size="lg" loading={generating} onClick={generate}>
            <Wand2 className="w-4 h-4" /> Generate plan
          </Button>
        </div>
        <p className="text-xs text-slate-400 mt-3">
          Respects your preferences (cooking time, dislikes, allergies)
          {data?.targets?.calories ? ` · your daily target: ${data.targets.calories} kcal` : ''}
        </p>
      </Card>

      {loading && !data && <SkeletonCard />}
      {error && <ErrorState message={error} onRetry={reload} />}

      {data && plansByDate.length === 0 && (
        <Card>
          <EmptyState
            icon={<ChefHat className="w-7 h-7" />}
            title="No meal plan yet"
            text="Generate your first plan above — it takes one tap and can be regenerated at any time."
          />
        </Card>
      )}

      {plansByDate.map(([date, plans]) => {
        const dayCalories = plans.reduce((s, p) => s + (recipeById.get(p.recipe_id)?.calories || 0), 0);
        return (
          <Card
            key={date}
            title={
              <span className="flex items-center gap-2">
                {fmtDateLong(date)} {date === todayStr() && <Chip color="teal">Today</Chip>}
              </span>
            }
            subtitle={`${plans.length} meals · ${dayCalories} kcal`}
            action={
              <Button variant="ghost" size="sm" onClick={() => navigate('/recipes')}>
                More recipes
              </Button>
            }
          >
            <div className="space-y-2.5">
              {plans.map((plan) => {
                const recipe = recipeById.get(plan.recipe_id);
                if (!recipe) return null;
                return (
                  <div key={plan.id} className={`rounded-2xl border border-slate-100 p-4 flex items-center gap-3 ${busyMealId === plan.id ? 'opacity-50' : ''}`}>
                    <span className="w-11 h-11 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center shrink-0 text-xl">
                      {plan.meal_type === 'breakfast' ? '🌅' : plan.meal_type === 'lunch' ? '☀️' : plan.meal_type === 'snack' ? '🍏' : '🌙'}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{plan.meal_type}</p>
                      <button onClick={() => setOpenRecipe(recipe)} className="text-left">
                        <p className="text-sm font-bold text-slate-900 truncate hover:text-teal-700">{recipe.name}</p>
                      </button>
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        <Chip color="teal"><Flame className="w-3 h-3" /> {recipe.calories} kcal</Chip>
                        <Chip color="slate"><Clock className="w-3 h-3" /> {recipe.time_minutes} min</Chip>
                      </div>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-1 shrink-0">
                      <IconAction title="Replace meal" onClick={() => replaceMeal(plan)}>
                        <ArrowRightLeft className="w-4 h-4" />
                      </IconAction>
                      <IconAction title="Add to food log" onClick={() => logMeal(plan, recipe)}>
                        <Utensils className="w-4 h-4" />
                      </IconAction>
                      <IconAction title="Remove" onClick={() => removeMeal(plan)} danger>
                        <Trash2 className="w-4 h-4" />
                      </IconAction>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        );
      })}

      {/* Preferences modal */}
      <Modal open={showPrefs} onClose={() => setShowPrefs(false)} title="Meal preferences">
        <div className="space-y-4">
          <Field label="Max cooking time">
            <Segmented
              value={String(dietary.maxCookingMinutes) as '15' | '30' | '60'}
              onChange={(v) => setDietary((d) => ({ ...d, maxCookingMinutes: Number(v) }))}
              options={[
                { value: '15', label: '15 min' },
                { value: '30', label: '30 min' },
                { value: '60', label: 'Any time' },
              ]}
            />
          </Field>
          <Field label="Foods you dislike" hint="Comma-separated, e.g. eggplant, cilantro">
            <input
              value={dietary.dislikes}
              onChange={(e) => setDietary((d) => ({ ...d, dislikes: e.target.value }))}
              className={inputCls}
            />
          </Field>
          <Field label="Allergies" hint="Comma-separated — excluded from every generated meal">
            <input
              value={dietary.allergies}
              onChange={(e) => setDietary((d) => ({ ...d, allergies: e.target.value }))}
              className={inputCls}
            />
          </Field>
          <Button className="w-full" onClick={saveDietary}>
            Save preferences
          </Button>
        </div>
      </Modal>

      {/* Recipe detail modal */}
      <Modal open={!!openRecipe} onClose={() => setOpenRecipe(null)} title={openRecipe?.name}>
        {openRecipe && (
          <div>
            <div className="flex flex-wrap gap-2 mb-4">
              <Chip color="teal"><Flame className="w-3 h-3" /> {openRecipe.calories} kcal</Chip>
              <Chip color="slate"><Clock className="w-3 h-3" /> {openRecipe.time_minutes} min</Chip>
              <Chip color="emerald" className="capitalize">{openRecipe.difficulty}</Chip>
            </div>
            <h3 className="font-bold text-slate-900 mb-2">Ingredients</h3>
            <ul className="space-y-1.5 mb-4">
              {openRecipe.ingredients.map((i) => (
                <li key={i} className="flex items-center gap-2 text-sm text-slate-700">
                  <span className="w-1.5 h-1.5 rounded-full bg-teal-500" /> {i}
                </li>
              ))}
            </ul>
            <h3 className="font-bold text-slate-900 mb-2">Preparation</h3>
            <ol className="space-y-2">
              {openRecipe.steps.map((s, i) => (
                <li key={i} className="flex gap-3 text-sm text-slate-700">
                  <span className="w-6 h-6 rounded-full bg-teal-50 text-teal-700 text-xs font-bold flex items-center justify-center shrink-0">
                    {i + 1}
                  </span>
                  {s}
                </li>
              ))}
            </ol>
          </div>
        )}
      </Modal>
    </div>
  );
};

function IconAction({
  children,
  onClick,
  title,
  danger = false,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      className={`w-9 h-9 rounded-full flex items-center justify-center transition ${
        danger ? 'text-slate-400 hover:bg-rose-50 hover:text-rose-600' : 'text-slate-400 hover:bg-teal-50 hover:text-teal-700'
      }`}
    >
      {children}
    </button>
  );
}
