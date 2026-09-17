import { FoodLog, HydrationLog, SleepLog, Targets, WeightGoal, WeightLog } from '@/services/api';

export interface ScoreFactor {
  key: string;
  label: string;
  points: number;
  max: number;
  detail: string;
}

export interface HealthScore {
  score: number;
  factors: ScoreFactor[];
}

interface ScoreInput {
  calories: number;
  targetCalories: number | null;
  protein: number;
  targetProtein: number | null;
  waterLiters: number;
  waterGoal: number;
  sleepHours: number | null;
  sleepTarget: number;
  streak: number;
}

/**
 * A general daily wellness score (0-100) built from the user's own logged
 * data. Not medical advice — just an explainable consistency indicator.
 */
export function computeHealthScore(input: ScoreInput): HealthScore {
  const factors: ScoreFactor[] = [];

  // Nutrition (25): closeness to calorie target
  if (input.targetCalories && input.targetCalories > 0) {
    const ratio = input.calories / input.targetCalories;
    const off = Math.abs(1 - ratio);
    let pts = 0;
    if (input.calories === 0) pts = 0;
    else if (off <= 0.1) pts = 25;
    else if (off <= 0.2) pts = 19;
    else if (off <= 0.35) pts = 13;
    else pts = 7;
    factors.push({
      key: 'nutrition',
      label: 'Nutrition',
      points: pts,
      max: 25,
      detail:
        input.calories === 0
          ? 'No meals logged yet today'
          : `${Math.round(input.calories)} of ${input.targetCalories} kcal (${Math.round(ratio * 100)}%)`,
    });
  } else {
    factors.push({
      key: 'nutrition',
      label: 'Nutrition',
      points: input.calories > 0 ? 12 : 0,
      max: 25,
      detail: input.calories > 0 ? 'No calorie target set yet' : 'No meals logged yet today',
    });
  }

  // Protein (25)
  if (input.targetProtein && input.targetProtein > 0) {
    const ratio = input.protein / input.targetProtein;
    const pts = Math.round(Math.min(1, ratio) * 25);
    factors.push({
      key: 'protein',
      label: 'Protein',
      points: pts,
      max: 25,
      detail: `${Math.round(input.protein)}g of ${Math.round(input.targetProtein)}g target`,
    });
  } else {
    factors.push({
      key: 'protein',
      label: 'Protein',
      points: input.protein > 0 ? 12 : 0,
      max: 25,
      detail: input.protein > 0 ? 'No protein target set yet' : 'Nothing logged yet today',
    });
  }

  // Hydration (20)
  const waterRatio = input.waterGoal > 0 ? input.waterLiters / input.waterGoal : 0;
  factors.push({
    key: 'hydration',
    label: 'Hydration',
    points: Math.round(Math.min(1, waterRatio) * 20),
    max: 20,
    detail: `${(input.waterLiters * 1000).toFixed(0)}ml of ${(input.waterGoal * 1000).toFixed(0)}ml goal`,
  });

  // Sleep (20)
  if (input.sleepHours != null) {
    const off = Math.abs(input.sleepHours - input.sleepTarget);
    const pts = off <= 0.5 ? 20 : off <= 1 ? 15 : off <= 2 ? 9 : 4;
    factors.push({
      key: 'sleep',
      label: 'Sleep',
      points: pts,
      max: 20,
      detail: `${input.sleepHours}h vs ${input.sleepTarget}h target`,
    });
  } else {
    factors.push({
      key: 'sleep',
      label: 'Sleep',
      points: 0,
      max: 20,
      detail: 'No sleep logged for last night',
    });
  }

  // Consistency (10)
  const streakPts = input.streak >= 7 ? 10 : input.streak >= 3 ? 6 : input.streak >= 1 ? 3 : 0;
  factors.push({
    key: 'consistency',
    label: 'Consistency',
    points: streakPts,
    max: 10,
    detail:
      input.streak > 0
        ? `${input.streak}-day logging streak`
        : 'Log today to start a streak',
  });

  const score = factors.reduce((sum, f) => sum + f.points, 0);
  return { score, factors };
}

export function scoreExplanation(score: HealthScore): string {
  const parts = score.factors
    .slice()
    .sort((a, b) => b.points / b.max - a.points / a.max)
    .slice(0, 3)
    .map((f) =>
      f.points / f.max >= 0.8
        ? `your ${f.label.toLowerCase()} is on track (${f.detail})`
        : f.points / f.max >= 0.5
        ? `your ${f.label.toLowerCase()} is close (${f.detail})`
        : `your ${f.label.toLowerCase()} could improve (${f.detail})`
    );
  return `Your score is ${score.score} because ${parts.join(', ')}.`;
}

