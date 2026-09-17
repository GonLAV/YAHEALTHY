import { useEffect, useState } from 'react';
import { analyticsApi } from '@/services/api';
import type { Badge, DailyInsights, ProgressOverview, ResolvedTargets, Streaks } from '@/services/api';

type LoadState = 'loading' | 'error' | 'ready';

export const CoachingPage = () => {
  const [state, setState] = useState<LoadState>('loading');
  const [insights, setInsights] = useState<DailyInsights | null>(null);
  const [badges, setBadges] = useState<Badge[]>([]);
  const [progress, setProgress] = useState<ProgressOverview | null>(null);
  const [targets, setTargets] = useState<ResolvedTargets['targets'] | null>(null);
  const [streaks, setStreaks] = useState<Streaks | null>(null);

  const load = async () => {
    setState('loading');
    try {
      const [insightsRes, badgesRes, progressRes, targetsRes, streaksRes] = await Promise.all([
        analyticsApi.getInsights(),
        analyticsApi.getBadges(),
        analyticsApi.getProgress(),
        analyticsApi.getTargets(),
        analyticsApi.getStreaks(),
      ]);
      setInsights(insightsRes.data);
      setBadges(badgesRes.data.badges);
      setProgress(progressRes.data);
      setTargets(targetsRes.data.targets);
      setStreaks(streaksRes.data);
      setState('ready');
    } catch (err) {
      console.error('Failed to load coaching data:', err);
      setState('error');
    }
  };

  useEffect(() => {
    load();
  }, []);

  if (state === 'loading') {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-3xl font-bold text-gray-900 mb-8">Coaching</h1>
          <p className="text-gray-600">Loading your insights…</p>
        </div>
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-3xl font-bold text-gray-900 mb-8">Coaching</h1>
          <div className="bg-red-50 border border-red-200 rounded-lg p-6">
            <p className="text-red-800">Couldn't load your coaching insights.</p>
            <button
              onClick={load}
              className="mt-3 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
            >
              Try again
            </button>
          </div>
        </div>
      </div>
    );
  }

  const hasTargets = targets && (targets.calories != null || targets.protein_grams != null);

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-3xl mx-auto space-y-8">
        <h1 className="text-3xl font-bold text-gray-900">Coaching</h1>

        {/* Today vs targets */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Today</h2>
          {!hasTargets ? (
            <p className="text-gray-600">
              No targets yet — complete a survey to get personalized calorie and protein targets.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-indigo-50 rounded-lg">
                <p className="text-sm text-gray-600">Calories</p>
                <p className="text-2xl font-bold text-indigo-900">
                  {insights?.totalCalories ?? 0}
                  {targets?.calories != null && (
                    <span className="text-base font-normal text-gray-500"> / {targets.calories}</span>
                  )}
                </p>
                {insights?.calorieStatus && (
                  <p className="text-sm text-gray-600 capitalize mt-1">{insights.calorieStatus} target</p>
                )}
              </div>
              <div className="p-4 bg-green-50 rounded-lg">
                <p className="text-sm text-gray-600">Protein</p>
                <p className="text-2xl font-bold text-green-900">
                  {insights?.totalProtein ?? 0}g
                  {targets?.protein_grams != null && (
                    <span className="text-base font-normal text-gray-500"> / {targets.protein_grams}g</span>
                  )}
                </p>
                {insights?.meetsProteinTarget != null && (
                  <p className="text-sm text-gray-600 mt-1">
                    {insights.meetsProteinTarget ? 'Target met' : 'Below target'}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Streak & badges */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Streak &amp; Badges</h2>
          <p className="text-gray-700 mb-4">
            {streaks && streaks.currentStreak > 0
              ? `🔥 ${streaks.currentStreak}-day logging streak (longest: ${streaks.longestStreak})`
              : 'No active streak yet — log food today to start one.'}
          </p>
          {badges.length === 0 ? (
            <p className="text-gray-600">No badges yet. Keep logging!</p>
          ) : (
            <div className="flex flex-wrap gap-3">
              {badges.map((badge) => (
                <div
                  key={badge.id}
                  className="px-4 py-3 bg-yellow-50 border border-yellow-200 rounded-lg text-center"
                  title={badge.description}
                >
                  <div className="text-2xl">{badge.icon}</div>
                  <p className="text-sm font-semibold text-yellow-900">{badge.name}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Overall progress */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Progress</h2>
          {!progress || progress.stats.totalLogsCount === 0 ? (
            <p className="text-gray-600">No food logs yet — nothing to show here yet.</p>
          ) : (
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-2xl font-bold text-gray-900">{progress.stats.totalDaysLogged}</p>
                <p className="text-sm text-gray-600">days logged</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{progress.stats.averageLogsPerDay}</p>
                <p className="text-sm text-gray-600">logs / day avg</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">
                  {progress.stats.latestWeight != null ? `${progress.stats.latestWeight}kg` : '—'}
                </p>
                <p className="text-sm text-gray-600">latest weight</p>
              </div>
            </div>
          )}
        </div>

        {/* Explicit placeholder instead of a silently-dropped or faked chat */}
        <div className="bg-gray-100 border border-gray-200 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-gray-700 mb-2">Ask Your Coach</h2>
          <p className="text-gray-600 text-sm">
            Free-text nutrition Q&amp;A isn't available yet. The previous version called a backend
            that never existed; generating personalized nutrition advice needs an explicit, reviewed
            decision before it's built — it's not a routing fix.
          </p>
        </div>
      </div>
    </div>
  );
};
