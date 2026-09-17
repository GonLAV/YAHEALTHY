import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, Trash2, Pencil, Search } from 'lucide-react';
import { Card, Button, Modal, Field, inputCls, ErrorState, EmptyState, SkeletonCard, ProgressBar } from '@/components/ui';
import { FoodQuickAdd } from '@/components/FoodQuickAdd';
import { FoodLog, foodLogApi, targetApi, apiError, Targets } from '@/services/api';
import { useAsync } from '@/hooks/useAsync';
import { useToast } from '@/hooks/useToast';
import { todayStr } from '@/lib/date';
import { resolveTargets, sumCalories, sumMacros } from '@/lib/health';

const MEALS = [
  { key: 'breakfast', label: 'Breakfast', emoji: '🌅' },
  { key: 'lunch', label: 'Lunch', emoji: '☀️' },
  { key: 'snack', label: 'Snack', emoji: '🍏' },
  { key: 'dinner', label: 'Dinner', emoji: '🌙' },
];

export const FoodLogPage = () => {
  const today = todayStr();
  const [date, setDate] = useState(today);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<FoodLog | null>(null);
  const [editValues, setEditValues] = useState({ name: '', calories: '', mealType: '' });
  const [saving, setSaving] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const { push } = useToast();

  const prefill = searchParams.get('add');

  useEffect(() => {
    if (prefill) setQuickAddOpen(true);
  }, [prefill]);

  const load = useCallback(async () => {
    const [logs, targets] = await Promise.all([
      foodLogApi.getAll({ date }).then((r) => r.data || []),
      targetApi.get().then((r) => r.data.targets as Targets),
    ]);
    return { logs, targets };
  }, [date]);
  const { data, loading, error, reload } = useAsync(load, [date]);

  const closeQuickAdd = () => {
    if (prefill) setSearchParams({}, { replace: true });
    setQuickAddOpen(false);
  };

  const totals = useMemo(() => {
    const logs = data?.logs || [];
    return { calories: sumCalories(logs), macros: sumMacros(logs) };
  }, [data]);

  const t = resolveTargets(data?.targets ?? null);

  const remove = async (id: string) => {
    try {
      await foodLogApi.remove(id);
      push('Entry deleted');
      reload();
    } catch (err) {
      push(apiError(err), 'error');
    }
  };

  const openEdit = (log: FoodLog) => {
    setEditing(log);
    setEditValues({ name: log.name, calories: String(log.calories), mealType: log.meal_type || 'snack' });
  };

  const saveEdit = async () => {
    if (!editing || saving) return;
    const calories = Number(editValues.calories);
    if (!editValues.name.trim() || !Number.isFinite(calories) || calories < 0) {
      push('Enter a name and valid calories', 'error');
      return;
    }
    setSaving(true);
    try {
      await foodLogApi.update(editing.id, {
        name: editValues.name.trim(),
        calories,
        mealType: editValues.mealType,
      });
      push('Entry updated');
      setEditing(null);
      reload();
    } catch (err) {
      push(apiError(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  const filteredLogs = useMemo(() => {
    const logs = data?.logs || [];
    if (!search.trim()) return logs;
    const q = search.trim().toLowerCase();
    return logs.filter((l) => l.name.toLowerCase().includes(q));
  }, [data, search]);

  return (
    <div className="animate-fade-up space-y-5">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight">Food Log</h1>
          <p className="text-sm text-slate-500 mt-0.5">Log meals in seconds, see daily totals against your targets</p>
        </div>
        <Button onClick={() => setQuickAddOpen(true)} className="shrink-0">
          <Plus className="w-4 h-4" /> Log food
        </Button>
      </div>

      <Card padded={false}>
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
          <input
            type="date"
            value={date}
            max={today}
            onChange={(e) => setDate(e.target.value)}
            className="bg-slate-50 rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 border border-slate-100"
          />
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search in day…"
              className="pl-9 pr-3 py-2 rounded-xl text-sm bg-slate-50 border border-slate-100 w-44"
            />
          </div>
        </div>
      </Card>

      {/* Daily totals vs targets */}
      <Card title="Daily totals" subtitle={date === today ? 'Today' : undefined}>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-2xl bg-slate-50 px-4 py-3 text-center">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Calories</p>
            <p className="text-2xl font-extrabold text-slate-900 tabular mt-1">{Math.round(totals.calories)}</p>
            <p className="text-xs text-slate-400">{t.calories ? `${Math.max(0, t.calories - Math.round(totals.calories))} remaining` : 'no target'}</p>
            {t.calories ? <ProgressBar className="mt-2" value={totals.calories} max={t.calories} /> : null}
          </div>
          <div className="rounded-2xl bg-teal-50 px-4 py-3 text-center">
            <p className="text-xs font-semibold text-teal-600/70 uppercase tracking-wide">Protein</p>
            <p className="text-2xl font-extrabold text-teal-700 tabular mt-1">{Math.round(totals.macros.protein)}g</p>
            <p className="text-xs text-teal-600/60">{t.protein ? `${Math.max(0, Math.round(t.protein - totals.macros.protein))}g remaining` : 'no target'}</p>
            {t.protein ? <ProgressBar className="mt-2" value={totals.macros.protein} max={t.protein} color="bg-teal-500" /> : null}
          </div>
          <div className="rounded-2xl bg-amber-50 px-4 py-3 text-center">
            <p className="text-xs font-semibold text-amber-600/70 uppercase tracking-wide">Carbs</p>
            <p className="text-2xl font-extrabold text-amber-700 tabular mt-1">{Math.round(totals.macros.carbs)}g</p>
            <p className="text-xs text-amber-600/60">{t.carbs ? `${Math.max(0, Math.round(t.carbs - totals.macros.carbs))}g remaining` : 'no target'}</p>
            {t.carbs ? <ProgressBar className="mt-2" value={totals.macros.carbs} max={t.carbs} color="bg-amber-500" /> : null}
          </div>
          <div className="rounded-2xl bg-purple-50 px-4 py-3 text-center">
            <p className="text-xs font-semibold text-purple-600/70 uppercase tracking-wide">Fat</p>
            <p className="text-2xl font-extrabold text-purple-700 tabular mt-1">{Math.round(totals.macros.fat)}g</p>
            <p className="text-xs text-purple-600/60">{t.fat ? `${Math.max(0, Math.round(t.fat - totals.macros.fat))}g remaining` : 'no target'}</p>
            {t.fat ? <ProgressBar className="mt-2" value={totals.macros.fat} max={t.fat} color="bg-purple-500" /> : null}
          </div>
        </div>
      </Card>

      {/* Meal timeline */}
      {loading && !data && <SkeletonCard />}

      {error && <ErrorState message={error} onRetry={reload} />}

      {data && filteredLogs.length === 0 && (
        <Card>
          <EmptyState
            title={search ? `No matches for “${search}”` : 'Nothing logged on this day'}
            text={search ? undefined : 'Use the button above — recent foods and barcode scanning make it quick.'}
            action={search ? undefined : <Button size="sm" onClick={() => setQuickAddOpen(true)}>Log food</Button>}
          />
        </Card>
      )}

      {data &&
        MEALS.map((meal) => {
          const items = filteredLogs.filter((l) => (l.meal_type || 'snack') === meal.key);
          const cal = sumCalories(items);
          return (
            <Card
              key={meal.key}
              title={
                <span className="flex items-center gap-2">
                  <span>{meal.emoji}</span> {meal.label}
                  {items.length > 0 && <span className="text-slate-400 font-medium text-sm">{Math.round(cal)} kcal</span>}
                </span>
              }
              action={
                <Button variant="ghost" size="sm" onClick={() => setQuickAddOpen(true)} aria-label={`Add to ${meal.label}`}>
                  <Plus className="w-4 h-4" />
                </Button>
              }
            >
              {items.length === 0 ? (
                <p className="text-sm text-slate-400 py-1">Nothing logged</p>
              ) : (
                <div className="space-y-2">
                  {items.map((l) => (
                    <div key={l.id} className="flex items-center gap-3 rounded-xl border border-slate-100 px-4 py-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-800 truncate">{l.name}</p>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {Math.round(l.calories)} kcal
                          {l.protein_grams ? ` · ${Math.round(l.protein_grams)}g protein` : ''}
                          {l.carbs_grams ? ` · ${Math.round(l.carbs_grams)}g carbs` : ''}
                          {l.fat_grams ? ` · ${Math.round(l.fat_grams)}g fat` : ''}
                        </p>
                      </div>
                      <button
                        onClick={() => openEdit(l)}
                        aria-label="Edit entry"
                        className="w-9 h-9 rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600 flex items-center justify-center shrink-0"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => remove(l.id)}
                        aria-label="Delete entry"
                        className="w-9 h-9 rounded-full text-slate-400 hover:bg-rose-50 hover:text-rose-600 flex items-center justify-center shrink-0"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          );
        })}

      <FoodQuickAdd
        open={quickAddOpen}
        onClose={closeQuickAdd}
        onSaved={reload}
        prefillName={prefill}
      />

      <Modal open={!!editing} onClose={() => setEditing(null)} title="Edit entry">
        <div className="space-y-3">
          <Field label="Name">
            <input value={editValues.name} onChange={(e) => setEditValues((v) => ({ ...v, name: e.target.value }))} className={inputCls} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Calories">
              <input
                type="number"
                min="0"
                value={editValues.calories}
                onChange={(e) => setEditValues((v) => ({ ...v, calories: e.target.value }))}
                className={inputCls}
              />
            </Field>
            <Field label="Meal">
              <select value={editValues.mealType} onChange={(e) => setEditValues((v) => ({ ...v, mealType: e.target.value }))} className={inputCls}>
                {MEALS.map((m) => (
                  <option key={m.key} value={m.key}>{m.label}</option>
                ))}
              </select>
            </Field>
          </div>
          <div className="flex gap-2">
            <Button className="flex-1" loading={saving} onClick={saveEdit}>Save changes</Button>
            <Button variant="secondary" onClick={() => setEditing(null)}>Cancel</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
