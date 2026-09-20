import { useEffect, useMemo, useState } from 'react';
import {
  Scale, Plus, Target, TrendingDown, TrendingUp, Flag,
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import { weightApi, WeightGoal, WeightLog } from '@/services/api';
import { useLanguage } from '@/i18n/LanguageContext';
import PageHeader from '@/components/ui/PageHeader';
import EmptyState from '@/components/ui/EmptyState';

export const WeightPage = () => {
  const { t, lang } = useLanguage();
  const [goal, setGoal] = useState<WeightGoal | null>(null);
  const [logs, setLogs] = useState<WeightLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [showGoalForm, setShowGoalForm] = useState(false);
  const [showLogForm, setShowLogForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [celebration, setCelebration] = useState<string | null>(null);

  const [goalForm, setGoalForm] = useState({ start: '', target: '' });
  const [logForm, setLogForm] = useState('');

  const fetchAll = async () => {
    try {
      const goalsRes = await weightApi.getGoals();
      const goals = goalsRes.data;
      const latest = goals.length > 0 ? goals[goals.length - 1] : null;
      setGoal(latest);
      if (latest) {
        const logsRes = await weightApi.getLogs({ goalId: latest.id });
        setLogs(logsRes.data);
      }
    } catch (err) {
      console.error('Failed to load weight data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
  }, []);

  const handleCreateGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const start = parseFloat(goalForm.start);
    const target = parseFloat(goalForm.target);
    if (!start || !target) {
      setError(t('common.error'));
      return;
    }
    setSubmitting(true);
    try {
      await weightApi.createGoal({ startWeightKg: start, targetWeightKg: target });
      setShowGoalForm(false);
      setGoalForm({ start: '', target: '' });
      await fetchAll();
    } catch (err: any) {
      setError(err.response?.data?.error || t('common.error'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleLogWeight = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const kg = parseFloat(logForm);
    if (!kg) {
      setError(t('common.error'));
      return;
    }
    setSubmitting(true);
    try {
      const res = await weightApi.log({ goalId: goal!.id, weightKg: kg });
      setLogForm('');
      setShowLogForm(false);
      setCelebration(res.data?.celebration?.message ?? null);
      await fetchAll();
    } catch (err: any) {
      setError(err.response?.data?.error || t('common.error'));
    } finally {
      setSubmitting(false);
    }
  };

  const current = useMemo(() => {
    if (logs.length === 0) return goal?.start_weight_kg ?? null;
    return logs[logs.length - 1].weight_kg;
  }, [logs, goal]);

  const progressPct = useMemo(() => {
    if (!goal || current == null) return 0;
    const total = Math.abs(goal.start_weight_kg - goal.target_weight_kg);
    if (total === 0) return 100;
    const done = Math.abs(goal.start_weight_kg - current);
    return Math.min(100, Math.round((done / total) * 100));
  }, [goal, current]);

  const remaining = useMemo(() => {
    if (!goal || current == null) return null;
    return Math.abs(current - goal.target_weight_kg);
  }, [goal, current]);

  const chartData = useMemo(() => {
    const points = logs.map((l) => ({ kg: l.weight_kg, date: l.date || l.created_at }));
    return [
      ...(goal ? [{ kg: goal.start_weight_kg, date: 'start' }] : []),
      ...points,
    ];
  }, [logs, goal]);

  const inputClass =
    'w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-100';

  const fmtDate = (iso?: string) =>
    iso
      ? new Date(iso).toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-US', {
          day: 'numeric',
          month: 'short',
        })
      : '';

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-emerald-200 border-t-emerald-600" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl p-4 md:p-8">
      <PageHeader
        title={t('weight.title')}
        subtitle={t('weight.subtitle')}
        icon={<Scale size={24} />}
      />

      {celebration && (
        <div className="mb-6 flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm font-semibold text-emerald-700">
          <TrendingDown size={18} />
          {celebration}
        </div>
      )}

      {/* No goal yet */}
      {!goal && !showGoalForm && (
        <EmptyState icon={<Target size={26} />} text={t('weight.noGoalHint')} />
      )}

      {/* Create goal form */}
      {(!goal || showGoalForm) && (
        <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-100">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="font-semibold text-slate-900">{t('weight.noGoal')}</h2>
            {showGoalForm && (
              <button
                onClick={() => setShowGoalForm(false)}
                className="text-sm text-slate-400 hover:text-slate-600"
              >
                {t('common.cancel')}
              </button>
            )}
          </div>
          <form onSubmit={handleCreateGoal} className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                {t('weight.startWeight')}
              </label>
              <input
                type="number"
                step="0.1"
                min="20"
                max="400"
                value={goalForm.start}
                onChange={(e) => setGoalForm({ ...goalForm, start: e.target.value })}
                className={inputClass}
                required
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                {t('weight.targetWeight')}
              </label>
              <input
                type="number"
                step="0.1"
                min="20"
                max="400"
                value={goalForm.target}
                onChange={(e) => setGoalForm({ ...goalForm, target: e.target.value })}
                className={inputClass}
                required
              />
            </div>
            <div className="flex items-end">
              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-xl bg-emerald-600 py-2.5 font-semibold text-white shadow-md shadow-emerald-200 transition hover:bg-emerald-700 disabled:opacity-60"
              >
                {t('weight.createGoal')}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Goal overview + log */}
      {goal && (
        <>
          {/* Stats */}
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
              <div className="text-sm font-medium text-slate-500">{t('weight.startWeight')}</div>
              <div className="num mt-1 text-2xl font-bold text-slate-900">
                {goal.start_weight_kg}
              </div>
            </div>
            <div className="rounded-2xl bg-emerald-50 p-5 ring-1 ring-emerald-100">
              <div className="text-sm font-medium text-emerald-700">{t('weight.current')}</div>
              <div className="num mt-1 text-2xl font-bold text-emerald-700">
                {current ?? '—'}
              </div>
            </div>
            <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
              <div className="text-sm font-medium text-slate-500">{t('weight.targetWeight')}</div>
              <div className="num mt-1 text-2xl font-bold text-slate-900">
                {goal.target_weight_kg}
              </div>
            </div>
          </div>

          {/* Progress */}
          <div className="mt-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
            <div className="mb-3 flex items-center justify-between">
              <span className="font-medium text-slate-700">{t('weight.progress')}</span>
              <div className="flex items-center gap-3">
                {remaining != null && (
                  <span className="num flex items-center gap-1 text-sm font-medium text-slate-500">
                    {goal.target_weight_kg <= goal.start_weight_kg ? (
                      <TrendingDown size={15} className="text-emerald-500" />
                    ) : (
                      <TrendingUp size={15} className="text-sky-500" />
                    )}
                    {t('weight.remainingToGoal')}: {remaining.toFixed(1)} {t('common.kg')}
                  </span>
                )}
                <span className="num rounded-full bg-emerald-100 px-3 py-0.5 text-sm font-bold text-emerald-700">
                  {progressPct}%
                </span>
              </div>
            </div>
            <div className="h-3 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-3 rounded-full bg-gradient-to-r from-emerald-400 to-emerald-600 transition-all duration-700"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>

          {/* Chart */}
          {logs.length > 0 && (
            <div className="mt-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
              <h3 className="mb-4 font-semibold text-slate-900">{t('weight.progressTitle')}</h3>
              <div className="h-64" style={{ direction: 'ltr' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 5, right: 10, bottom: 5, left: -20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 11 }}
                      tickFormatter={(v: string) => (v === 'start' ? '⭐' : v.slice(5))}
                    />
                    <YAxis tick={{ fontSize: 11 }} domain={['dataMin - 1', 'dataMax + 1']} />
                    <Tooltip
                      formatter={(value: number) => [`${value} kg`, '']}
                      contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0' }}
                    />
                    <Line
                      type="monotone"
                      dataKey="kg"
                      stroke="#059669"
                      strokeWidth={3}
                      dot={{ r: 5, fill: '#059669' }}
                      activeDot={{ r: 7 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Log weight form */}
          {!showLogForm ? (
            <button
              onClick={() => setShowLogForm(true)}
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 py-3.5 font-semibold text-white shadow-md shadow-emerald-200 transition hover:bg-emerald-700"
            >
              <Plus size={18} />
              {t('weight.logWeight')}
            </button>
          ) : (
            <form
              onSubmit={handleLogWeight}
              className="mt-6 flex flex-col gap-3 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100 sm:flex-row"
            >
              <input
                type="number"
                step="0.1"
                min="20"
                max="400"
                value={logForm}
                onChange={(e) => setLogForm(e.target.value)}
                placeholder={`${t('weight.logWeight')} (${t('common.kg')})`}
                className={`${inputClass} num`}
                required
              />
              <button
                type="submit"
                disabled={submitting}
                className="rounded-xl bg-emerald-600 px-8 py-2.5 font-semibold text-white shadow-md shadow-emerald-200 transition hover:bg-emerald-700 disabled:opacity-60"
              >
                {t('common.save')}
              </button>
              <button
                type="button"
                onClick={() => setShowLogForm(false)}
                className="rounded-xl bg-slate-100 px-6 py-2.5 font-semibold text-slate-600 transition hover:bg-slate-200"
              >
                {t('common.cancel')}
              </button>
            </form>
          )}

          {/* Weigh-in history */}
          <h3 className="mb-3 mt-8 font-semibold text-slate-900">{t('weight.history')}</h3>
          {logs.length === 0 ? (
            <EmptyState icon={<Scale size={26} />} text={t('weight.noLogs')} />
          ) : (
            <div className="space-y-2">
              {[...logs].reverse().slice(0, 10).map((log) => {
                const diff = current != null && log.weight_kg != null ? log.weight_kg - (goal?.start_weight_kg ?? log.weight_kg) : 0;
                return (
                  <div
                    key={log.id}
                    className="flex items-center justify-between rounded-2xl bg-white px-5 py-3.5 shadow-sm ring-1 ring-slate-100"
                  >
                    <div className="flex items-center gap-3">
                      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                        <Flag size={17} />
                      </span>
                      <div>
                        <span className="num font-bold text-slate-900">{log.weight_kg} {t('common.kg')}</span>
                        <div className="text-xs text-slate-400">{fmtDate(log.created_at || log.date)}</div>
                      </div>
                    </div>
                    {diff !== 0 && (
                      <span
                        className={`num flex items-center gap-1 text-sm font-semibold ${
                          diff < 0 ? 'text-emerald-600' : 'text-sky-600'
                        }`}
                      >
                        {diff < 0 ? <TrendingDown size={15} /> : <TrendingUp size={15} />}
                        {Math.abs(diff).toFixed(1)} {t('common.kg')}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {error && (
        <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}
    </div>
  );
};
