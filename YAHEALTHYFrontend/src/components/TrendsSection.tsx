import { useCallback, useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Flame, Scale, TrendingDown, TrendingUp } from 'lucide-react';
import { Card, EmptyState, ErrorState, SkeletonCard } from '@/components/ui';
import { foodLogApi, targetApi, weightApi, FoodLog, WeightLog } from '@/services/api';
import { useAsync } from '@/hooks/useAsync';
import { addDays, fmtDate, fmtDayShort, todayStr } from '@/lib/date';

const DAYS = 30;

/** Fetch food logs page-by-page (endpoint caps at 200 per request) */
async function fetchFoodLogs(start: string, end: string): Promise<FoodLog[]> {
  const all: FoodLog[] = [];
  let offset = 0;
  // Guard: at most 3 pages (~600 entries) is plenty for a month window
  for (let page = 0; page < 3; page++) {
    const res = await foodLogApi.getAll({ start, end, limit: 200, offset });
    const batch = res.data || [];
    all.push(...batch);
    if (batch.length < 200) break;
    offset += 200;
  }
  return all;
}

export const TrendsSection = () => {
  const load = useCallback(async () => {
    const today = todayStr();
    const start = addDays(today, -(DAYS - 1));
    const [foodLogs, weightRes, targetsRes] = await Promise.all([
      fetchFoodLogs(start, today),
      weightApi.logs().then((r) => r.data || []),
      targetApi.get().then((r) => r.data).catch(() => null),
    ]);
    return { foodLogs, weightLogs: weightRes as WeightLog[], calorieTarget: targetsRes?.targets?.calories ?? null };
  }, []);

  const { data, loading, error, reload } = useAsync(load, []);

  // One entry per calendar day in the window (older -> newer)
  const days = useMemo(() => {
    const today = todayStr();
    const list = Array.from({ length: DAYS }, (_, i) => ({
      key: addDays(today, -(DAYS - 1) + i),
      calories: 0,
      logged: false,
      weight: null as number | null,
    }));
    const byKey = new Map(list.map((d) => [d.key, d]));

    for (const f of (data?.foodLogs || []) as FoodLog[]) {
      const d = byKey.get(f.date);
      if (d) {
        d.calories += f.calories || 0;
        d.logged = true;
      }
    }
    for (const w of (data?.weightLogs || []) as WeightLog[]) {
      const d = byKey.get(w.created_at.slice(0, 10));
      if (d && (d.weight == null || new Date(w.created_at) >= new Date(w.weightDate ?? 0))) {
        d.weight = w.weight_kg;
        (d as any).weightDate = w.created_at;
      }
    }
    return list;
  }, [data]);

  const calorieData = days.map((d) => ({ date: d.key, calories: d.calories, logged: d.logged }));
  const loggedDays = calorieData.filter((d) => d.logged);
  const avgCalories = loggedDays.length
    ? Math.round(loggedDays.reduce((s, d) => s + d.calories, 0) / loggedDays.length)
    : 0;
  const calorieTarget = data?.calorieTarget ?? null;

  const weightPoints = days.filter((d) => d.weight != null) as { key: string; weight: number }[];
  const weightData = weightPoints.map((d) => ({ date: d.key, weight: d.weight }));
  const firstWeight = weightData[0]?.weight;
  const lastWeight = weightData[weightData.length - 1]?.weight;
  const weightChange = firstWeight != null && lastWeight != null ? Math.round((lastWeight - firstWeight) * 10) / 10 : null;

  if (loading && !data) return <SkeletonCard />;
  if (error) return <ErrorState message={error} onRetry={reload} />;

  const hasCalories = loggedDays.length > 0;
  const hasWeight = weightData.length > 0;

  if (!hasCalories && !hasWeight) {
    return (
      <Card title="Last 30 days" subtitle="Weight & calorie trends">
        <EmptyState
          icon={<Scale className="w-7 h-7" />}
          title="No trend data yet"
          text="Log meals and weigh-ins — your 30-day charts will appear here."
        />
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      {/* Summary stats */}
      <div className="grid grid-cols-2 gap-3">
        {hasCalories && (
          <div className="rounded-2xl bg-white border border-slate-100 shadow-sm px-4 py-3">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide flex items-center gap-1.5">
              <Flame className="w-3.5 h-3.5 text-emerald-500" /> Avg calories
            </p>
            <p className="text-2xl font-extrabold text-slate-900 tabular mt-1">
              {avgCalories.toLocaleString()}
              <span className="text-sm font-semibold text-slate-400"> /day</span>
            </p>
            {calorieTarget ? (
              <p className="text-xs text-slate-400 mt-0.5">
                {avgCalories <= calorieTarget ? '✅ ' : '⚠️ '}
                vs {calorieTarget.toLocaleString()} target
              </p>
            ) : null}
          </div>
        )}
        {hasWeight && weightChange != null && (
          <div className="rounded-2xl bg-white border border-slate-100 shadow-sm px-4 py-3">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide flex items-center gap-1.5">
              {weightChange < 0 ? (
                <TrendingDown className="w-3.5 h-3.5 text-emerald-500" />
              ) : (
                <TrendingUp className="w-3.5 h-3.5 text-amber-500" />
              )}
              Weight change
            </p>
            <p className="text-2xl font-extrabold text-slate-900 tabular mt-1">
              {weightChange > 0 ? '+' : ''}{weightChange}
              <span className="text-sm font-semibold text-slate-400"> kg / 30d</span>
            </p>
            <p className="text-xs text-slate-400 mt-0.5">
              {firstWeight}kg → {lastWeight}kg
            </p>
          </div>
        )}
      </div>

      {/* Calorie intake chart */}
      {hasCalories && (
        <Card
          title="Calorie intake"
          subtitle="Daily total over the last 30 days"
          action={
            <span className="text-xs font-semibold text-slate-400 pt-1">
              {loggedDays.length}/{DAYS} days logged
            </span>
          }
        >
          <div className="h-56 -ml-3">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={calorieData} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
                <CartesianGrid stroke="#f1f5f9" vertical={false} />
                <XAxis
                  dataKey="date"
                  tickFormatter={(v: string) => fmtDayShort(v)}
                  tick={{ fontSize: 10, fill: '#94a3b8' }}
                  tickLine={false}
                  axisLine={false}
                  interval={4}
                />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} width={44} />
                <Tooltip
                  formatter={(v: number | string) => [`${Number(v).toLocaleString()} kcal`, 'Calories']}
                  labelFormatter={(v: string) => fmtDate(v)}
                  contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 13 }}
                />
                {calorieTarget ? (
                  <ReferenceLine
                    y={calorieTarget}
                    stroke="#0d9488"
                    strokeDasharray="6 4"
                    label={{ value: 'Target', position: 'insideTopRight', fontSize: 11, fill: '#0d9488' }}
                  />
                ) : null}
                <Bar dataKey="calories" fill="#34d399" radius={[4, 4, 0, 0]} maxBarSize={18} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      {/* Weight trend chart */}
      {hasWeight && (
        <Card title="Weight trend" subtitle="Weigh-ins over the last 30 days">
          <div className="h-56 -ml-3">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={weightData} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
                <CartesianGrid stroke="#f1f5f9" vertical={false} />
                <XAxis
                  dataKey="date"
                  tickFormatter={(v: string) => fmtDayShort(v)}
                  tick={{ fontSize: 10, fill: '#94a3b8' }}
                  tickLine={false}
                  axisLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  domain={['dataMin - 1', 'dataMax + 1']}
                  tick={{ fontSize: 11, fill: '#94a3b8' }}
                  tickLine={false}
                  axisLine={false}
                  width={44}
                />
                <Tooltip
                  formatter={(v: number | string) => [`${v}kg`, 'Weight']}
                  labelFormatter={(v: string) => fmtDate(v)}
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
    </div>
  );
};
