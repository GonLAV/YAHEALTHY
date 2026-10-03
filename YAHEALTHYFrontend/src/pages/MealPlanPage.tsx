import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Flame,
  ListChecks,
  Plus,
  ShoppingCart,
  Sparkles,
  UtensilsCrossed,
  X,
} from 'lucide-react';
import { recipeApi, type Recipe } from '@/services/api';
import {
  mealPlanApi,
  MEAL_TYPES,
  GENERATED_MEAL_TYPES,
  type GroceryItem,
  type MealPlan,
} from '@/services/mealPlanApi';
import { useLanguage } from '@/i18n/LanguageContext';
import PageHeader from '@/components/ui/PageHeader';
import StatCard from '@/components/ui/StatCard';
import Dialog from '@/components/mealPlan/Dialog';
import RecipePicker, { recipeName } from '@/components/mealPlan/RecipePicker';
import GroceryList from '@/components/mealPlan/GroceryList';
import { addDays, parseYMD, startOfWeek, toYMD, weekDays } from '@/components/mealPlan/dates';

// Sunday-first for both languages: the product is Israeli and a fixed start
// keeps grocery ticks (stored per week) stable across a language switch.
const WEEK_STARTS_ON = 0;
const WIDE_QUERY = '(min-width: 1280px)';

type Tab = 'plan' | 'grocery';
interface Slot {
  date: string;
  mealType: string;
}

const useMediaQuery = (query: string) => {
  const get = () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query).matches : false);
  const [matches, setMatches] = useState(get);
  useEffect(() => {
    if (!window.matchMedia) return;
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);
  return matches;
};

const statusOf = (err: unknown) => (axios.isAxiosError(err) ? err.response?.status : undefined);
const slotId = (kind: 'add' | 'remove', date: string, mealType: string) => `mp-${kind}-${date}-${mealType}`;

