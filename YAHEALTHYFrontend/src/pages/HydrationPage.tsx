import { useEffect, useState } from 'react';
import { Droplets, Plus, GlassWater } from 'lucide-react';
import { hydrationApi, HydrationLog } from '@/services/api';
import { useLanguage } from '@/i18n/LanguageContext';
import PageHeader from '@/components/ui/PageHeader';
import ProgressRing from '@/components/ui/ProgressRing';

const DAILY_GOAL_LITERS = 2.5;

const getTimeOfDay = (): 'morning' | 'afternoon' | 'evening' => {
  const hour = new Date().getHours();
  if (hour < 12) return 'morning';
  if (hour < 18) return 'afternoon';
  return 'evening';
};

export const HydrationPage = () => {
  const { t, lang } = useLanguage();
  const [logs, setLogs] = useState<HydrationLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [customMl, setCustomMl] = useState('');
  const [error, setError] = useState('');

  const today = new Date().toISOString().split('T')[0];

  const fetchLogs = async () => {
    try {
      const res = await hydrationApi.getAll({ date: today });
      setLogs(res.data);
    } catch (err) {
      console.error('Failed to load hydration logs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addWater = async (liters: number) => {
    if (liters <= 0) return;
    setAdding(true);
    setError('');
    try {
      await hydrationApi.add({
        date: today,
        litersConsumed: liters,
        timeOfDay: getTimeOfDay(),
      });
      await fetchLogs();
    } catch (err) {
      setError(t('common.error'));
    } finally {
      setAdding(false);
    }
  };

  const handleCustom = async (e: React.FormEvent) => {
    e.preventDefault();
    const ml = parseFloat(customMl);
    if (!ml || ml <= 0) return;
    await addWater(ml / 1000);
    setCustomMl('');
  };

  const totalLiters = logs.reduce((sum, log) => sum + (log.liters_consumed || 0), 0);
  const pct = Math.round((totalLiters / DAILY_GOAL_LITERS) * 100);

  const formatTime = (iso?: string) =>
    iso
      ? new Date(iso).toLocaleTimeString(lang === 'he' ? 'he-IL' : 'en-US', {
          hour: '2-digit',
          minute: '2-digit',
        })
      : '';

  return (
    <div className="mx-auto max-w-4xl p-4 md:p-8">
      <PageHeader
        title={t('water.title')}
        subtitle={t('water.subtitle')}
        icon={<Droplets size={24} />}
      />

      {/* Progress ring */}
      <div className="flex flex-col items-center gap-6 rounded-3xl bg-white p-8 shadow-sm ring-1 ring-slate-100">
        <ProgressRing
          value={totalLiters}
          target={DAILY_GOAL_LITERS}
          size={200}
          color="#0284c7"
          trackColor="#e0f2fe"
        >
          <span className="num text-4xl font-extrabold text-sky-600">
            {totalLiters.toFixed(2)}
          </span>
          <span className="text-xs font-medium text-slate-400">
            {t('common.of')} {DAILY_GOAL_LITERS} {t('common.liters')}
          </span>
          <span
            className={`num mt-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
              pct >= 100 ? 'bg-emerald-100 text-emerald-700' : 'bg-sky-100 text-sky-700'
            }`}
          >
            {pct}%
          </span>
        </ProgressRing>

        {/* Quick add buttons */}
        <div className="grid w-full grid-cols-2 gap-3">
          <button
            onClick={() => addWater(0.25)}
            disabled={adding}
            className="flex items-center justify-center gap-2 rounded-2xl bg-sky-50 py-4 font-semibold text-sky-700 ring-1 ring-sky-100 transition hover:bg-sky-100 disabled:opacity-50"
          >
            <GlassWater size={20} />
            <span className="text-sm">{t('water.glass')}</span>
            <Plus size={16} />
          </button>
          <button
            onClick={() => addWater(0.5)}
            disabled={adding}
            className="flex items-center justify-center gap-2 rounded-2xl bg-sky-50 py-4 font-semibold text-sky-700 ring-1 ring-sky-100 transition hover:bg-sky-100 disabled:opacity-50"
          >
            <Droplets size={20} />
            <span className="text-sm">{t('water.bottle')}</span>
            <Plus size={16} />
          </button>
        </div>

        {/* Custom amount */}
        <form onSubmit={handleCustom} className="flex w-full gap-2">
          <input
            type="number"
            min="1"
            max="10000"
            value={customMl}
            onChange={(e) => setCustomMl(e.target.value)}
            placeholder={t('water.custom')}
            className="num flex-1 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none transition focus:border-sky-500 focus:bg-white focus:ring-2 focus:ring-sky-100"
          />
          <button
            type="submit"
            disabled={adding || !customMl}
            className="rounded-xl bg-sky-600 px-6 py-2.5 text-sm font-semibold text-white shadow-md shadow-sky-200 transition hover:bg-sky-700 disabled:opacity-50"
          >
            {t('water.add')}
          </button>
        </form>

        {error && (
          <p className="text-sm text-rose-600">{error}</p>
        )}
      </div>

      {/* Today's entries */}
      <div className="mt-6 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
        <h2 className="mb-4 font-semibold text-slate-900">{t('water.logs')}</h2>
        {loading ? (
          <p className="py-4 text-center text-sm text-slate-400">{t('common.loading')}</p>
        ) : logs.length === 0 ? (
          <p className="py-4 text-center text-sm text-slate-400">{t('water.noLogs')}</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {logs.map((log) => (
              <li key={log.id} className="flex items-center justify-between py-3">
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-50 text-sky-500">
                    <GlassWater size={16} />
                  </span>
                  <div>
                    <span className="num font-semibold text-slate-800">
                      {(log.liters_consumed * 1000).toFixed(0)} ml
                    </span>
                    {log.time_of_day && (
                      <span className="ms-2 text-xs text-slate-400">
                        {t(`water.${log.time_of_day}`)}
                      </span>
                    )}
                  </div>
                </div>
                <span className="num text-xs text-slate-400">{formatTime(log.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-4 flex items-center gap-2 rounded-2xl bg-sky-50 p-4 text-xs text-sky-600">
        <Droplets size={16} className="shrink-0" />
        {t('water.dailyGoal')}: {DAILY_GOAL_LITERS} {t('common.liters')}
      </div>
    </div>
  );
};
