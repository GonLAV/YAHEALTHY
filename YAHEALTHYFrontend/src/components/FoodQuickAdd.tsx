import { useCallback, useEffect, useMemo, useState } from 'react';
import { Star, ScanLine, Pencil, History } from 'lucide-react';
import { Modal, Button, Field, inputCls, Segmented, Skeleton } from '@/components/ui';
import { BarcodeScanner, fetchProductByBarcode, ScannedProduct } from '@/components/BarcodeScanner';
import { FoodLog, FoodLogInput, FavoriteFood, foodLogApi, prefApi, apiError } from '@/services/api';
import { todayStr } from '@/lib/date';
import { useToast } from '@/hooks/useToast';

const MEAL_TYPES = [
  { value: 'breakfast', label: 'Breakfast' },
  { value: 'lunch', label: 'Lunch' },
  { value: 'snack', label: 'Snack' },
  { value: 'dinner', label: 'Dinner' },
];

interface SelectedFood {
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

/**
 * The "log food in seconds" flow: recent items, favorites, custom entry and
 * barcode lookup, with a portion multiplier and meal-type picker.
 */
export const FoodQuickAdd = ({
  open,
  onClose,
  onSaved,
  prefillName,
  defaultMealType,
}: {
  open: boolean;
  onClose: () => void;
  onSaved?: (log: FoodLog) => void;
  prefillName?: string | null;
  defaultMealType?: string;
}) => {
  const [tab, setTab] = useState<'recent' | 'custom' | 'scan'>('recent');
  const [recent, setRecent] = useState<FoodLog[] | null>(null);
  const [favorites, setFavorites] = useState<FavoriteFood[]>([]);
  const [selected, setSelected] = useState<SelectedFood | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [mealType, setMealType] = useState(defaultMealType || 'breakfast');
  const [date, setDate] = useState(todayStr());
  const [saving, setSaving] = useState(false);
  const [custom, setCustom] = useState({ name: '', calories: '', protein: '', carbs: '', fat: '' });
  const [scanState, setScanState] = useState<{ loading: boolean; product: ScannedProduct | null; grams: string; error: string | null }>({
    loading: false,
    product: null,
    grams: '100',
    error: null,
  });
  const { push } = useToast();

  const loadRecent = useCallback(() => {
    foodLogApi
      .getAll({ limit: 100 })
      .then((res) => setRecent(res.data || []))
      .catch(() => setRecent([]));
    prefApi
      .get()
      .then((p) => setFavorites(p.favorites?.foods || []))
      .catch(() => setFavorites([]));
  }, []);

  useEffect(() => {
    if (open) {
      loadRecent();
      if (prefillName) {
        setTab('custom');
        setCustom((c) => ({ ...c, name: prefillName }));
      }
    } else {
      setSelected(null);
      setQuantity(1);
      setScanState({ loading: false, product: null, grams: '100', error: null });
    }
  }, [open, prefillName, loadRecent]);

  const distinctRecent = useMemo(() => {
    const seen = new Set<string>();
    return (recent || []).filter((f) => {
      if (seen.has(f.name)) return false;
      seen.add(f.name);
      return true;
    }).slice(0, 30);
  }, [recent]);

  const selectFood = (f: { name: string; calories: number; protein: number; carbs: number; fat: number }) => {
    setSelected(f);
    setQuantity(1);
  };

  const save = async (food: SelectedFood) => {
    if (saving) return; // prevent duplicate submissions
    setSaving(true);
    try {
      const payload: FoodLogInput = {
        date,
        name: food.name,
        mealType,
        calories: Math.round(food.calories * quantity * 10) / 10,
        proteinGrams: food.protein ? Math.round(food.protein * quantity * 10) / 10 : undefined,
        carbsGrams: food.carbs ? Math.round(food.carbs * quantity * 10) / 10 : undefined,
        fatGrams: food.fat ? Math.round(food.fat * quantity * 10) / 10 : undefined,
      };
      const res = await foodLogApi.create(payload);
      push(`${food.name} logged to ${mealType}`);
      onSaved?.(res.data);
      onClose();
    } catch (err) {
      push(apiError(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  const saveCustom = async () => {
    const name = custom.name.trim();
    const calories = Number(custom.calories);
    if (!name || !Number.isFinite(calories) || calories < 0) {
      push('Enter a food name and calories', 'error');
      return;
    }
    await save({
      name,
      calories,
      protein: Number(custom.protein) || 0,
      carbs: Number(custom.carbs) || 0,
      fat: Number(custom.fat) || 0,
    });
  };

  const toggleFavorite = async (f: SelectedFood) => {
    try {
      const exists = favorites.some((x) => x.name === f.name);
      const foods = exists ? favorites.filter((x) => x.name !== f.name) : [...favorites, { ...f, mealType }];
      setFavorites(foods);
      await prefApi.merge({ favorites: { recipeIds: undefined, foods } });
      push(exists ? 'Removed from favorites' : 'Saved to favorites');
    } catch {
      push('Could not update favorites', 'error');
    }
  };

  const lookupBarcode = async (code: string) => {
    setScanState({ loading: true, product: null, grams: '100', error: null });
    try {
      const product = await fetchProductByBarcode(code);
      setScanState({
        loading: false,
        product,
        grams: String(product.servingGrams || 100),
        error: null,
      });
    } catch (err) {
      setScanState({ loading: false, product: null, grams: '100', error: (err as Error).message });
    }
  };

  const scannedTotals = useMemo(() => {
    const p = scanState.product;
    if (!p) return null;
    const grams = Number(scanState.grams) || 0;
    const factor = grams / 100;
    return {
      grams,
      name: p.name,
      calories: Math.round(p.calories * factor),
      protein: Math.round(p.protein * factor * 10) / 10,
      carbs: Math.round(p.carbs * factor * 10) / 10,
      fat: Math.round(p.fat * factor * 10) / 10,
      image: p.imageUrl,
    };
  }, [scanState]);

  return (
    <Modal open={open} onClose={onClose} title="Log food">
      <Segmented
        className="mb-4"
        value={tab}
        onChange={(v) => setTab(v)}
        options={[
          { value: 'recent', label: 'Recent' },
          { value: 'custom', label: 'Custom' },
          { value: 'scan', label: 'Scan' },
        ]}
      />

      {/* meal + date selectors shared by all tabs */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <Field label="Meal">
          <select value={mealType} onChange={(e) => setMealType(e.target.value)} className={inputCls}>
            {MEAL_TYPES.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Date">
          <input type="date" value={date} max={todayStr()} onChange={(e) => setDate(e.target.value)} className={inputCls} />
        </Field>
      </div>

      {tab === 'recent' && (
        <div>
          {favorites.length > 0 && (
            <>
              <p className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-1.5">Favorites</p>
              <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2">
                {favorites.map((f) => (
                  <button
                    key={f.name}
                    onClick={() =>
                      selectFood({ name: f.name, calories: f.calories, protein: f.proteinGrams || 0, carbs: f.carbsGrams || 0, fat: f.fatGrams || 0 })
                    }
                    className="shrink-0 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-left hover:bg-amber-100"
                  >
                    <span className="block text-sm font-semibold text-slate-800 max-w-[140px] truncate">{f.name}</span>
                    <span className="block text-xs text-slate-500">{f.calories} kcal</span>
                  </button>
                ))}
              </div>
            </>
          )}

          <p className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-1.5 mt-3">
            <History className="w-3.5 h-3.5 inline mr-1 -mt-0.5" /> Recent
          </p>
          {!recent && <Skeleton className="h-20 w-full" />}
          {recent && distinctRecent.length === 0 && (
            <p className="text-sm text-slate-400 py-4 text-center">Nothing logged yet — your recent foods will appear here.</p>
          )}
          {recent && (
            <div className="grid grid-cols-2 gap-2">
              {distinctRecent.slice(0, 12).map((f) => (
                <button
                  key={f.id}
                  onClick={() =>
                    selectFood({ name: f.name, calories: f.calories, protein: f.protein_grams || 0, carbs: f.carbs_grams || 0, fat: f.fat_grams || 0 })
                  }
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-left hover:border-teal-300 hover:bg-teal-50/40 transition"
                >
                  <span className="block text-sm font-semibold text-slate-800 truncate">{f.name}</span>
                  <span className="block text-xs text-slate-400">{f.calories} kcal</span>
                </button>
              ))}
            </div>
          )}

          {selected && (
            <PortionForm
              key={selected.name}
              food={selected}
              quantity={quantity}
              setQuantity={setQuantity}
              saving={saving}
              onSave={() => save(selected)}
              onFavorite={() => toggleFavorite(selected)}
              isFavorite={favorites.some((x) => x.name === selected.name)}
            />
          )}
        </div>
      )}

      {tab === 'custom' && (
        <div className="space-y-3">
          <Field label="Food name">
            <input
              value={custom.name}
              onChange={(e) => setCustom({ ...custom, name: e.target.value })}
              placeholder="e.g. Greek yogurt with granola"
              className={inputCls}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Calories">
              <input
                type="number"
                min="0"
                inputMode="numeric"
                value={custom.calories}
                onChange={(e) => setCustom({ ...custom, calories: e.target.value })}
                className={inputCls}
              />
            </Field>
            <Field label="Protein (g)">
              <input
                type="number"
                min="0"
                step="0.1"
                inputMode="decimal"
                value={custom.protein}
                onChange={(e) => setCustom({ ...custom, protein: e.target.value })}
                className={inputCls}
              />
            </Field>
            <Field label="Carbs (g)">
              <input
                type="number"
                min="0"
                step="0.1"
                inputMode="decimal"
                value={custom.carbs}
                onChange={(e) => setCustom({ ...custom, carbs: e.target.value })}
                className={inputCls}
              />
            </Field>
            <Field label="Fat (g)">
              <input
                type="number"
                min="0"
                step="0.1"
                inputMode="decimal"
                value={custom.fat}
                onChange={(e) => setCustom({ ...custom, fat: e.target.value })}
                className={inputCls}
              />
            </Field>
          </div>
          <Button className="w-full" loading={saving} onClick={saveCustom}>
            <Pencil className="w-4 h-4" /> Add to log
          </Button>
        </div>
      )}

      {tab === 'scan' && (
        <div className="space-y-4">
          <BarcodeScanner onDetected={lookupBarcode} />
          {scanState.loading && <Skeleton className="h-24 w-full" />}
          {scanState.error && (
            <p className="text-sm text-rose-600 bg-rose-50 rounded-xl px-4 py-3">{scanState.error}</p>
          )}
          {scannedTotals && (
            <div className="rounded-2xl border border-slate-200 p-4 space-y-3">
              <div className="flex items-center gap-3">
                {scannedTotals.image && (
                  <img src={scannedTotals.image} alt="" className="w-12 h-12 rounded-xl object-cover" />
                )}
                <div className="min-w-0">
                  <p className="font-bold text-slate-900 truncate">{scannedTotals.name}</p>
                  <p className="text-xs text-slate-400">per 100g: {scanState.product?.calories} kcal</p>
                </div>
              </div>
              <Field label="Portion (g)">
                <input
                  type="number"
                  min="1"
                  inputMode="numeric"
                  value={scanState.grams}
                  onChange={(e) => setScanState((s) => ({ ...s, grams: e.target.value }))}
                  className={inputCls}
                />
              </Field>
              <div className="grid grid-cols-4 gap-2 text-center text-sm">
                <div className="rounded-xl bg-slate-50 py-2">
                  <p className="text-xs text-slate-400">kcal</p>
                  <p className="font-bold text-slate-800 tabular">{scannedTotals.calories}</p>
                </div>
                <div className="rounded-xl bg-teal-50 py-2">
                  <p className="text-xs text-teal-600/70">Prot</p>
                  <p className="font-bold text-teal-700 tabular">{scannedTotals.protein}g</p>
                </div>
                <div className="rounded-xl bg-amber-50 py-2">
                  <p className="text-xs text-amber-600/70">Carbs</p>
                  <p className="font-bold text-amber-700 tabular">{scannedTotals.carbs}g</p>
                </div>
                <div className="rounded-xl bg-purple-50 py-2">
                  <p className="text-xs text-purple-600/70">Fat</p>
                  <p className="font-bold text-purple-700 tabular">{scannedTotals.fat}g</p>
                </div>
              </div>
              <Button
                className="w-full"
                loading={saving}
                onClick={() =>
                  save({
                    name: scannedTotals.name,
                    calories: scannedTotals.calories,
                    protein: scannedTotals.protein,
                    carbs: scannedTotals.carbs,
                    fat: scannedTotals.fat,
                  })
                }
              >
                <ScanLine className="w-4 h-4" /> Add to {mealType}
              </Button>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
};

function PortionForm({
  food,
  quantity,
  setQuantity,
  saving,
  onSave,
  onFavorite,
  isFavorite,
}: {
  food: SelectedFood;
  quantity: number;
  setQuantity: (n: number) => void;
  saving: boolean;
  onSave: () => void;
  onFavorite: () => void;
  isFavorite: boolean;
}) {
  return (
    <div className="mt-4 rounded-2xl border border-slate-200 p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="font-bold text-slate-900 truncate">{food.name}</p>
        <button
          onClick={onFavorite}
          aria-label="Toggle favorite"
          className={`w-9 h-9 rounded-full flex items-center justify-center ${
            isFavorite ? 'text-amber-500 bg-amber-50' : 'text-slate-300 hover:bg-slate-100'
          }`}
        >
          <Star className={`w-5 h-5 ${isFavorite ? 'fill-amber-400' : ''}`} />
        </button>
      </div>
      <div>
        <p className="text-sm font-semibold text-slate-700 mb-1.5">Portion</p>
        <div className="flex gap-2">
          {[0.5, 1, 1.5, 2].map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => setQuantity(q)}
              className={`px-3 py-1.5 rounded-lg text-sm font-semibold border transition ${
                quantity === q
                  ? 'bg-teal-600 text-white border-teal-600'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
            >
              {q}×
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-4 gap-2 text-center text-sm">
        <div className="rounded-xl bg-slate-50 py-2">
          <p className="text-xs text-slate-400">kcal</p>
          <p className="font-bold text-slate-800 tabular">{Math.round(food.calories * quantity)}</p>
        </div>
        <div className="rounded-xl bg-teal-50 py-2">
          <p className="text-xs text-teal-600/70">Prot</p>
          <p className="font-bold text-teal-700 tabular">{Math.round(food.protein * quantity)}g</p>
        </div>
        <div className="rounded-xl bg-amber-50 py-2">
          <p className="text-xs text-amber-600/70">Carbs</p>
          <p className="font-bold text-amber-700 tabular">{Math.round(food.carbs * quantity)}g</p>
        </div>
        <div className="rounded-xl bg-purple-50 py-2">
          <p className="text-xs text-purple-600/70">Fat</p>
          <p className="font-bold text-purple-700 tabular">{Math.round(food.fat * quantity)}g</p>
        </div>
      </div>
      <Button className="w-full" loading={saving} onClick={onSave}>
        Log {Math.round(food.calories * quantity)} kcal
      </Button>
    </div>
  );
}
