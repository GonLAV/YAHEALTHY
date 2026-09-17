import { useCallback, useState } from 'react';
import { Plus, Droplets, Moon, Pencil, Target } from 'lucide-react';
import { Card, Button, Modal, Field, inputCls, ErrorState, EmptyState, SkeletonCard, ProgressBar, Chip } from '@/components/ui';
import { WaterModal, SleepModal } from '@/components/QuickLogModals';
import { waterApi, sleepApi, prefApi, surveyApi, apiError, HydrationLog, SleepLog } from '@/services/api';
import { useAsync } from '@/hooks/useAsync';
import { useToast } from '@/hooks/useToast';
import { addDays, fmtDayShort, todayStr } from '@/lib/date';
import { resolveWaterGoal, resolveSleepTarget, sleepConsistency, waterToday } from '@/lib/health';

export const HealthPage = () => {
  const today = todayStr();
  const [waterOpen, setWaterOpen] = useState(false);
  const [sleepOpen, setSleepOpen] = useState(false);
  const [goalOpen, setGoalOpen] = useState(false);
  const [goalInput, setGoalInput] = useState('');
  const [savingGoal, setSavingGoal] = useState(false);
  const { push } = useToast();

  const load = useCallback(async () => {
    const [water, sleep, prefs, surveys] = await Promise.all([
      waterApi.list().then((r) => r.data || []),
      sleepApi.list().then((r) => r.data || []),
      prefApi.get().catch(() => ({})),
      surveyApi.list().then((r) => r.data || []),
    ]);
    return { water, sleep, prefs, survey: surveys[0] ?? null };
  }, []);
  const { data, loading, error, reload } = useAsync(load, []);

  const waterGoal = resolveWaterGoal((data?.prefs as { hydrationGoalLiters?: number })?.hydrationGoalLiters, data?.survey?.water_target_liters);
  const sleepTarget = resolveSleepTarget(data?.survey?.sleep_target_hours);

  // ---- weekly water chart data ----
  const waterWeek = (() => {
    if (!data) return [];
    const start = addDays(today, -6);
    return Array.from({ length: 7 }, (_, i) => {
      const date = addDays(start, i);
      return {
        day: fmtDayShort(date),
        ml: Math.round(waterToday(data.water as HydrationLog[], date) * 1000),
        goal: Math.round(waterGoal * 1000),
      };
    });
  })();

  // ---- weekly sleep chart data ----
  const sleepWeek = (() => {
    if (!data) return [];
    const start = addDays(today, -6);
    return Array.from({ length: 7 }, (_, i) => {
      const date = addDays(start, i);
      const log = (data.sleep as SleepLog[]).find((l) => l.date === date);
      return { day: fmtDayShort(date), hours: log?.sleep_hours ?? 0, target: sleepTarget };
    });
  })();

  const todayWater = data ? waterToday(data.water as HydrationLog[], today) : 0;
  const lastNight = data ? (data.sleep as SleepLog[]).find((l) => l.date === today) ?? null : null;
  const consistency = data ? sleepConsistency((data.sleep as SleepLog[]).slice(0, 7)) : null;

  const saveGoal = async () => {
    const v = Number(goalInput);
    if (!Number.isFinite(v) || v < 0.5 || v > 10) {
      push('Goal must be between 0.5 and 10 liters', 'error');
      return;
    }
    setSavingGoal(true);
    try {
      await prefApi.merge({ hydrationGoalLiters: Math.round(v * 10) / 10 });
      push(`Water goal set to ${v}L`);
      setGoalOpen(false);
      reload();
    } catch (err) {
      push(apiError(err), 'error');
    } finally {
      setSavingGoal(false);
    }
  };

  if (loading && !data) return <SkeletonCard />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return null;

  const waterPct = Math.min(100, (todayWater / waterGoal) * 100);

  return (
    <div className="animate-fade-up space-y-5">
      <div>
        <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight">Health</h1>
        <p className="text-sm text-slate-500 mt-0.5">Hydration and sleep — the two pillars you can improve today</p>
      </div>

      {/* ================= WATER ================= */}
      <Card
        title={
          <span className="flex items-center gap-2">
            <Droplets className="w-4 h-4 text-sky-500" /> Hydration
          </span>
        }
        action={
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => { setGoalInput(String(waterGoal)); setGoalOpen(true); }}>
              <Target className="w-4 h-4" /> Goal
            </Button>
            <Button size="sm" onClick={() => setWaterOpen(true)}>
              <Plus className="w-4 h-4" /> Add
            </Button>
          </div>
        }
      >
        <div className="flex flex-col sm:flex-row items-center gap-6">
          {/* Bottle visualization */}
          <div className="relative w-24 h-44 rounded-b-3xl rounded-t-xl border-4 border-sky-200 overflow-hidden bg-sky-50/50 shrink-0">
            <div
              className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-sky-400 to-sky-300 transition-all duration-700"
              style={{ height: `${waterPct}%` }}
            >
              <div className="absolute -top-1 inset-x-0 h-2 bg-white/40 rounded-full" />
            </div>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <p className="text-2xl font-extrabold text-sky-900 tabular drop-shadow-sm">{Math.round(waterPct)}%</p>
            </div>
          </div>
          <div className="flex-1 w-full">
            <div className="flex items-baseline gap-2">
              <p className="text-4xl font-extrabold text-slate-900 tabular">{(todayWater * 1000).toFixed(0)}<span className="text-lg text-slate-400">ml</span></p>
            </div>
            <p className="text-sm text-slate-500 mt-0.5">
              of {(waterGoal * 1000).toFixed(0)}ml goal · <span className="font-semibold text-sky-600">{Math.max(0, Math.round((waterGoal - todayWater) * 1000))}ml remaining</span>
            </p>
            <ProgressBar className="mt-3" value={todayWater} max={waterGoal} color="bg-sky-500" />
            <div className="grid grid-cols-4 gap-2 mt-4">
              {[250, 500, 750, 1000].map((ml) => (
                <button
                  key={ml}
                  onClick={async () => {
                    try {
                      await waterApi.add(Math.round(ml / 1000) / 10, today);
                      push(`Added ${ml >= 1000 ? '1L' : `${ml}ml`}`);
                      reload();
                    } catch (err) {
                      push(apiError(err), 'error');
                    }
                  }}
                  className="rounded-xl bg-sky-50 border border-sky-100 text-sky-700 text-sm font-bold py-2.5 hover:bg-sky-100 transition"
                >
                  {ml >= 1000 ? '1L' : `${ml}ml`}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Weekly chart */}
        <div className="mt-6">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-2">This week</p>
          <div className="flex items-end gap-2 h-36">
            {waterWeek.map((d) => {
              const max = Math.max(d.goal, ...waterWeek.map((x) => x.ml), 1000);
              const pct = Math.min(100, (d.ml / max) * 100);
              const goalPct = (d.goal / max) * 100;
              return (
                <div key={d.day} className="flex-1 flex flex-col items-center gap-1">
                  <div className="relative w-full h-28 bg-slate-50 rounded-lg overflow-hidden flex items-end">
                    <div className="absolute inset-x-0 border-t-2 border-dashed border-sky-300" style={{ bottom: `${goalPct}%` }} />
                    <div
                      className="w-full bg-sky-400 rounded-t-lg transition-all duration-500"
                      style={{ height: `${pct}%` }}
                    />
                  </div>
                  <span className="text-[11px] font-semibold text-slate-400">{d.day}</span>
                  <span className="text-[10px] text-slate-400 tabular">{d.ml > 0 ? `${d.ml}` : '—'}</span>
                </div>
              );
            })}
          </div>
        </div>
      </Card>

      {/* ================= SLEEP ================= */}
      <Card
        title={
          <span className="flex items-center gap-2">
            <Moon className="w-4 h-4 text-indigo-500" /> Sleep
          </span>
        }
        action={
          <Button size="sm" onClick={() => setSleepOpen(true)}>
            <Plus className="w-4 h-4" /> Log
          </Button>
        }
      >
        {!lastNight ? (
          <EmptyState
            icon={<Moon className="w-7 h-7" />}
            title="No sleep logged for last night"
            text={`Log your bedtime and wake time to track consistency. Your target: ${sleepTarget}h.`}
            action={<Button size="sm" onClick={() => setSleepOpen(true)}>Log last night</Button>}
          />
        ) : (
          <div className="flex items-center gap-5">
            <div className="text-center">
              <p className="text-4xl font-extrabold text-indigo-700 tabular">{lastNight.sleep_hours}h</p>
              {lastNight.sleep_quality && <Chip color="indigo" className="mt-1 capitalize">{lastNight.sleep_quality}</Chip>}
            </div>
            <div className="flex-1">
              <p className="text-sm text-slate-500">
                vs {sleepTarget}h target ·{' '}
                <span className={lastNight.sleep_hours >= sleepTarget ? 'text-emerald-600 font-semibold' : 'text-amber-600 font-semibold'}>
                  {lastNight.sleep_hours >= sleepTarget ? 'on target' : `${(sleepTarget - lastNight.sleep_hours).toFixed(1)}h short`}
                </span>
              </p>
              {lastNight.notes && <p className="text-sm text-slate-400 mt-1 italic">“{lastNight.notes}”</p>}
              <ProgressBar className="mt-3" value={lastNight.sleep_hours} max={sleepTarget} color="bg-indigo-500" />
            </div>
          </div>
        )}

        {/* Weekly chart */}
        <div className="mt-6">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-400">This week</p>
            {consistency && <p className="text-xs text-slate-500">{consistency.label}</p>}
          </div>
          <div className="flex items-end gap-2 h-36">
            {sleepWeek.map((d) => {
              const max = 10;
              const pct = Math.min(100, (d.hours / max) * 100);
              const targetPct = (d.target / max) * 100;
              return (
                <div key={d.day} className="flex-1 flex flex-col items-center gap-1">
                  <div className="relative w-full h-28 bg-slate-50 rounded-lg overflow-hidden flex items-end">
                    <div className="absolute inset-x-0 border-t-2 border-dashed border-indigo-300" style={{ bottom: `${targetPct}%` }} />
                    <div
                      className={`w-full rounded-t-lg transition-all duration-500 ${d.hours >= d.target ? 'bg-indigo-500' : 'bg-indigo-300'}`}
                      style={{ height: `${pct}%` }}
                    />
                  </div>
                  <span className="text-[11px] font-semibold text-slate-400">{d.day}</span>
                  <span className="text-[10px] text-slate-400 tabular">{d.hours > 0 ? `${d.hours}h` : '—'}</span>
                </div>
              );
            })}
          </div>
          {consistency && !Number.isNaN(consistency.stdDev) && (
            <p className="text-xs text-slate-400 mt-2">
              Wellness note: your sleep duration varies by ±{consistency.stdDev}h night-to-night. Consistent bedtimes usually feel best.
            </p>
          )}
        </div>
      </Card>

      {/* Recent sleep logs */}
      {(data.sleep as SleepLog[]).length > 0 && (
        <Card title="Recent sleep logs">
          <div className="space-y-2">
            {(data.sleep as SleepLog[]).slice(0, 7).map((l) => (
              <div key={l.id} className="flex items-center justify-between rounded-xl border border-slate-100 px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-slate-800">{fmtDayShort(l.date)} · {l.date === today ? 'today' : l.date}</p>
                  <p className="text-xs text-slate-400 capitalize">{l.sleep_quality || '—'}</p>
                </div>
                <p className="text-sm font-bold text-indigo-700 tabular">{l.sleep_hours}h</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      <WaterModal open={waterOpen} onClose={() => setWaterOpen(false)} onSaved={reload} />
      <SleepModal open={sleepOpen} onClose={() => setSleepOpen(false)} onSaved={reload} />

      <Modal open={goalOpen} onClose={() => setGoalOpen(false)} title="Daily water goal">
        <Field label="Goal (liters)" hint="A common starting point is 30-35ml per kg of body weight">
          <input
            type="number"
            min="0.5"
            max="10"
            step="0.1"
            inputMode="decimal"
            value={goalInput}
            onChange={(e) => setGoalInput(e.target.value)}
            className={`${inputCls} text-center text-2xl font-bold`}
          />
        </Field>
        <Button className="w-full mt-4" loading={savingGoal} onClick={saveGoal}>
          <Pencil className="w-4 h-4" /> Save goal
        </Button>
      </Modal>
    </div>
  );
};
