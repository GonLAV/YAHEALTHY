import { KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CalendarDays, ChevronLeft, ChevronRight, RefreshCw, Shuffle, Lock, LockOpen,
  ShoppingCart, Copy, MessageCircle, AlertTriangle, Info, CheckCircle2,
} from 'lucide-react';
import {
  mealPlanApi, type MealSlot, type PlannedDay, type PlannedMeal, type WeekPlan, type PlanTargets,
} from '@/services/api';
import { useLanguage } from '@/i18n/LanguageContext';
import PageHeader from '@/components/ui/PageHeader';
import ProgressBar from '@/components/ui/ProgressBar';
import EmptyState from '@/components/ui/EmptyState';
import { todayISO, parseLocalDate } from '@/utils/date';
import {
  weekStartOf, shiftWeek, todayIndex, formatIngredientAmount, formatAmount, stateNote,
  shoppingListText, whatsappShareUrl, toggleChecked,
} from '@/utils/mealPlan';

type Tab = 'meals' | 'shopping';
type Status = { kind: 'info' | 'error'; text: string } | null;

const errorCode = (err: unknown): string | undefined =>
  (err as { response?: { data?: { code?: string } } })?.response?.data?.code;

export const MealPlanPage = () => {
  const { t, lang } = useLanguage();
  const locale = lang === 'he' ? 'he-IL' : 'en-GB';
  const [weekStart, setWeekStart] = useState(() => weekStartOf(todayISO()));
  const [plan, setPlan] = useState<WeekPlan | null>(null);
  const [targets, setTargets] = useState<PlanTargets | null>(null);
  const [checked, setChecked] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>(null);
  const [tab, setTab] = useState<Tab>('meals');
  const [day, setDay] = useState(() => todayIndex(weekStartOf(todayISO()), todayISO()));
  const tabRefs = useRef<Record<Tab, HTMLButtonElement | null>>({ meals: null, shopping: null });
  const dayRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const dayName = useCallback(
    (iso: string, style: 'long' | 'short' = 'long') =>
      new Intl.DateTimeFormat(locale, { weekday: style }).format(parseLocalDate(iso)),
    [locale],
  );
  const shortDate = useCallback(
    (iso: string) => new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(parseLocalDate(iso)),
    [locale],
  );
  const num = useCallback((n: number) => new Intl.NumberFormat(lang === 'he' ? 'he-IL' : 'en-US').format(Math.round(n)), [lang]);
  const weekRange = useMemo(() => {
    const end = parseLocalDate(weekStart);
    end.setDate(end.getDate() + 6);
    return `${shortDate(weekStart)} – ${new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(end)}`;
  }, [weekStart, shortDate, locale]);

  const load = useCallback(async (start: string) => {
    setLoading(true);
    setLoadError(false);
    try {
      const res = await mealPlanApi.getWeek(start);
      setPlan(res.data.plan);
      setTargets(res.data.plan?.targets ?? res.data.targets ?? null);
      setChecked(res.data.checked ?? []);
    } catch (err) {
      console.error('Failed to load meal plan:', err);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(weekStart);
    setDay(todayIndex(weekStart, todayISO()));
    setStatus(null);
  }, [weekStart, load]);

  const apply = (data: { plan: WeekPlan | null; checked: string[] }) => {
    setPlan(data.plan);
    if (data.plan) setTargets(data.plan.targets);
    setChecked(data.checked ?? []);
  };

  const generate = async () => {
    setBusy('generate');
    setStatus(null);
    try {
      const res = await mealPlanApi.generate(weekStart);
      apply(res.data);
      setStatus({ kind: 'info', text: t('mealPlan.generated') });
    } catch (err) {
      console.error('Failed to generate meal plan:', err);
      setStatus({ kind: 'error', text: t('mealPlan.actionError') });
    } finally {
      setBusy(null);
    }
  };

  const swap = async (dayIndex: number, slot: MealSlot) => {
    setBusy(`swap-${dayIndex}-${slot}`);
    setStatus(null);
    try {
      const res = await mealPlanApi.swap(weekStart, dayIndex, slot);
      apply(res.data);
      const meal = res.data.plan?.days[dayIndex]?.meals.find((m) => m.slot === slot);
      setStatus({ kind: 'info', text: t('mealPlan.swapped', { meal: meal?.name?.[lang] ?? '' }) });
    } catch (err) {
      setStatus({ kind: 'error', text: t(errorCode(err) === 'no-alternative' ? 'mealPlan.noAlternative' : 'mealPlan.actionError') });
    } finally {
      setBusy(null);
    }
  };

  const lock = async (dayIndex: number, slot: MealSlot, locked: boolean) => {
    setBusy(`lock-${dayIndex}-${slot}`);
    setStatus(null);
    try {
      const res = await mealPlanApi.lock(weekStart, dayIndex, slot, locked);
      apply(res.data);
      setStatus({ kind: 'info', text: t(locked ? 'mealPlan.lockedMsg' : 'mealPlan.unlockedMsg') });
    } catch {
      setStatus({ kind: 'error', text: t('mealPlan.actionError') });
    } finally {
      setBusy(null);
    }
  };

  // Ticks: the latest full list wins; requests go out one at a time.
  const saving = useRef(Promise.resolve());
  const [saveError, setSaveError] = useState(false);
  const saveChecked = (next: string[]) => {
    setChecked(next);
    const start = weekStart;
    saving.current = saving.current.then(() =>
      mealPlanApi.setChecked(start, next).then(
        () => setSaveError(false),
        () => setSaveError(true),
      ),
    );
  };

  const onTabKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    const next: Tab = tab === 'meals' ? 'shopping' : 'meals';
    setTab(next);
    tabRefs.current[next]?.focus();
  };

  const onDayKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    const rtl = lang === 'he';
    const map: Record<string, number> = {
      ArrowRight: rtl ? -1 : 1,
      ArrowLeft: rtl ? 1 : -1,
    };
    let next = day;
    if (e.key in map) next = (day + map[e.key] + 7) % 7;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = 6;
    else return;
    e.preventDefault();
    setDay(next);
    dayRefs.current[next]?.focus();
  };

  const when = (d: PlannedDay, slot: MealSlot) => `${dayName(d.date)}, ${t(`meal.${slot}`)}`;
  const PrevIcon = lang === 'he' ? ChevronRight : ChevronLeft;
  const NextIcon = lang === 'he' ? ChevronLeft : ChevronRight;

  // Render helpers (not components) so <details> state survives re-renders.
  const mealCard = ({ d, dayIndex, meal, compact }: { d: PlannedDay; dayIndex: number; meal: PlannedMeal; compact?: boolean }) => {
    const name = meal.name?.[lang];
    return (
      <article
        key={meal.slot}
        aria-label={`${t(`meal.${meal.slot}`)}: ${name ?? t('mealPlan.emptySlot')}`}
        className={`flex h-full flex-col rounded-2xl bg-white p-3 shadow-sm ring-1 ${meal.locked ? 'ring-emerald-300' : 'ring-slate-100'}`}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t(`meal.${meal.slot}`)}</span>
          {meal.locked && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
              <Lock size={12} aria-hidden="true" />
              {t('mealPlan.locked')}
            </span>
          )}
        </div>
        {name ? (
          <>
            <h3 className={`mt-1 font-semibold text-slate-900 ${compact ? 'text-sm' : 'text-base'}`}>{name}</h3>
            {meal.totals && (
              <p className="mt-0.5 text-xs text-slate-500">
                {t('mealPlan.mealTotals', { kcal: num(meal.totals.kcal), protein: num(meal.totals.protein) })}
              </p>
            )}
            <details className="mt-2 text-sm" open={!compact}>
              <summary className="cursor-pointer text-xs font-medium text-emerald-700">{t('mealPlan.ingredients')}</summary>
              <ul className="mt-1 space-y-0.5 text-slate-700">
                {meal.items.map((i) => (
                  <li key={i.id} className="flex justify-between gap-2 text-xs">
                    <span>{i[lang]}</span>
                    <span className="shrink-0 text-slate-500">{formatIngredientAmount(i, lang, t)}</span>
                  </li>
                ))}
              </ul>
            </details>
            <div className="mt-auto flex gap-2 pt-3">
              <button
                type="button"
                onClick={() => swap(dayIndex, meal.slot)}
                disabled={meal.locked || busy !== null}
                aria-label={t('mealPlan.swapLabel', { meal: name, when: when(d, meal.slot) })}
                className="inline-flex flex-1 items-center justify-center gap-1 rounded-xl border border-slate-200 px-2 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-40"
              >
                <Shuffle size={14} aria-hidden="true" />
                {t('mealPlan.swap')}
              </button>
              <button
                type="button"
                onClick={() => lock(dayIndex, meal.slot, !meal.locked)}
                disabled={busy !== null}
                aria-pressed={meal.locked}
                aria-label={t(meal.locked ? 'mealPlan.unlockLabel' : 'mealPlan.lockLabel', { meal: name, when: when(d, meal.slot) })}
                className={`inline-flex flex-1 items-center justify-center gap-1 rounded-xl px-2 py-1.5 text-xs font-semibold transition disabled:opacity-40 ${
                  meal.locked ? 'bg-emerald-600 text-white hover:bg-emerald-700' : 'border border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                {meal.locked ? <Lock size={14} aria-hidden="true" /> : <LockOpen size={14} aria-hidden="true" />}
                {t(meal.locked ? 'mealPlan.unlock' : 'mealPlan.lock')}
              </button>
            </div>
          </>
        ) : (
          <p className="mt-2 text-xs text-slate-500">{t('mealPlan.emptySlot')}</p>
        )}
      </article>
    );
  };

  const dayTotals = (d: PlannedDay) => {
    if (!d.totals || !targets) return null;
    const rows: { key: string; value: number; target: number | null; color: string }[] = [
      { key: 'mealPlan.dayKcal', value: d.totals.kcal, target: targets.calories, color: 'bg-emerald-500' },
      { key: 'mealPlan.dayProtein', value: d.totals.protein, target: targets.protein, color: 'bg-sky-500' },
      { key: 'mealPlan.dayCarbs', value: d.totals.carbs, target: targets.carbs, color: 'bg-amber-500' },
      { key: 'mealPlan.dayFat', value: d.totals.fat, target: targets.fat, color: 'bg-violet-500' },
    ];
    const ok = d.withinTolerance ? d.withinTolerance.kcal && d.withinTolerance.protein : null;
    return (
      <div className="space-y-2">
        {rows.filter((r) => r.target).map((r) => (
          <div key={r.key}>
            <p className="mb-1 text-xs text-slate-600">{t(r.key, { value: num(r.value), target: num(r.target as number) })}</p>
            <ProgressBar value={r.value} target={r.target as number} color={r.color} height="h-2" />
          </div>
        ))}
        {!targets.calories && <p className="text-xs text-slate-600">{t('mealPlan.dayKcalOnly', { value: num(d.totals.kcal) })}</p>}
        {ok !== null && (
          <p className={`inline-flex items-center gap-1 text-xs font-semibold ${ok ? 'text-emerald-700' : 'text-amber-700'}`}>
            {ok ? <CheckCircle2 size={14} aria-hidden="true" /> : <AlertTriangle size={14} aria-hidden="true" />}
            {t(ok ? 'mealPlan.onTarget' : 'mealPlan.offTarget')}
          </p>
        )}
      </div>
    );
  };

  const shopping = plan?.shoppingList;
  const shoppingItems = shopping ? shopping.sections.flatMap((s) => s.items) : [];
  const doneCount = shoppingItems.filter((i) => checked.includes(i.key)).length;
  const shareText = shopping
    ? shoppingListText(
        { ...shopping, sections: shopping.sections.map((s) => ({ ...s, items: s.items.map((i) => ({ ...i, checked: checked.includes(i.key) })) })) },
        { lang, t, weekLabel: weekRange },
      )
    : '';
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const copyList = async () => {
    try {
      await navigator.clipboard.writeText(shareText);
      setCopyState('copied');
    } catch {
      setCopyState('failed');
    }
  };

  return (
    <div className="mx-auto max-w-7xl p-4 md:p-8">
      <PageHeader title={t('mealPlan.title')} subtitle={t('mealPlan.subtitle')} icon={<CalendarDays size={24} />} />

      {/* Week navigation */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setWeekStart((w) => shiftWeek(w, -1))}
            aria-label={t('mealPlan.prevWeek')}
            className="rounded-full p-2 text-slate-600 transition hover:bg-slate-100"
          >
            <PrevIcon size={20} aria-hidden="true" />
          </button>
          <h2 className="text-base font-semibold text-slate-900" aria-live="polite">
            {t('mealPlan.weekOf', { range: weekRange })}
          </h2>
          <button
            type="button"
            onClick={() => setWeekStart((w) => shiftWeek(w, 1))}
            aria-label={t('mealPlan.nextWeek')}
            className="rounded-full p-2 text-slate-600 transition hover:bg-slate-100"
          >
            <NextIcon size={20} aria-hidden="true" />
          </button>
          {weekStart !== weekStartOf(todayISO()) && (
            <button
              type="button"
              onClick={() => setWeekStart(weekStartOf(todayISO()))}
              className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-200"
            >
              {t('mealPlan.thisWeek')}
            </button>
          )}
        </div>
        {plan && (
          <button
            type="button"
            onClick={generate}
            disabled={busy !== null}
            className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-white px-4 py-2 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-50 disabled:opacity-50"
          >
            <RefreshCw size={16} aria-hidden="true" className={busy === 'generate' ? 'animate-spin' : ''} />
            {busy === 'generate' ? t('mealPlan.generating') : t('mealPlan.regenerate')}
          </button>
        )}
      </div>

      {/* Targets + safety notes */}
      {targets && targets.mode === 'target' && (
        <p className="mb-3 text-sm text-slate-600">
          <span className="font-semibold text-slate-800">{t('mealPlan.targets.title')}: </span>
          {t('mealPlan.targets.kcal', { n: num(targets.calories ?? 0) })}
          {targets.protein ? ` · ${t('mealPlan.targets.protein', { n: num(targets.protein) })}` : ''}
        </p>
      )}
      {plan && plan.warnings.length > 0 && (
        <ul className="mb-4 space-y-2">
          {plan.warnings.map((w) => (
            <li key={w} className="flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-100">
              <Info size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
              <span>
                {t(`mealPlan.warn.${w.replace(':', '.')}`)}
                {w === 'no-target' && (
                  <>
                    {' '}
                    <Link to="/settings" className="font-semibold underline">{t('mealPlan.setTargets')}</Link>
                  </>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}

      <div role="status" aria-live="polite" className="min-h-[1.5rem]">
        {status?.kind === 'info' && <p className="mb-3 text-sm font-medium text-emerald-700">{status.text}</p>}
        {loading && <p className="text-sm text-slate-500">{t('mealPlan.loading')}</p>}
      </div>
      {status?.kind === 'error' && (
        <p role="alert" className="mb-3 rounded-xl bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">{status.text}</p>
      )}

      {!loading && loadError && (
        <div role="alert" className="rounded-2xl bg-rose-50 p-4 text-sm text-rose-700">
          {t('mealPlan.error')}{' '}
          <button type="button" onClick={() => load(weekStart)} className="font-semibold underline">{t('mealPlan.retry')}</button>
        </div>
      )}

      {!loading && !loadError && !plan && (
        <div className="space-y-4">
          <EmptyState icon={<CalendarDays size={28} />} text={t('mealPlan.empty')} />
          <div className="flex justify-center">
            <button
              type="button"
              onClick={generate}
              disabled={busy !== null}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-6 py-3 text-sm font-semibold text-white shadow-md shadow-emerald-200 transition hover:bg-emerald-700 disabled:opacity-50"
            >
              <CalendarDays size={18} aria-hidden="true" />
              {busy === 'generate' ? t('mealPlan.generating') : t('mealPlan.generate')}
            </button>
          </div>
        </div>
      )}

      {!loading && plan && (
        <>
          <div role="tablist" aria-label={t('mealPlan.tabsLabel')} className="mb-4 inline-flex rounded-2xl bg-slate-100 p-1">
            {(['meals', 'shopping'] as Tab[]).map((id) => (
              <button
                key={id}
                ref={(el) => { tabRefs.current[id] = el; }}
                type="button"
                role="tab"
                id={`mp-tab-${id}`}
                aria-selected={tab === id}
                aria-controls={`mp-panel-${id}`}
                tabIndex={tab === id ? 0 : -1}
                onClick={() => setTab(id)}
                onKeyDown={onTabKey}
                className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold transition ${
                  tab === id ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {id === 'meals' ? <CalendarDays size={16} aria-hidden="true" /> : <ShoppingCart size={16} aria-hidden="true" />}
                {t(`mealPlan.tab.${id}`)}
              </button>
            ))}
          </div>

          {tab === 'meals' && (
            <div role="tabpanel" id="mp-panel-meals" aria-labelledby="mp-tab-meals">
              {/* Desktop: the whole week as a grid, one row per day */}
              <div className="hidden space-y-3 lg:block">
                {plan.days.map((d, i) => (
                  <section key={d.date} aria-labelledby={`mp-day-${i}`} className="grid grid-cols-[10rem_repeat(4,minmax(0,1fr))] gap-3 rounded-3xl bg-slate-100/60 p-3">
                    <div className="space-y-2 p-1">
                      <h3 id={`mp-day-${i}`} className="font-bold text-slate-900">
                        {dayName(d.date)} <span className="block text-xs font-normal text-slate-500">{shortDate(d.date)}</span>
                      </h3>
                      {dayTotals(d)}
                    </div>
                    {d.meals.map((m) => mealCard({ d, dayIndex: i, meal: m, compact: true }))}
                  </section>
                ))}
              </div>

              {/* Mobile / tablet: one day at a time */}
              <div className="lg:hidden">
                <div role="tablist" aria-label={t('mealPlan.daysLabel')} className="-mx-1 mb-3 flex gap-1 overflow-x-auto px-1 pb-1">
                  {plan.days.map((d, i) => (
                    <button
                      key={d.date}
                      ref={(el) => { dayRefs.current[i] = el; }}
                      type="button"
                      role="tab"
                      id={`mp-daytab-${i}`}
                      aria-selected={day === i}
                      aria-controls="mp-daypanel"
                      aria-label={`${dayName(d.date)} ${shortDate(d.date)}`}
                      tabIndex={day === i ? 0 : -1}
                      onClick={() => setDay(i)}
                      onKeyDown={onDayKey}
                      className={`flex min-w-[3.25rem] flex-col items-center rounded-xl px-2 py-1.5 text-xs font-semibold transition ${
                        day === i ? 'bg-emerald-600 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200'
                      }`}
                    >
                      <span>{dayName(d.date, 'short')}</span>
                      <span className="num text-[11px] font-normal">{parseLocalDate(d.date).getDate()}</span>
                    </button>
                  ))}
                </div>
                {plan.days[day] && (
                  <div role="tabpanel" id="mp-daypanel" aria-labelledby={`mp-daytab-${day}`} className="space-y-3">
                    <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
                      <h3 className="mb-2 font-bold text-slate-900">{dayName(plan.days[day].date)}</h3>
                      {dayTotals(plan.days[day])}
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {plan.days[day].meals.map((m) => mealCard({ d: plan.days[day], dayIndex: day, meal: m }))}
                    </div>
                  </div>
                )}
              </div>
              <p className="mt-6 text-xs text-slate-500">{t('mealPlan.note')}</p>
            </div>
          )}

          {tab === 'shopping' && shopping && (
            <div role="tabpanel" id="mp-panel-shopping" aria-labelledby="mp-tab-shopping" className="max-w-2xl space-y-4">
              <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
                <h2 className="text-lg font-bold text-slate-900">{t('mealPlan.shopping.title')}</h2>
                <p className="mt-0.5 text-sm text-slate-500">{t('mealPlan.shopping.hint')}</p>
                <p className="mt-2 text-sm font-medium text-slate-700" aria-live="polite">
                  {t('mealPlan.shopping.progress', { done: doneCount, total: shoppingItems.length })}
                </p>
                <ProgressBar value={doneCount} target={shoppingItems.length || 1} height="h-2" />
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={copyList}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    <Copy size={16} aria-hidden="true" />
                    {t('mealPlan.shopping.copy')}
                  </button>
                  <a
                    href={whatsappShareUrl(shareText)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
                  >
                    <MessageCircle size={16} aria-hidden="true" />
                    {t('mealPlan.shopping.whatsapp')}
                  </a>
                  {doneCount > 0 && (
                    <button
                      type="button"
                      onClick={() => saveChecked([])}
                      className="rounded-xl px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100"
                    >
                      {t('mealPlan.shopping.clear')}
                    </button>
                  )}
                </div>
                <div role="status" aria-live="polite">
                  {copyState === 'copied' && <p className="mt-2 text-sm text-emerald-700">{t('mealPlan.shopping.copied')}</p>}
                </div>
                {copyState === 'failed' && (
                  <div role="alert" className="mt-2 text-sm text-rose-700">
                    <p>{t('mealPlan.shopping.copyFailed')}</p>
                    <textarea
                      readOnly
                      value={shareText}
                      aria-label={t('mealPlan.shopping.title')}
                      className="mt-2 h-40 w-full rounded-xl border border-slate-200 p-2 text-xs text-slate-700"
                    />
                  </div>
                )}
                {saveError && <p role="alert" className="mt-2 text-sm text-rose-700">{t('mealPlan.shopping.saveError')}</p>}
              </div>

              {shopping.sections.map((section) => (
                <section key={section.id} aria-labelledby={`mp-sec-${section.id}`} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
                  <h3 id={`mp-sec-${section.id}`} className="mb-2 font-semibold text-slate-900">{t(`mealPlan.section.${section.id}`)}</h3>
                  <ul className="divide-y divide-slate-100">
                    {section.items.map((item) => {
                      const id = `mp-item-${item.key}`;
                      const isChecked = checked.includes(item.key);
                      const note = stateNote(item.state, t);
                      return (
                        <li key={item.key} className="flex items-center gap-3 py-2">
                          <input
                            id={id}
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => saveChecked(toggleChecked(checked, item.key, e.target.checked))}
                            className="h-5 w-5 shrink-0 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                          />
                          <label htmlFor={id} className={`flex flex-1 flex-wrap justify-between gap-x-3 text-sm ${isChecked ? 'text-slate-400 line-through' : 'text-slate-800'}`}>
                            <span>{item[lang]}</span>
                            <span className="text-slate-500">
                              {formatAmount(item.amount, item.unit, lang, t)}
                              {note && <span className="ms-1 text-xs">{note}</span>}
                            </span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default MealPlanPage;