export function scoreBand(score: number): { label: string; tone: string } {
  if (score >= 80) return { label: 'Excellent day', tone: 'text-emerald-600' };
  if (score >= 60) return { label: 'Good day', tone: 'text-teal-600' };
  if (score >= 40) return { label: 'Getting there', tone: 'text-amber-600' };
  return { label: 'Room to grow', tone: 'text-slate-500' };
}

// ---------- aggregation helpers over log arrays ----------

export function sumCalories(logs: FoodLog[]): number {
  return logs.reduce((s, l) => s + (l.calories || 0), 0);
}
export function sumMacros(logs: FoodLog[]) {
  return logs.reduce(
    (acc, l) => ({
      protein: acc.protein + (l.protein_grams || 0),
      carbs: acc.carbs + (l.carbs_grams || 0),
      fat: acc.fat + (l.fat_grams || 0),
    }),
    { protein: 0, carbs: 0, fat: 0 }
  );
}
export function waterToday(logs: HydrationLog[], date: string): number {
  return logs
    .filter((l) => l.date === date)
    .reduce((s, l) => s + (l.liters_consumed || 0), 0);
}
export function sleepForDate(logs: SleepLog[], date: string): SleepLog | null {
  return logs.find((l) => l.date === date) ?? null;
}

// ---------- weight ----------

export interface WeightProgress {
  start: number;
  current: number;
  target: number;
  totalChange: number;
  remaining: number;
  pct: number; // 0-100 toward goal
  direction: 'loss' | 'gain' | 'maintain';
}

export function weightProgress(goal: WeightGoal, logs: WeightLog[]): WeightProgress | null {
  if (!logs || logs.length === 0) return null;
  const sorted = [...logs].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
  const start = goal.start_weight_kg;
  const current = sorted[sorted.length - 1].weight_kg;
  const target = goal.target_weight_kg;
  const totalChange = current - start;
  const toGo = target - start;
  const done = toGo === 0 ? 1 : (start - current) / (start - target);
  return {
    start,
    current,
    target,
    totalChange: Math.round(totalChange * 10) / 10,
    remaining: Math.round(Math.abs(target - current) * 10) / 10,
    pct: Math.max(0, Math.min(100, Math.round(done * 100))),
    direction: target < start ? 'loss' : target > start ? 'gain' : 'maintain',
  };
}

export function milestoneReached(pct: number): number {
  if (pct >= 100) return 100;
  if (pct >= 75) return 75;
  if (pct >= 50) return 50;
  if (pct >= 25) return 25;
  return 0;
}

// ---------- sleep consistency (wellness-oriented, no medical claims) ----------

export function sleepConsistency(logs: SleepLog[]): { stdDev: number; label: string } {
  const hours = logs.map((l) => l.sleep_hours).filter((h): h is number => typeof h === 'number');
  if (hours.length < 3) return { stdDev: NaN, label: 'Log a few more nights to see your consistency' };
  const mean = hours.reduce((a, b) => a + b, 0) / hours.length;
  const variance = hours.reduce((a, b) => a + (b - mean) ** 2, 0) / hours.length;
  const stdDev = Math.round(Math.sqrt(variance) * 10) / 10;
  const label =
    stdDev <= 0.75
      ? 'Your sleep duration has been more consistent this week'
      : stdDev <= 1.5
      ? 'Your sleep is moderately consistent — a fixed bedtime could help'
      : 'Your sleep varies a lot — try a regular bedtime window';
  return { stdDev, label };
}

export const DEFAULT_WATER_GOAL = 2.5;
export const DEFAULT_SLEEP_TARGET = 8;

export function resolveWaterGoal(prefsGoal: number | undefined, surveyGoal: number | undefined): number {
  return prefsGoal || surveyGoal || DEFAULT_WATER_GOAL;
}

export function resolveSleepTarget(surveyTarget: number | undefined): number {
  return surveyTarget || DEFAULT_SLEEP_TARGET;
}

export function resolveTargets(t: Targets | null | undefined) {
  return {
    calories: t?.calories ?? null,
    protein: t?.protein_grams ?? null,
    carbs: t?.carbs_grams ?? null,
    fat: t?.fat_grams ?? null,
  };
}