export const MealPlanPage = () => {
  const { t, lang } = useLanguage();
  const locale = lang === 'he' ? 'he-IL' : 'en-US';
  const isWide = useMediaQuery(WIDE_QUERY);

  const todayYMD = toYMD(new Date());
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(new Date(), WEEK_STARTS_ON));
  const days = useMemo(() => weekDays(weekStart), [weekStart]);
  const dayKeys = useMemo(() => days.map(toYMD), [days]);
  const startYMD = dayKeys[0];
  const endYMD = dayKeys[6];
  const [selectedDay, setSelectedDay] = useState<string>(todayYMD);
  const [tab, setTab] = useState<Tab>('plan');

  // Recipes
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [recipesLoading, setRecipesLoading] = useState(true);
  const [recipesError, setRecipesError] = useState(false);

  // Week data
  const [plans, setPlans] = useState<MealPlan[]>([]);
  const [plansLoading, setPlansLoading] = useState(true);
  const [plansError, setPlansError] = useState(false);
  const [grocery, setGrocery] = useState<GroceryItem[]>([]);
  const [groceryLoading, setGroceryLoading] = useState(true);
  const [groceryError, setGroceryError] = useState(false);

  // Interaction
  const [pickerSlot, setPickerSlot] = useState<Slot | null>(null);
  const [confirmCount, setConfirmCount] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [status, setStatus] = useState('');
  const [actionError, setActionError] = useState('');
  const [pendingFocus, setPendingFocus] = useState<string | null>(null);
  const requestSeq = useRef(0);

  // ---- data loading -------------------------------------------------------

  const loadRecipes = useCallback(async () => {
    setRecipesLoading(true);
    setRecipesError(false);
    try {
      const res = await recipeApi.getAll();
      setRecipes(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error('Failed to load recipes:', err);
      setRecipesError(true);
    } finally {
      setRecipesLoading(false);
    }
  }, []);

  const loadGrocery = useCallback(async (start: string, end: string, seq: number) => {
    setGroceryLoading(true);
    setGroceryError(false);
    try {
      const res = await mealPlanApi.groceryList({ start, end });
      if (seq !== requestSeq.current) return;
      setGrocery(Array.isArray(res.data?.items) ? res.data.items : []);
    } catch (err) {
      if (seq !== requestSeq.current) return;
      console.error('Failed to load grocery list:', err);
      setGroceryError(true);
      setGrocery([]);
    } finally {
      if (seq === requestSeq.current) setGroceryLoading(false);
    }
  }, []);

  const loadWeek = useCallback(async () => {
    const seq = ++requestSeq.current;
    setPlansLoading(true);
    setPlansError(false);
    void loadGrocery(startYMD, endYMD, seq);
    try {
      const res = await mealPlanApi.list({ start: startYMD, end: endYMD });
      if (seq !== requestSeq.current) return;
      setPlans(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      if (seq !== requestSeq.current) return;
      console.error('Failed to load meal plans:', err);
      setPlansError(true);
      setPlans([]);
    } finally {
      if (seq === requestSeq.current) setPlansLoading(false);
    }
  }, [startYMD, endYMD, loadGrocery]);

  useEffect(() => {
    loadRecipes();
  }, [loadRecipes]);

  useEffect(() => {
    loadWeek();
  }, [loadWeek]);

  // Mutations reload through this ref so that, if the user changed week while
  // a request was in flight, the reload fetches the week now on screen rather
  // than the one captured when the mutation started.
  const loadWeekRef = useRef(loadWeek);
  loadWeekRef.current = loadWeek;

  // Keep the selected (mobile) day inside the visible week.
  useEffect(() => {
    if (!dayKeys.includes(selectedDay)) {
      setSelectedDay(dayKeys.includes(todayYMD) ? todayYMD : dayKeys[0]);
    }
  }, [dayKeys, selectedDay, todayYMD]);

  // Move focus to the control that replaced the one the user just used.
  useEffect(() => {
    // Slot buttons are disabled while a request is in flight; wait until they're usable.
    if (!pendingFocus || busy || plansLoading) return;
    document.getElementById(pendingFocus)?.focus();
    setPendingFocus(null);
  }, [pendingFocus, plans, busy, plansLoading]);

  // ---- derived ------------------------------------------------------------

  const recipeById = useMemo(() => new Map(recipes.map((r) => [r.id, r])), [recipes]);

  const plansBySlot = useMemo(() => {
    const map = new Map<string, MealPlan[]>();
    for (const p of plans) {
      const key = `${p.date}|${p.meal_type}`;
      const list = map.get(key) ?? [];
      list.push(p);
      map.set(key, list);
    }
    return map;
  }, [plans]);

  const visiblePlans = useMemo(
    () => plans.filter((p) => dayKeys.includes(p.date) && (MEAL_TYPES as readonly string[]).includes(p.meal_type)),
    [plans, dayKeys]
  );

  const dayTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const d of dayKeys) totals[d] = 0;
    for (const p of visiblePlans) totals[p.date] += recipeById.get(p.recipe_id)?.calories ?? 0;
    return totals;
  }, [visiblePlans, dayKeys, recipeById]);

  const plannedDays = dayKeys.filter((d) => visiblePlans.some((p) => p.date === d)).length;
  const weekCalories = Object.values(dayTotals).reduce((a, b) => a + b, 0);
  const avgCalories = plannedDays ? Math.round(weekCalories / plannedDays) : 0;

  const fmtNum = (n: number) => n.toLocaleString(locale);
  const fmtShort = (d: Date) => d.toLocaleDateString(locale, { day: 'numeric', month: 'short' });
  const fmtLong = (d: Date) => d.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' });
  const rangeLabel = `${fmtShort(days[0])} – ${fmtShort(days[6])}`;
  const mealLabel = (m: string) => t(`meal.${m}`);
  const isCurrentWeek = dayKeys.includes(todayYMD);

  // ---- actions ------------------------------------------------------------

  const announce = (msg: string) => {
    setActionError('');
    setStatus(msg);
  };
  const fail = (msg: string) => {
    setStatus('');
    setActionError(msg);
  };

  const shiftWeek = (delta: number) => {
    setStatus('');
    setActionError('');
    setWeekStart((w) => addDays(w, delta * 7));
  };

  const goThisWeek = () => {
    setStatus('');
    setActionError('');
    setWeekStart(startOfWeek(new Date(), WEEK_STARTS_ON));
    setSelectedDay(toYMD(new Date()));
  };

  const addRecipe = async (slot: Slot, recipe: Recipe) => {
    setPickerSlot(null);
    setBusy(true);
    try {
      await mealPlanApi.create({ recipeId: recipe.id, date: slot.date, mealType: slot.mealType });
      announce(t('mealPlan.added', { recipe: recipeName(recipe, lang) }));
      setPendingFocus(slotId('remove', slot.date, slot.mealType));
      await loadWeekRef.current();
    } catch (err) {
      if (statusOf(err) === 409) {
        fail(t('mealPlan.slotTaken'));
        await loadWeekRef.current();
      } else {
        console.error('Failed to add meal plan:', err);
        fail(t('common.error'));
      }
    } finally {
      setBusy(false);
    }
  };

  const removePlan = async (plan: MealPlan) => {
    const recipe = recipeById.get(plan.recipe_id);
    setBusy(true);
    try {
      await mealPlanApi.remove(plan.id);
      announce(t('mealPlan.removed', { recipe: recipe ? recipeName(recipe, lang) : '' }));
      setPendingFocus(slotId('add', plan.date, plan.meal_type));
      await loadWeekRef.current();
    } catch (err) {
      if (statusOf(err) === 404) {
        await loadWeekRef.current();
      } else {
        console.error('Failed to remove meal plan:', err);
        fail(t('common.error'));
      }
    } finally {
      setBusy(false);
    }
  };

  const runGenerate = async (overwrite: boolean) => {
    setConfirmCount(null);
    setGenerating(true);
    setStatus('');
    setActionError('');
    try {
      const res = await mealPlanApi.generate({
        startDate: startYMD,
        endDate: endYMD,
        mealTypes: GENERATED_MEAL_TYPES,
        overwrite,
      });
      const { createdCount = 0, skippedCount = 0 } = res.data ?? {};
      announce(
        createdCount === 0
          ? t('mealPlan.generatedNone')
          : skippedCount > 0
            ? t('mealPlan.generatedKept', { created: createdCount, skipped: skippedCount })
            : t('mealPlan.generated', { created: createdCount })
      );
      await loadWeekRef.current();
    } catch (err) {
      if (statusOf(err) === 409) {
        fail(t('mealPlan.slotTaken'));
        await loadWeekRef.current();
      } else {
        console.error('Failed to generate meal plans:', err);
        fail(t('common.error'));
      }
    } finally {
      setGenerating(false);
    }
  };

  const onGenerateClick = () => {
    const existing = visiblePlans.filter((p) =>
      (GENERATED_MEAL_TYPES as string[]).includes(p.meal_type)
    ).length;
    if (existing > 0) setConfirmCount(existing);
    else runGenerate(false);
  };

  // ---- tabs (ARIA tabs pattern) ------------------------------------------

  const tabs: { id: Tab; label: string; icon: JSX.Element }[] = [
    { id: 'plan', label: t('mealPlan.tabPlan'), icon: <CalendarDays size={16} aria-hidden="true" /> },
    { id: 'grocery', label: t('mealPlan.tabGrocery'), icon: <ShoppingCart size={16} aria-hidden="true" /> },
  ];
  const onTabKey = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    const idx = tabs.findIndex((x) => x.id === tab);
    let next = idx;
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') next = (idx + 1) % tabs.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = tabs.length - 1;
    else return;
    e.preventDefault();
    setTab(tabs[next].id);
    document.getElementById(`mp-tab-${tabs[next].id}`)?.focus();
  };

  // ---- rendering helpers --------------------------------------------------

  const renderSlot = (date: string, mealType: string, compact: boolean) => {
    const slotPlans = plansBySlot.get(`${date}|${mealType}`) ?? [];
    const dayLabel = fmtLong(parseYMD(date));
    if (slotPlans.length === 0) {
      return (
        <button
          id={slotId('add', date, mealType)}
          type="button"
          disabled={busy || plansLoading}
          onClick={() => setPickerSlot({ date, mealType })}
          aria-label={t('mealPlan.addTo', { meal: mealLabel(mealType), day: dayLabel })}
          className={`flex w-full items-center justify-center gap-1 rounded-xl border-2 border-dashed border-slate-200 text-sm font-medium text-slate-400 transition hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700 disabled:opacity-50 ${
            compact ? 'min-h-[4.5rem] px-1 py-2' : 'px-3 py-3'
          }`}
        >
          <Plus size={16} aria-hidden="true" />
          <span>{t('mealPlan.add')}</span>
        </button>
      );
    }
    return (
      <ul className="flex flex-col gap-1.5">
        {slotPlans.map((plan, i) => {
          const recipe = recipeById.get(plan.recipe_id);
          const name = recipe ? recipeName(recipe, lang) : recipesLoading ? '…' : t('mealPlan.unknownRecipe');
          return (
            <li
              key={plan.id}
              className={`flex items-start gap-1 rounded-xl bg-emerald-50 ring-1 ring-emerald-100 ${compact ? 'min-h-[4.5rem] p-2' : 'p-3'}`}
            >
              <div className="min-w-0 flex-1">
                <p className={`font-semibold text-slate-800 ${compact ? 'line-clamp-2 break-words text-xs' : 'text-sm'}`}>
                  {name}
                </p>
                {recipe?.calories != null && (
                  <p className="mt-0.5 text-xs text-slate-500">
                    <span className="num">{fmtNum(recipe.calories)}</span> {t('mealPlan.kcal')}
                  </p>
                )}
              </div>
              <button
                id={i === 0 ? slotId('remove', date, mealType) : undefined}
                type="button"
                disabled={busy}
                onClick={() => removePlan(plan)}
                aria-label={t('mealPlan.remove', { recipe: name, meal: mealLabel(mealType), day: dayLabel })}
                className="shrink-0 rounded-lg p-1 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
              >
                <X size={compact ? 14 : 16} aria-hidden="true" />
              </button>
            </li>
          );
        })}
      </ul>
    );
  };

  const weekTable = (
    <table className="w-full table-fixed border-separate border-spacing-1.5">
      <caption className="sr-only">{t('mealPlan.tableCaption', { range: rangeLabel })}</caption>
      <thead>
        <tr>
          <td className="w-24" />
          {days.map((d, i) => {
            const key = dayKeys[i];
            const isToday = key === todayYMD;
            return (
              <th
                key={key}
                scope="col"
                aria-current={isToday ? 'date' : undefined}
                className={`rounded-xl px-1 py-2 text-center text-xs font-semibold ${
                  isToday ? 'bg-emerald-600 text-white' : 'text-slate-600'
                }`}
              >
                <span className="block">{d.toLocaleDateString(locale, { weekday: 'short' })}</span>
                <span className="num block text-base font-bold">{d.getDate()}</span>
              </th>
            );
          })}
        </tr>
      </thead>
      <tbody>
        {MEAL_TYPES.map((m) => (
          <tr key={m}>
            <th scope="row" className="text-start align-top text-xs font-semibold text-slate-500">
              <span className="block pt-2">{mealLabel(m)}</span>
            </th>
            {dayKeys.map((d) => (
              <td key={d} className="align-top">
                {renderSlot(d, m, true)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr>
          <th scope="row" className="text-start text-xs font-semibold text-slate-500">
            {t('mealPlan.dayTotal')}
          </th>
          {dayKeys.map((d) => (
            <td key={d} className="rounded-xl bg-slate-50 py-2 text-center text-xs text-slate-600">
              <span className="num font-bold text-slate-900">{fmtNum(dayTotals[d] ?? 0)}</span>{' '}
              {t('mealPlan.kcal')}
            </td>
          ))}
        </tr>
      </tfoot>
    </table>
  );

  const selectedIndex = Math.max(0, dayKeys.indexOf(selectedDay));
  const selectedDate = days[selectedIndex];
  const selectedKey = dayKeys[selectedIndex];

  const dayView = (
    <div>
      <div role="group" aria-label={t('mealPlan.chooseDay')} className="grid grid-cols-7 gap-1">
        {days.map((d, i) => {
          const key = dayKeys[i];
          const selected = key === selectedKey;
          const isToday = key === todayYMD;
          const hasPlans = (dayTotals[key] ?? 0) > 0 || visiblePlans.some((p) => p.date === key);
          return (
            <button
              key={key}
              type="button"
              onClick={() => setSelectedDay(key)}
              aria-pressed={selected}
              aria-current={isToday ? 'date' : undefined}
              aria-label={fmtLong(d)}
              className={`flex flex-col items-center rounded-xl py-2 text-xs font-medium transition ${
                selected
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : isToday
                    ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
                    : 'bg-white text-slate-600 ring-1 ring-slate-100 hover:bg-slate-50'
              }`}
            >
              <span aria-hidden="true">{d.toLocaleDateString(locale, { weekday: 'narrow' })}</span>
              <span aria-hidden="true" className="num text-sm font-bold">
                {d.getDate()}
              </span>
              <span
                aria-hidden="true"
                className={`mt-0.5 h-1.5 w-1.5 rounded-full ${
                  hasPlans ? (selected ? 'bg-white' : 'bg-emerald-500') : 'bg-transparent'
                }`}
              />
            </button>
          );
        })}
      </div>

      <section
        aria-labelledby="mp-day-heading"
        className="mt-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100"
      >
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="mp-day-heading" className="font-semibold text-slate-900">
            {fmtLong(selectedDate)}
          </h2>
          <p className="text-sm text-slate-500">
            {t('mealPlan.dayTotal')}:{' '}
            <span className="num font-bold text-slate-900">{fmtNum(dayTotals[selectedKey] ?? 0)}</span>{' '}
            {t('mealPlan.kcal')}
          </p>
        </div>
        <ul className="flex flex-col gap-3">
          {MEAL_TYPES.map((m) => (
            <li key={m}>
              <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                {mealLabel(m)}
              </h3>
              {renderSlot(selectedKey, m, false)}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );

  // ---- page ---------------------------------------------------------------

  return (
    <div className="mx-auto max-w-6xl p-4 md:p-8">
      <PageHeader
        title={t('mealPlan.title')}
        subtitle={t('mealPlan.subtitle')}
        icon={<UtensilsCrossed size={24} />}
      />

      {/* Week navigation + generate */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => shiftWeek(-1)}
            aria-label={t('mealPlan.prevWeek')}
            className="rounded-xl p-2 text-slate-600 ring-1 ring-slate-200 transition hover:bg-slate-50"
          >
            <ChevronLeft size={18} aria-hidden="true" className="rtl:rotate-180" />
          </button>
          <h2 className="min-w-[9rem] px-2 text-center text-sm font-semibold text-slate-800" aria-live="polite">
            {t('mealPlan.weekOf', { range: rangeLabel })}
          </h2>
          <button
            type="button"
            onClick={() => shiftWeek(1)}
            aria-label={t('mealPlan.nextWeek')}
            className="rounded-xl p-2 text-slate-600 ring-1 ring-slate-200 transition hover:bg-slate-50"
          >
            <ChevronRight size={18} aria-hidden="true" className="rtl:rotate-180" />
          </button>
          {!isCurrentWeek && (
            <button
              type="button"
              onClick={goThisWeek}
              className="ms-1 rounded-xl px-3 py-2 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-50"
            >
              {t('mealPlan.thisWeek')}
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={onGenerateClick}
          disabled={generating || plansLoading || busy}
          className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-emerald-100 transition hover:bg-emerald-700 disabled:opacity-50"
        >
          <Sparkles size={16} aria-hidden="true" />
          {generating ? t('mealPlan.generating') : t('mealPlan.generate')}
        </button>
      </div>

      {/* Stats */}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard
          label={t('mealPlan.statPlanned')}
          value={visiblePlans.length}
          icon={<UtensilsCrossed size={18} />}
        />
        <StatCard
          label={t('mealPlan.statAvg')}
          value={fmtNum(avgCalories)}
          unit={t('mealPlan.kcal')}
          icon={<Flame size={18} />}
          color="amber"
        />
        <div className="col-span-2 sm:col-span-1">
          <StatCard
            label={t('mealPlan.statItems')}
            value={grocery.length}
            icon={<ListChecks size={18} />}
            color="sky"
          />
        </div>
      </div>

      {/* Live feedback */}
      <p role="status" aria-live="polite" className="mb-2 min-h-[1.25rem] text-sm text-emerald-700">
        {plansLoading || generating ? t('common.loading') : status}
      </p>
      {actionError && (
        <p role="alert" className="mb-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">
          {actionError}
        </p>
      )}

      {/* Tabs */}
      <div role="tablist" aria-label={t('mealPlan.tabsLabel')} className="mb-4 inline-flex gap-1 rounded-2xl bg-slate-100 p-1">
        {tabs.map((x) => {
          const selected = tab === x.id;
          return (
            <button
              key={x.id}
              id={`mp-tab-${x.id}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`mp-panel-${x.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setTab(x.id)}
              onKeyDown={onTabKey}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition ${
                selected ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {x.icon}
              {x.label}
              {x.id === 'grocery' && grocery.length > 0 && (
                <span className="num rounded-full bg-emerald-100 px-1.5 text-xs text-emerald-700">
                  {grocery.length}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div
        id="mp-panel-plan"
        role="tabpanel"
        aria-labelledby="mp-tab-plan"
        hidden={tab !== 'plan'}
        tabIndex={0}
      >
        {plansError ? (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-rose-50 p-4 text-sm text-rose-700">
            <span>{t('mealPlan.loadError')}</span>
            <button
              type="button"
              onClick={loadWeek}
              className="rounded-lg bg-white px-3 py-1.5 font-semibold text-rose-700 ring-1 ring-rose-200 hover:bg-rose-100"
            >
              {t('mealPlan.retry')}
            </button>
          </div>
        ) : (
          <>
            {!plansLoading && visiblePlans.length === 0 && (
              <p className="mb-3 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{t('mealPlan.empty')}</p>
            )}
            {isWide ? (
              <div className="rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-100">{weekTable}</div>
            ) : (
              dayView
            )}
          </>
        )}
      </div>

      <div
        id="mp-panel-grocery"
        role="tabpanel"
        aria-labelledby="mp-tab-grocery"
        hidden={tab !== 'grocery'}
        tabIndex={0}
      >
        {tab === 'grocery' && (
          <GroceryList
            weekStart={startYMD}
            rangeLabel={rangeLabel}
            items={grocery}
            loading={groceryLoading}
            error={groceryError}
            onRetry={loadWeek}
          />
        )}
      </div>

      {pickerSlot && (
        <RecipePicker
          recipes={recipes}
          loading={recipesLoading}
          error={recipesError}
          onRetry={loadRecipes}
          mealType={pickerSlot.mealType}
          mealLabel={mealLabel(pickerSlot.mealType)}
          dayLabel={fmtLong(parseYMD(pickerSlot.date))}
          onPick={(recipe) => addRecipe(pickerSlot, recipe)}
          onClose={() => setPickerSlot(null)}
        />
      )}

      {confirmCount !== null && (
        <Dialog
          role="alertdialog"
          title={t('mealPlan.confirmTitle')}
          description={t('mealPlan.confirmBody', { count: confirmCount })}
          closeLabel={t('mealPlan.close')}
          onClose={() => setConfirmCount(null)}
        >
          <div className="flex flex-col gap-2 sm:flex-row-reverse sm:justify-start">
            <button
              type="button"
              onClick={() => runGenerate(false)}
              className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700"
            >
              {t('mealPlan.confirmFill')}
            </button>
            <button
              type="button"
              onClick={() => runGenerate(true)}
              className="rounded-xl bg-rose-50 px-4 py-2.5 text-sm font-semibold text-rose-700 ring-1 ring-rose-200 transition hover:bg-rose-100"
            >
              {t('mealPlan.confirmReplace')}
            </button>
            <button
              type="button"
              onClick={() => setConfirmCount(null)}
              className="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-600 ring-1 ring-slate-200 transition hover:bg-slate-50"
            >
              {t('common.cancel')}
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
};

export default MealPlanPage;
