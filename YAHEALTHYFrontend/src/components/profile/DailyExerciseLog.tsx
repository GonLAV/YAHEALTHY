import { useState, useCallback, useEffect } from 'react';
import { Dumbbell, Plus, Trash2, Loader2 } from 'lucide-react';
import { exerciseApi, ExerciseLog } from '@/services/api';
import { useLanguage } from '@/i18n/LanguageContext';

const EXERCISE_TYPES = ['running', 'walking', 'cycling', 'strength', 'swimming', 'yoga', 'other'];
const INTENSITIES = ['low', 'moderate', 'high'];

const inputClass =
  'w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-100';

const labelClass = 'mb-1.5 block text-sm font-medium text-slate-700';

const selectClass = `${inputClass} appearance-none bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20width%3D%2212%22%20height%3D%228%22%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%3E%3Cpath%20d%3D%22M1%201l5%205%205-5%22%20stroke%3D%22%2394a3b8%22%20stroke-width%3D%221.5%22%20fill%3D%22none%22%20stroke-linecap%3D%22round%22/%3E%3C/svg%3E')] bg-[length:12px] bg-[right_0.75rem_center] bg-no-repeat pe-8`;

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export const DailyExerciseLog = () => {
  const { t, lang } = useLanguage();

  const [date, setDate] = useState(todayStr());
  const [logs, setLogs] = useState<ExerciseLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    type: 'running',
    durationMinutes: '',
    caloriesBurned: '',
    intensity: 'moderate',
  });

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await exerciseApi.getAll({ date });
      setLogs(res.data || []);
    } catch {
      setError(t('common.error'));
    } finally {
      setLoading(false);
    }
  }, [date, t]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await exerciseApi.create({
        date,
        type: form.type,
        durationMinutes: form.durationMinutes ? parseFloat(form.durationMinutes) : undefined,
        caloriesBurned: form.caloriesBurned ? parseFloat(form.caloriesBurned) : undefined,
        intensity: form.intensity as 'low' | 'moderate' | 'high',
      });
      setForm({ ...form, durationMinutes: '', caloriesBurned: '' });
      await fetchLogs();
    } catch {
      setError(t('common.error'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await exerciseApi.delete(id);
      setLogs((prev) => prev.filter((l) => l.id !== id));
    } catch {
      setError(t('common.error'));
    }
  };

  const totalMinutes = logs.reduce((sum, l) => sum + (l.duration_minutes || 0), 0);
  const totalCalories = logs.reduce((sum, l) => sum + (l.calories_burned || 0), 0);

  const fmtDate = (d: string) =>
    new Date(d).toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-US', {
      day: 'numeric', month: 'short', year: 'numeric',
    });

  return (
    <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-100">
      <div className="mb-5 flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
          <Dumbbell size={22} />
        </span>
        <div>
          <h2 className="font-semibold text-slate-900">{t('profile.exerciseLog')}</h2>
          <p className="text-sm text-slate-500">{t('profile.exerciseLogSubtitle')}</p>
        </div>
      </div>

      {/* Date picker */}
      <div className="mb-4">
        <label className={labelClass} htmlFor="exercise-date">{t('profile.logDate')}</label>
        <input
          id="exercise-date"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className={`${inputClass} num`}
          max={todayStr()}
        />
      </div>

      {/* Add form */}
      <form onSubmit={handleAdd} className="mb-5 space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={labelClass} htmlFor="exercise-type">{t('profile.exerciseType')}</label>
            <select
              id="exercise-type"
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value })}
              className={selectClass}
            >
              {EXERCISE_TYPES.map((tp) => (
                <option key={tp} value={tp}>{t(`profile.ex_${tp}`)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass} htmlFor="exercise-intensity">{t('profile.intensity')}</label>
            <select
              id="exercise-intensity"
              value={form.intensity}
              onChange={(e) => setForm({ ...form, intensity: e.target.value })}
              className={selectClass}
            >
              {INTENSITIES.map((i) => (
                <option key={i} value={i}>{t(`profile.intensity_${i}`)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass} htmlFor="exercise-duration">{t('profile.durationMinutes')}</label>
            <input
              id="exercise-duration"
              type="number"
              min="1"
              step="1"
              value={form.durationMinutes}
              onChange={(e) => setForm({ ...form, durationMinutes: e.target.value })}
              className={`${inputClass} num`}
              placeholder="30"
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="exercise-calories">{t('profile.caloriesBurned')}</label>
            <input
              id="exercise-calories"
              type="number"
              min="0"
              step="1"
              value={form.caloriesBurned}
              onChange={(e) => setForm({ ...form, caloriesBurned: e.target.value })}
              className={`${inputClass} num`}
              placeholder="200"
            />
          </div>
        </div>
        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 font-semibold text-white shadow-md shadow-emerald-200 transition hover:bg-emerald-700 disabled:opacity-60"
        >
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
          {t('profile.addExercise')}
        </button>
      </form>

      {error && (
        <div role="alert" className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      {/* Entries */}
      {loading ? (
        <div className="flex items-center justify-center py-6">
          <Loader2 size={20} className="animate-spin text-emerald-600" />
        </div>
      ) : logs.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-400">{t('profile.noExerciseEntries')}</p>
      ) : (
        <>
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm font-medium text-slate-600">{fmtDate(date)}</span>
            <span className="num text-sm font-bold text-emerald-700">
              {totalMinutes > 0 && <>{totalMinutes} {t('profile.min')} · </>}
              {totalCalories} {t('profile.kcal')}
            </span>
          </div>
          <ul className="space-y-2">
            {logs.map((log) => (
              <li
                key={log.id}
                className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-2.5"
              >
                <div className="min-w-0">
                  <span className="block truncate text-sm font-medium text-slate-800">
                    {t(`profile.ex_${log.type}`)}
                  </span>
                  <span className="text-xs text-slate-400">
                    {log.duration_minutes != null && <><span className="num">{log.duration_minutes}</span> {t('profile.min')} · </>}
                    {log.calories_burned != null && <><span className="num">{log.calories_burned}</span> {t('profile.kcal')}</>}
                    {log.intensity && <> · {t(`profile.intensity_${log.intensity}`)}</>}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => handleDelete(log.id)}
                  className="flex shrink-0 items-center justify-center rounded-lg p-2 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                  aria-label={`${t('profile.deleteExercise')}: ${t(`profile.ex_${log.type}`)}`}
                >
                  <Trash2 size={16} />
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
};
