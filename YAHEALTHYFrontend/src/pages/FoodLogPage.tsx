import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BookmarkPlus, Copy, PenLine, Star, Trash2, UtensilsCrossed } from 'lucide-react';
import {
  foodLogApi,
  type CatalogFood,
  type FoodItemInput,
  type FoodLog,
  type FoodSuggestion,
  type FoodTemplate,
  type MealType,
} from '@/services/api';
import { useLanguage } from '@/i18n/LanguageContext';
import PageHeader from '@/components/ui/PageHeader';
import EmptyState from '@/components/ui/EmptyState';
import { FoodSearch } from '@/components/food/FoodSearch';
import { PortionPicker } from '@/components/food/PortionPicker';
import { QuickAddForm } from '@/components/food/QuickAddForm';
import { LogAgainChips, SavedMeals } from '@/components/food/QuickLogPanels';
import { UndoSnackbar, type UndoState } from '@/components/food/UndoSnackbar';
import { addDaysISO, todayISO } from '@/utils/date';
import { currentMeal, dayTotals, groupByMeal, MEAL_TYPES, sameFood } from '@/utils/foodLogging';

const MEAL_EMOJI: Record<MealType, string> = {
  breakfast: '🌅',
  lunch: '☀️',
  dinner: '🌙',
  snack: '🍎',
};

type Composer = { mode: 'search' } | { mode: 'portion'; food: CatalogFood } | { mode: 'quick'; name: string };

/**
 * Food log. Fast paths first: search the sourced catalog (primary), "log
 * again" chips from the user's own history, favourites and saved meals, copy
 * yesterday's meal/day — all one tap, each followed by an Undo snackbar.
 * Quick add (calories only) is the fallback for foods not in the catalog.
 */
