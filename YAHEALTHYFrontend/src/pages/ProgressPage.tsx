import { useCallback, useMemo, useState } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Plus, Pencil, Trash2, Scale, Trophy } from 'lucide-react';
import { Card, Button, Modal, Field, inputCls, ErrorState, EmptyState, SkeletonCard, ProgressBar, Chip, Segmented } from '@/components/ui';
import { WeightModal } from '@/components/QuickLogModals';
import { TrendsSection } from '@/components/TrendsSection';
import { weightApi, apiError, WeightLog } from '@/services/api';
import { useAsync } from '@/hooks/useAsync';
import { useToast } from '@/hooks/useToast';
import { fmtDate } from '@/lib/date';
import { milestoneReached, weightProgress } from '@/lib/health';

const MILESTONES = [
  { pct: 25, label: '25% there' },
  { pct: 50, label: 'Halfway' },
  { pct: 75, label: '75% there' },
  { pct: 100, label: 'Goal reached' },
];

export const ProgressPage = () => {
  const [logOpen, setLogOpen] = useState(false);
  const [goalOpen, setGoalOpen] = useState(false);
  const [goalForm, setGoalForm] = useState({ start: '', target: '' });
  const [savingGoal, setSavingGoal] = useState(false);
  const [editing, setEditing] = useState<WeightLog | null>(null);
  const [editValue, setEditValue] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [trend, setTrend] = useState<'7' | '30' | 'all'>('all');
  const { push } = useToast();

  const load = useCallback(async () => {
    const [goals, logs] = await Promise.all([
      weightApi.goals().then((r) => r.data || []),
      weightApi.logs().then((r) => r.data || []),
    ]);
    return { goal: goals[0] ?? null, logs };
  }, []);
  const { data, loading, error, reload } = useAsync(load, []);

  const goal = data?.goal ?? null;
  const progress = goal ? weightProgress(goal, (data?.logs || []) as WeightLog[]) : null;

  // Logs sorted oldest -> newest for the chart
  const sortedLogs = useMemo(() => {
    const logs = [...((data?.logs || []) as WeightLog[])];
    logs.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    return logs;
  }, [data]);

  const chartData = useMemo(() => {
    let logs = sortedLogs;
    if (trend === '7') logs = logs.slice(-7);
    else if (trend === '30') logs = logs.slice(-30);
    return logs.map((l) => ({
      date: fmtDate(l.created_at.slice(0, 10)),
      weight: l.weight_kg,
    }));
  }, [sortedLogs, trend]);

  const createGoal = async () => {
    const start = Number(goalForm.start);
    const target = Number(goalForm.target);
    if (!Number.isFinite(start) || start < 30 || start > 300) {
      push('Start weight must be between 30 and 300 kg', 'error');
      return;
    }
    if (!Number.isFinite(target) || target < 30 || target > 300) {
      push('Target weight must be between 30 and 300 kg', 'error');
      return;
    }
    setSavingGoal(true);
    try {
      await weightApi.createGoal(Math.round(start * 10) / 10, Math.round(target * 10) / 10);
      push('Weight goal created — let\'s go! 🎯');
      setGoalOpen(false);
      reload();
    } catch (err) {
      push(apiError(err), 'error');
    } finally {
      setSavingGoal(false);
    }
  };

  const saveEdit = async () => {
    if (!editing || savingEdit) return;
    const v = Number(editValue);
    if (!Number.isFinite(v) || v < 30 || v > 300) {
      push('Weight must be between 30 and 300 kg', 'error');
      return;
    }
    setSavingEdit(true);
    try {
      await weightApi.updateLog(editing.id, Math.round(v * 10) / 10);
      push('Weigh-in updated');
      setEditing(null);
      reload();
    } catch (err) {
      push(apiError(err), 'error');
    } finally {
      setSavingEdit(false);
    }
  };

  const removeLog = async (log: WeightLog) => {
    try {
      await weightApi.removeLog(log.id);
      push('Weigh-in deleted');
      reload();
    } catch (err) {
      push(apiError(err), 'error');
    }
  };

  if (loading && !data) return <SkeletonCard />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return null;

  return (
    <div className="animate-fade-up space-y-5">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight">Progress</h1>
          <p className="text-sm text-slate-500 mt-0.5">Your weight journey — trend over noise</p>
        </div>
        {goal && (
          <Button onClick={() => setLogOpen(true)} className="shrink-0">
            <Plus className="w-4 h-4" /> Log weigh-in
          </Button>
        )}
      </div>

      {/* No goal yet */}
      {!goal && (
        <Card>
          <EmptyState
            icon={<Scale className="w-7 h-7" />}
            title="Set your weight goal"
            text="Choose a start and target weight — then log weigh-ins here and watch the milestones unlock."
            action={<Button onClick={() => setGoalOpen(true)}>Create weight goal</Button>}
          />
        </Card>
      )}

      {/* Goal overview */}
      {goal && progress && (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-slate-500">Goal journey</p>
              <p className="text-2xl font-extrabold text-slate-900">
                {progress.start}kg <span className="text-slate-300 mx-1">→</span>{' '}
                <span className="text-emerald-600">{progress.target}kg</span>
              </p>
            </div>
            <Chip color={progress.pct >= 100 ? 'emerald' : 'teal'} className="text-sm py-1">
              <Trophy className="w-3.5 h-3.5" /> {progress.pct}% toward goal
            </Chip>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
            <Stat label="Start weight" value={`${progress.start}kg`} />
            <Stat label="Current weight" value={`${progress.current}kg`} accent="text-emerald-700" />
            <Stat
              label="Total change"
              value={`${progress.totalChange > 0 ? '+' : ''}${progress.totalChange}kg`}
              accent={progress.totalChange < 0 ? 'text-emerald-600' : progress.totalChange > 0 ? 'text-amber-600' : 'text-slate-700'}
            />
            <Stat label="Remaining" value={`${progress.remaining}kg`} />
          </div>

          <ProgressBar className="mt-5" value={progress.pct} max={100} color="bg-emerald-500" />

          {/* Milestones */}
          <div className="grid grid-cols-4 gap-2 mt-4">
            {MILESTONES.map((m) => {
              const reached = milestoneReached(progress.pct) >= m.pct;
              return (
                <div
                  key={m.pct}
                  className={`rounded-xl px-2 py-2.5 text-center text-xs font-bold transition ${
                    reached ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-50 text-slate-400'
                  }`}
                >
                  {reached ? '🏆 ' : '🔒 '}
                  {m.label}
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* 30-day weight & calorie trends */}
      <TrendsSection />

      {/* Chart */}
      {goal && chartData.length > 0 && (
        <Card
          title="Weight trend"
          action={
            <Segmented
              value={trend}
              onChange={setTrend}
              options={[
                { value: '7', label: '7d' },
                { value: '30', label: '30d' },
                { value: 'all', label: 'All' },
              ]}
            />
          }
        >
          <div className="h-64 -ml-3">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
                <CartesianGrid stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                <YAxis
                  domain={['dataMin - 1', 'dataMax + 1']}
                  tick={{ fontSize: 11, fill: '#94a3b8' }}
                  tickLine={false}
                  axisLine={false}
                  width={40}
                />
                <Tooltip
                  formatter={(v: number | string) => [`${v}kg`, 'Weight']}
                  contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 13 }}
                />
                <Line
                  type="monotone"
                  dataKey="weight"
                  stroke="#059669"
                  strokeWidth={2.5}
                  dot={{ r: 3, fill: '#059669' }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}
      {goal && chartData.length === 0 && (
        <Card>
          <EmptyState title="No weigh-ins yet" text="Log your first weigh-in to start the trend chart." action={<Button size="sm" onClick={() => setLogOpen(true)}>Log weigh-in</Button>} />
        </Card>
      )}

      {/* Weigh-in history */}
      {goal && (
        <Card title="Weigh-in history">
          {(data.logs || []).length === 0 ? (
            <p className="text-sm text-slate-400">No weigh-ins yet.</p>
          ) : (
            <div className="space-y-2">
              {(data.logs as WeightLog[]).map((l) => (
                <div key={l.id} className="flex items-center gap-3 rounded-xl border border-slate-100 px-4 py-3">
                  <div className="flex-1">
                    <p className="text-sm font-bold text-slate-800 tabular">{l.weight_kg}kg</p>
                    <p className="text-xs text-slate-400">{fmtDate(l.created_at.slice(0, 10))}</p>
                  </div>
                  <button
                    onClick={() => { setEditing(l); setEditValue(String(l.weight_kg)); }}
                    aria-label="Edit weigh-in"
                    className="w-9 h-9 rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600 flex items-center justify-center"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => removeLog(l)}
                    aria-label="Delete weigh-in"
                    className="w-9 h-9 rounded-full text-slate-400 hover:bg-rose-50 hover:text-rose-600 flex items-center justify-center"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      <WeightModal open={logOpen} onClose={() => setLogOpen(false)} onSaved={reload} goal={goal} />

      {/* Create goal modal */}
      <Modal open={goalOpen} onClose={() => setGoalOpen(false)} title="Create weight goal">
        <div className="space-y-3">
          <Field label="Starting weight (kg)">
            <input type="number" min="30" max="300" step="0.1" inputMode="decimal" value={goalForm.start} onChange={(e) => setGoalForm((f) => ({ ...f, start: e.target.value }))} className={inputCls} />
          </Field>
          <Field label="Target weight (kg)" hint="Lower for weight loss, higher for gaining">
            <input type="number" min="30" max="300" step="0.1" inputMode="decimal" value={goalForm.target} onChange={(e) => setGoalForm((f) => ({ ...f, target: e.target.value }))} className={inputCls} />
          </Field>
          <Button className="w-full" loading={savingGoal} onClick={createGoal}>
            Create goal
          </Button>
        </div>
      </Modal>

      {/* Edit weigh-in modal */}
      <Modal open={!!editing} onClose={() => setEditing(null)} title="Correct weigh-in">
        <Field label="Weight (kg)">
          <input
            type="number"
            min="30"
            max="300"
            step="0.1"
            inputMode="decimal"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            className={`${inputCls} text-center text-2xl font-bold`}
          />
        </Field>
        <div className="flex gap-2 mt-4">
          <Button className="flex-1" loading={savingEdit} onClick={saveEdit}>Save</Button>
          <Button variant="secondary" onClick={() => setEditing(null)}>Cancel</Button>
        </div>
      </Modal>
    </div>
  );
}

function Stat({ label, value, accent = 'text-slate-900' }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 px-4 py-3">
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{label}</p>
      <p className={`text-xl font-extrabold tabular mt-1 ${accent}`}>{value}</p>
    </div>
  );
}
