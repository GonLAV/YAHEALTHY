import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, UtensilsCrossed, X } from 'lucide-react';
import { foodLogApi, FoodLog } from '@/services/api';
import { useLanguage } from '@/i18n/LanguageContext';
import PageHeader from '@/components/ui/PageHeader';
import EmptyState from '@/components/ui/EmptyState';

const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'] as const;
const MEAL_EMOJI: Record<string, string> = {
  breakfast: '🌅',
  lunch: '☀️',
  dinner: '🌙',
  snack: '🍎',
};

const emptyForm = {
  name: '',
  calories: '',
  proteinGrams: '',
  carbsGrams: '',
  fatGrams: '',
  mealType: 'breakfast',
  quantity: '',
  unit: 'g',
};

export const FoodLogPage = () => {
  const { t } = useLanguage();
  const [foodLogs, setFoodLogs] = useState<FoodLog[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [formData, setFormData] = useState({ ...emptyForm });

  const today = new Date().toISOString().split('T')[0];

  const fetchFoodLogs = async () => {
    try {
      const response = await foodLogApi.getAll({ date: today });
      setFoodLogs(response.data);
    } catch (err) {
      console.error('Failed to load food logs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFoodLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!formData.name.trim() || !formData.calories) {
      setError(t('food.emptyForm'));
      return;
    }

    setSubmitting(true);
    try {
      await foodLogApi.create({
        date: today,
        name: formData.name.trim(),
        calories: parseFloat(formData.calories),
        proteinGrams: formData.proteinGrams ? parseFloat(formData.proteinGrams) : 0,
        carbsGrams: formData.carbsGrams ? parseFloat(formData.carbsGrams) : 0,
        fatGrams: formData.fatGrams ? parseFloat(formData.fatGrams) : 0,
        mealType: formData.mealType,
        quantity: formData.quantity ? parseFloat(formData.quantity) : undefined,
        unit: formData.unit || undefined,
      });
      setFormData({ ...emptyForm, mealType: formData.mealType });
      setShowForm(false);
      fetchFoodLogs();
    } catch (err) {
      console.error('Failed to log food:', err);
      setError(t('common.error'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await foodLogApi.delete(id);
      fetchFoodLogs();
    } catch (err) {
      console.error('Failed to delete food log:', err);
    }
  };

  const groupedByMeal = useMemo(() => {
    const groups: Record<string, FoodLog[]> = {};
    for (const type of MEAL_TYPES) groups[type] = [];
    for (const log of foodLogs) {
      const type = (log.meal_type as string) || 'snack';
      (groups[type] = groups[type] || []).push(log);
    }
    return groups;
  }, [foodLogs]);

  const todayTotals = useMemo(() => ({
    calories: foodLogs.reduce((s, l) => s + (l.calories || 0), 0),
    protein: foodLogs.reduce((s, l) => s + (l.protein_grams || 0), 0),
    carbs: foodLogs.reduce((s, l) => s + (l.carbs_grams || 0), 0),
    fat: foodLogs.reduce((s, l) => s + (l.fat_grams || 0), 0),
  }), [foodLogs]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-emerald-200 border-t-emerald-600" />
      </div>
    );
  }

  const inputClass =
    'w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-100';

  return (
    <div className="mx-auto max-w-4xl p-4 md:p-8">
      <div className="flex items-center justify-between">
        <PageHeader title={t('food.title')} icon={<UtensilsCrossed size={24} />} />
        <button
          onClick={() => setShowForm(!showForm)}
          className={`flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white shadow-md transition ${
            showForm
              ? 'bg-slate-500 hover:bg-slate-600'
              : 'bg-emerald-600 shadow-emerald-200 hover:bg-emerald-700'
          }`}
        >
          {showForm ? <X size={18} /> : <Plus size={18} />}
          {showForm ? t('common.cancel') : t('food.logFood')}
        </button>
      </div>

      {/* Add form */}
      {showForm && (
        <div className="mb-8 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-100">
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Meal type pills */}
            <div className="flex flex-wrap gap-2">
              {MEAL_TYPES.map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setFormData({ ...formData, mealType: type })}
                  className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                    formData.mealType === type
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {MEAL_EMOJI[type]} {t(`meal.${type}`)}
                </button>
              ))}
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                {t('food.foodName')}
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className={inputClass}
                placeholder={t('food.namePlaceholder')}
              />
            </div>

            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  {t('dash.calories')}
                </label>
                <input
                  type="number"
                  min="0"
                  value={formData.calories}
                  onChange={(e) => setFormData({ ...formData, calories: e.target.value })}
                  className={inputClass}
                  required
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  {t('dash.protein')} ({t('common.grams')})
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={formData.proteinGrams}
                  onChange={(e) => setFormData({ ...formData, proteinGrams: e.target.value })}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  {t('dash.carbs')} ({t('common.grams')})
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={formData.carbsGrams}
                  onChange={(e) => setFormData({ ...formData, carbsGrams: e.target.value })}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  {t('dash.fat')} ({t('common.grams')})
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={formData.fatGrams}
                  onChange={(e) => setFormData({ ...formData, fatGrams: e.target.value })}
                  className={inputClass}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  {t('food.quantity')}
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={formData.quantity}
                  onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  {t('food.unit')}
                </label>
                <input
                  type="text"
                  value={formData.unit}
                  onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                  className={inputClass}
                />
              </div>
            </div>

            {error && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-xl bg-emerald-600 py-3 font-semibold text-white shadow-md shadow-emerald-200 transition hover:bg-emerald-700 disabled:opacity-60"
            >
              {submitting ? t('common.loading') : t('food.logFood')}
            </button>
          </form>
        </div>
      )}

      {/* Today's totals */}
      <div className="mb-6 flex items-center justify-between rounded-2xl bg-emerald-50 px-5 py-4 ring-1 ring-emerald-100">
        <span className="text-sm font-semibold text-emerald-800">{t('food.totalToday')}</span>
        <div className="num flex gap-4 text-sm font-medium text-emerald-700">
          <span>{todayTotals.calories} kcal</span>
          <span>P {todayTotals.protein.toFixed(0)}{t('common.grams')}</span>
          <span>C {todayTotals.carbs.toFixed(0)}{t('common.grams')}</span>
          <span>F {todayTotals.fat.toFixed(0)}{t('common.grams')}</span>
        </div>
      </div>

      {/* Logs grouped by meal */}
      {foodLogs.length === 0 ? (
        <EmptyState icon={<UtensilsCrossed size={26} />} text={t('food.noLogs')} />
      ) : (
        <div className="space-y-4">
          {MEAL_TYPES.filter((type) => groupedByMeal[type]?.length > 0).map((type) => (
            <div key={type} className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-100">
              <div className="border-b border-slate-100 bg-slate-50 px-5 py-3">
                <h3 className="font-semibold text-slate-700">
                  {MEAL_EMOJI[type]} {t(`meal.${type}`)}
                  <span className="num ms-2 text-sm font-normal text-slate-400">
                    ({groupedByMeal[type].length})
                  </span>
                </h3>
              </div>
              <ul className="divide-y divide-slate-100">
                {groupedByMeal[type].map((log) => (
                  <li key={log.id} className="flex items-center justify-between px-5 py-4">
                    <div className="min-w-0 flex-1">
                      <h4 className="truncate font-medium text-slate-800">{log.name}</h4>
                      <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-400">
                        {log.quantity != null && (
                          <span className="num">
                            {log.quantity} {log.unit || 'g'}
                          </span>
                        )}
                        <span className="num">P {(log.protein_grams || 0).toFixed(1)}{t('common.grams')}</span>
                        <span className="num">C {(log.carbs_grams || 0).toFixed(1)}{t('common.grams')}</span>
                        <span className="num">F {(log.fat_grams || 0).toFixed(1)}{t('common.grams')}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="num font-semibold text-slate-700">{log.calories} kcal</span>
                      <button
                        onClick={() => handleDelete(log.id)}
                        className="rounded-lg p-2 text-slate-300 transition hover:bg-rose-50 hover:text-rose-500"
                        aria-label={t('common.delete')}
                      >
                        <Trash2 size={17} />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
