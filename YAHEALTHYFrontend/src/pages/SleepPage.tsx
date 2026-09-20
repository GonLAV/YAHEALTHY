import { useEffect, useState } from 'react';
import { Moon, Plus, X, Star } from 'lucide-react';
import { sleepApi, SleepLog } from '@/services/api';
import { useLanguage } from '@/i18n/LanguageContext';
import PageHeader from '@/components/ui/PageHeader';
import EmptyState from '@/components/ui/EmptyState';

const QUALITY_OPTIONS = [
  { value: 'excellent', stars: 4 },
  { value: 'good', stars: 3 },
  { value: 'fair', stars: 2 },
  { value: 'poor', stars: 1 },
] as const;

const QUALITY_STYLES: Record<string, string> = {
  excellent: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
  good: 'bg-sky-50 text-sky-700 ring-sky-100',
  fair: 'bg-amber-50 text-amber-700 ring-amber-100',
  poor: 'bg-rose-50 text-rose-700 ring-rose-100',
};

export const SleepPage = () => {
  const { t, lang } = useLanguage();
  const [logs, setLogs] = useState<SleepLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [hours, setHours] = useState('');
  const [quality, setQuality] = useState('good');
  const [notes, setNotes] = useState('');

  const fetchLogs = async () => {
    try {
      const res = await sleepApi.getAll();
      setLogs(res.data);
    } catch (err) {
      console.error('Failed to load sleep logs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const h = parseFloat(hours);
    if (!h || h <= 0 || h > 16) {
      setError(t('common.error'));
      return;
    }
    setSubmitting(true);
    try {
      await sleepApi.add({
        sleepHours: h,
        sleepQuality: quality,
        notes: notes.trim() || undefined,
      });
      setHours('');
      setNotes('');
      setQuality('good');
      setShowForm(false);
      fetchLogs();
    } catch (err) {
      setError(t('common.error'));
    } finally {
      setSubmitting(false);
    }
  };

  const inputClass =
    'w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none transition focus:border-indigo-500 focus:bg-white focus:ring-2 focus:ring-indigo-100';

  const formatDate = (date: string) =>
    new Date(date).toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-US', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    });

  const todayStr = new Date().toISOString().split('T')[0];
  const todayLog = logs.find((l) => l.date === todayStr);

  return (
    <div className="mx-auto max-w-4xl p-4 md:p-8">
      <div className="flex items-center justify-between">
        <PageHeader
          title={t('sleep.title')}
          subtitle={t('sleep.subtitle')}
          icon={<Moon size={24} />}
        />
        <button
          onClick={() => setShowForm(!showForm)}
          className={`flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white shadow-md transition ${
            showForm
              ? 'bg-slate-500 hover:bg-slate-600'
              : 'bg-indigo-600 shadow-indigo-200 hover:bg-indigo-700'
          }`}
        >
          {showForm ? <X size={18} /> : <Plus size={18} />}
          {showForm ? t('common.cancel') : t('sleep.logSleep')}
        </button>
      </div>

      {/* Today's sleep */}
      <div className="mb-6 rounded-3xl bg-gradient-to-br from-indigo-600 to-violet-600 p-6 text-white shadow-md shadow-indigo-200">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-indigo-200">{t('common.today')}</p>
            {todayLog ? (
              <div className="mt-1 flex items-baseline gap-1">
                <span className="num text-4xl font-extrabold">{todayLog.sleep_hours.toFixed(1)}</span>
                <span className="text-lg font-medium text-indigo-200">h</span>
              </div>
            ) : (
              <p className="mt-1 text-lg font-medium text-indigo-200">{t('dash.noSleepLogged')}</p>
            )}
          </div>
          {todayLog?.sleep_quality && (
            <span className="flex items-center gap-1 rounded-full bg-white/15 px-4 py-2 text-sm font-semibold">
              <Star size={16} className="text-amber-300" fill="currentColor" />
              {t(`sleep.quality.${todayLog.sleep_quality}`)}
            </span>
          )}
        </div>
      </div>

      {/* Add form */}
      {showForm && (
        <div className="mb-8 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-100">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                {t('sleep.hours')}
              </label>
              <input
                type="number"
                min="0"
                max="16"
                step="0.5"
                value={hours}
                onChange={(e) => setHours(e.target.value)}
                className={inputClass}
                placeholder="7.5"
                required
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                {t('sleep.quality')}
              </label>
              <div className="flex flex-wrap gap-2">
                {QUALITY_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setQuality(opt.value)}
                    className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium transition ${
                      quality === opt.value
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    <span className="flex">
                      {Array.from({ length: opt.stars }).map((_, i) => (
                        <Star key={i} size={13} fill="currentColor" />
                      ))}
                    </span>
                    {t(`sleep.quality.${opt.value}`)}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                {t('sleep.notes')}
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className={`${inputClass} min-h-20 resize-y`}
                placeholder={t('sleep.notesPlaceholder')}
              />
            </div>

            {error && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-xl bg-indigo-600 py-3 font-semibold text-white shadow-md shadow-indigo-200 transition hover:bg-indigo-700 disabled:opacity-60"
            >
              {submitting ? t('common.loading') : t('sleep.logSleep')}
            </button>
          </form>
        </div>
      )}

      {/* History */}
      <h2 className="mb-4 font-semibold text-slate-900">{t('sleep.history')}</h2>
      {loading ? (
        <p className="py-8 text-center text-sm text-slate-400">{t('common.loading')}</p>
      ) : logs.length === 0 ? (
        <EmptyState icon={<Moon size={26} />} text={t('sleep.noLogs')} />
      ) : (
        <div className="space-y-3">
          {logs.slice(0, 14).map((log) => (
            <div
              key={log.id}
              className="flex items-center justify-between rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100"
            >
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-500">
                  <Moon size={20} />
                </span>
                <div>
                  <div className="num font-bold text-slate-900">
                    {log.sleep_hours.toFixed(1)}h
                  </div>
                  <div className="text-xs text-slate-400">{formatDate(log.date)}</div>
                </div>
              </div>
              <div className="flex flex-col items-end gap-1">
                {log.sleep_quality && (
                  <span
                    className={`rounded-full px-3 py-0.5 text-xs font-semibold ring-1 ${
                      QUALITY_STYLES[log.sleep_quality] ?? ''
                    }`}
                  >
                    {t(`sleep.quality.${log.sleep_quality}`)}
                  </span>
                )}
                {log.notes && (
                  <span className="max-w-40 truncate text-xs text-slate-400">{log.notes}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