export const FoodLogPage = () => {
  const { t } = useLanguage();
  const [foodLogs, setFoodLogs] = useState<FoodLog[]>([]);
  const [yesterdayLogs, setYesterdayLogs] = useState<FoodLog[]>([]);
  const [suggestions, setSuggestions] = useState<FoodSuggestion[]>([]);
  const [templates, setTemplates] = useState<FoodTemplate[]>([]);
  const [meal, setMeal] = useState<MealType>(() => currentMeal());
  const [composer, setComposer] = useState<Composer>({ mode: 'search' });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [undo, setUndo] = useState<UndoState | null>(null);
  const undoSeq = useRef(0);

  const today = todayISO();
  const yesterday = addDaysISO(-1);

  const fetchDay = useCallback(async () => {
    try {
      const [todayRes, yRes] = await Promise.all([
        foodLogApi.getAll({ date: today }),
        foodLogApi.getAll({ date: yesterday }),
      ]);
      setFoodLogs(todayRes.data);
      setYesterdayLogs(yRes.data);
    } catch {
      setError(t('common.error'));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [today, yesterday]);

  const fetchSuggestions = useCallback(async (m: MealType) => {
    try {
      const res = await foodLogApi.suggestions({ meal: m });
      setSuggestions(res.data.suggestions);
    } catch {
      setSuggestions([]);
    }
  }, []);

  const fetchTemplates = useCallback(async () => {
    try {
      const res = await foodLogApi.templates();
      setTemplates(res.data);
    } catch {
      setTemplates([]);
    }
  }, []);

  useEffect(() => {
    fetchDay();
    fetchTemplates();
  }, [fetchDay, fetchTemplates]);

  useEffect(() => {
    fetchSuggestions(meal);
  }, [meal, fetchSuggestions]);

  /** Every one-tap path ends here: refresh, then offer Undo for exactly these rows. */
  const afterLog = (logs: FoodLog[], label?: string) => {
    setError('');
    setNotice('');
    if (logs.length) {
      undoSeq.current += 1;
      setUndo({
        key: undoSeq.current,
        ids: logs.map((l) => l.id),
        message: logs.length === 1 ? t('food.undo.logged', { name: label ?? logs[0].name }) : t('food.undo.loggedMany', { n: logs.length }),
      });
    }
    fetchDay();
    fetchSuggestions(meal);
  };

  const run = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
    } catch {
      setError(t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  const logItem = (item: FoodItemInput, label?: string) =>
    run(async () => {
      const res = await foodLogApi.log({ date: today, mealType: meal, ...item });
      afterLog([res.data], label);
      setComposer({ mode: 'search' });
    });

  const logSuggestion = (s: FoodSuggestion) =>
    logItem(
      s.foodId && s.quantity
        ? { foodId: s.foodId, grams: s.quantity, name: s.name }
        : {
            name: s.name,
            calories: s.calories,
            proteinGrams: s.proteinGrams,
            carbsGrams: s.carbsGrams,
            fatGrams: s.fatGrams,
            quantity: s.quantity,
            unit: s.unit,
          },
    );

  const logTemplate = (tpl: FoodTemplate) =>
    run(async () => {
      const res = await foodLogApi.logTemplate(tpl.id, { date: today, mealType: meal });
      afterLog(res.data.logs, tpl.name);
    });

  const copyYesterday = (mealType?: MealType) =>
    run(async () => {
      const res = await foodLogApi.copy(
        mealType ? { fromDate: yesterday, toDate: today, mealType } : { fromDate: yesterday, toDate: today },
      );
      if (!res.data.copiedCount) {
        setNotice(t('food.copy.nothing'));
        return;
      }
      afterLog(res.data.logs);
    });

  const handleUndo = (ids: string[]) =>
    run(async () => {
      setUndo(null);
      await foodLogApi.undo(ids);
      setNotice(t('food.undo.undone'));
      fetchDay();
      fetchSuggestions(meal);
    });

  const handleDelete = (id: string) =>
    run(async () => {
      await foodLogApi.delete(id);
      fetchDay();
    });

  // ── favourites ──
  const favoriteFor = (food: { food_id?: string | null; name: string }) =>
    templates.find((tpl) => tpl.kind === 'food' && sameFood(tpl, food));

  const toggleFavorite = (item: FoodItemInput & { name: string }, foodId?: string | null) =>
    run(async () => {
      const existing = favoriteFor({ food_id: foodId ?? null, name: item.name });
      if (existing) {
        await foodLogApi.deleteTemplate(existing.id);
      } else {
        await foodLogApi.saveFavorite({ ...item, mealType: meal });
      }
      await fetchTemplates();
    });

  const toggleLogFavorite = (log: FoodLog) =>
    toggleFavorite(
      log.food_id && log.quantity
        ? { foodId: log.food_id, grams: Number(log.quantity), name: log.name }
        : {
            name: log.name,
            calories: Number(log.calories) || 0,
            proteinGrams: log.protein_grams ?? null,
            carbsGrams: log.carbs_grams ?? null,
            fatGrams: log.fat_grams ?? null,
            quantity: log.quantity ?? null,
            unit: log.unit ?? null,
          },
      log.food_id,
    );

  const saveMeal = (mealType: MealType) =>
    run(async () => {
      const name = t('food.saveMeal.defaultName', { meal: t(`meal.${mealType}`) });
      await foodLogApi.saveMealFromLog({ date: today, mealType, name });
      await fetchTemplates();
      setNotice(t('food.saveMeal.saved', { name }));
    });

  const renameTemplate = (tpl: FoodTemplate, name: string) =>
    run(async () => {
      await foodLogApi.renameTemplate(tpl.id, name);
      await fetchTemplates();
    });

  const deleteTemplate = (tpl: FoodTemplate) =>
    run(async () => {
      await foodLogApi.deleteTemplate(tpl.id);
      await fetchTemplates();
    });

  const groupedByMeal = useMemo(() => groupByMeal(foodLogs), [foodLogs]);
  const yesterdayByMeal = useMemo(() => groupByMeal(yesterdayLogs), [yesterdayLogs]);
  const todayTotals = useMemo(() => dayTotals(foodLogs), [foodLogs]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center" role="status" aria-label={t('common.loading')}>
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-emerald-200 border-t-emerald-600" />
      </div>
    );
  }

  const pill = (active: boolean) =>
    `rounded-full px-4 py-2 text-sm font-medium transition ${
      active ? 'bg-emerald-700 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
    }`;

  return (
    <div className="mx-auto max-w-4xl p-4 pb-28 md:p-8">
      <PageHeader title={t('food.title')} icon={<UtensilsCrossed size={24} />} />

      {/* Composer: meal slot + search (primary) / portion / quick add */}
      <section aria-label={t('food.logFood')} className="mb-4 space-y-4 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-100 md:p-6">
        <div role="group" aria-label={t('food.loggingTo')} className="flex flex-wrap items-center gap-2">
          <span className="me-1 text-sm font-medium text-slate-500" aria-hidden="true">{t('food.loggingTo')}</span>
          {MEAL_TYPES.map((type) => (
            <button key={type} type="button" aria-pressed={meal === type} onClick={() => setMeal(type)} className={pill(meal === type)}>
              <span aria-hidden="true">{MEAL_EMOJI[type]}</span> {t(`meal.${type}`)}
            </button>
          ))}
        </div>

        {composer.mode === 'search' && (
          <>
            <FoodSearch
              onPick={(food) => setComposer({ mode: 'portion', food })}
              onQuickAdd={(name) => setComposer({ mode: 'quick', name })}
            />
            <button
              type="button"
              onClick={() => setComposer({ mode: 'quick', name: '' })}
              className="flex items-center gap-2 text-sm font-medium text-emerald-700 hover:text-emerald-800"
            >
              <PenLine size={16} aria-hidden="true" /> {t('food.quickAdd.toggle')}
            </button>
          </>
        )}
        {composer.mode === 'portion' && (
          <PortionPicker
            food={composer.food}
            busy={busy}
            isFavorite={Boolean(favoriteFor({ food_id: composer.food.id, name: '' }))}
            onLog={(grams, name) => logItem({ foodId: composer.food.id, grams, name }, name)}
            onToggleFavorite={(grams, name) => toggleFavorite({ foodId: composer.food.id, grams, name }, composer.food.id)}
            onBack={() => setComposer({ mode: 'search' })}
          />
        )}
        {composer.mode === 'quick' && (
          <QuickAddForm
            initialName={composer.name}
            busy={busy}
            onSubmit={(item) => logItem(item)}
            onCancel={() => setComposer({ mode: 'search' })}
          />
        )}

        {error && (
          <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </p>
        )}
      </section>

      <div className="mb-6 grid gap-4 md:grid-cols-2">
        <LogAgainChips suggestions={suggestions} busy={busy} onLog={logSuggestion} />
        <SavedMeals templates={templates} busy={busy} onLog={logTemplate} onRename={renameTemplate} onDelete={deleteTemplate} />
      </div>

      <p role="status" aria-live="polite" className={notice ? 'mb-4 rounded-xl bg-slate-50 px-4 py-2.5 text-sm text-slate-600' : 'sr-only'}>
        {notice}
      </p>

      {/* Today's totals */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-emerald-50 px-5 py-4 ring-1 ring-emerald-100">
        <span className="shrink-0 whitespace-nowrap text-sm font-semibold text-emerald-800">{t('food.totalToday')}</span>
        <div className="flex flex-wrap justify-end gap-x-4 gap-y-1 text-sm font-medium text-emerald-700">
          <span className="whitespace-nowrap"><span className="num">{todayTotals.calories}</span> {t('common.kcal')}</span>
          <span className="whitespace-nowrap">{t('common.proteinShort')} <span className="num">{todayTotals.protein.toFixed(0)}</span>{'\u00a0'}{t('common.grams')}</span>
          <span className="whitespace-nowrap">{t('common.carbsShort')} <span className="num">{todayTotals.carbs.toFixed(0)}</span>{'\u00a0'}{t('common.grams')}</span>
          <span className="whitespace-nowrap">{t('common.fatShort')} <span className="num">{todayTotals.fat.toFixed(0)}</span>{'\u00a0'}{t('common.grams')}</span>
        </div>
      </div>

      {yesterdayLogs.length > 0 && (
        <div className="mb-4 flex justify-end">
          <button
            type="button"
            disabled={busy}
            onClick={() => copyYesterday()}
            className="flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-50 disabled:opacity-60"
          >
            <Copy size={16} aria-hidden="true" /> {t('food.copy.day')}
          </button>
        </div>
      )}

      {/* Logs grouped by meal */}
      <h2 className="sr-only">{t('food.todayLogs')}</h2>
      {foodLogs.length === 0 && yesterdayLogs.length === 0 ? (
        <EmptyState icon={<UtensilsCrossed size={26} />} text={t('food.noLogs')} />
      ) : (
        <div className="space-y-4">
          {MEAL_TYPES.filter((type) => groupedByMeal[type].length > 0 || yesterdayByMeal[type].length > 0).map((type) => {
            const mealName = t(`meal.${type}`);
            const items = groupedByMeal[type];
            return (
              <section key={type} aria-labelledby={`meal-${type}`} className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-100">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50 px-5 py-3">
                  <h3 id={`meal-${type}`} className="font-semibold text-slate-700">
                    <span aria-hidden="true">{MEAL_EMOJI[type]}</span> {mealName}
                    <span className="num ms-2 text-sm font-normal text-slate-500">({items.length})</span>
                  </h3>
                  <div className="flex flex-wrap gap-1.5">
                    {yesterdayByMeal[type].length > 0 && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => copyYesterday(type)}
                        aria-label={t('food.copy.mealLabel', { meal: mealName })}
                        className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-emerald-700 transition hover:bg-emerald-50 disabled:opacity-60"
                      >
                        <Copy size={14} aria-hidden="true" /> {t('food.copy.meal')}
                      </button>
                    )}
                    {items.length > 0 && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => saveMeal(type)}
                        aria-label={t('food.saveMeal', { meal: mealName })}
                        className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-amber-700 transition hover:bg-amber-50 disabled:opacity-60"
                      >
                        <BookmarkPlus size={14} aria-hidden="true" /> {t('food.saveMeal.short')}
                      </button>
                    )}
                  </div>
                </div>
                {items.length === 0 ? (
                  <p className="px-5 py-3 text-sm text-slate-500">{t('food.meal.empty')}</p>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {items.map((log) => {
                      const fav = Boolean(favoriteFor(log));
                      return (
                        <li key={log.id} className="flex items-center justify-between gap-2 px-5 py-4">
                          <div className="min-w-0 flex-1">
                            {/* Names are user text in either language: isolate their direction, and wrap rather than truncate. */}
                            <h4 className="break-words font-medium text-slate-800"><bdi>{log.name}</bdi></h4>
                            <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-500">
                              {log.quantity != null && (
                                <span className="num">
                                  {log.quantity} {log.unit === 'g' || !log.unit ? t('common.grams') : log.unit}
                                </span>
                              )}
                              <span>{t('common.proteinShort')} <span className="num">{Number(log.protein_grams || 0).toFixed(1)}</span>{'\u00a0'}{t('common.grams')}</span>
                              <span>{t('common.carbsShort')} <span className="num">{Number(log.carbs_grams || 0).toFixed(1)}</span>{'\u00a0'}{t('common.grams')}</span>
                              <span>{t('common.fatShort')} <span className="num">{Number(log.fat_grams || 0).toFixed(1)}</span>{'\u00a0'}{t('common.grams')}</span>
                            </div>
                          </div>
                          <div className="flex shrink-0 items-center gap-1">
                            <span className="me-2 whitespace-nowrap font-semibold text-slate-700"><span className="num">{Math.round(Number(log.calories) || 0)}</span> {t('common.kcal')}</span>
                            <button
                              type="button"
                              onClick={() => toggleLogFavorite(log)}
                              aria-pressed={fav}
                              aria-label={fav ? t('food.fav.remove', { name: log.name }) : t('food.fav.add', { name: log.name })}
                              className="rounded-lg p-2 text-amber-400 transition hover:bg-amber-50 hover:text-amber-500"
                            >
                              <Star size={17} fill={fav ? 'currentColor' : 'none'} aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(log.id)}
                              className="rounded-lg p-2 text-slate-500 transition hover:bg-rose-50 hover:text-rose-500"
                              aria-label={t('food.deleteItem', { name: log.name })}
                            >
                              <Trash2 size={17} aria-hidden="true" />
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      )}

      <UndoSnackbar state={undo} onUndo={handleUndo} onDismiss={() => setUndo(null)} />
    </div>
  );
};
