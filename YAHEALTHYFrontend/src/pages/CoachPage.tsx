import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Sparkles, SendHorizonal } from 'lucide-react';
import { Card, Button, ErrorState, SkeletonCard } from '@/components/ui';
import {
  foodLogApi,
  waterApi,
  sleepApi,
  weightApi,
  targetApi,
  streakApi,
  surveyApi,
  recipeApi,
  HydrationLog,
  SleepLog,
  Targets,
  WeightGoal,
  WeightLog,
  FoodLog,
} from '@/services/api';
import { useAsync } from '@/hooks/useAsync';
import { todayStr } from '@/lib/date';
import { resolveWaterGoal, resolveSleepTarget } from '@/lib/health';
import { CoachData, coachAnswer, dailyRecommendations } from '@/lib/coach';

const SUGGESTED = [
  'How am I doing today?',
  'What should I eat for dinner?',
  'Am I getting enough protein?',
  'How can I improve my sleep?',
  'Give me a healthy meal under 600 calories.',
  "Create tomorrow's meal plan.",
];

interface Message {
  role: 'user' | 'coach';
  text: string;
  time: string;
}

const HISTORY_KEY = 'yahealthy.coach.history';

/**
 * Personal coach chat: grounded in the user's real logged data
 * (rule-based, no external AI service), with saved conversation history.
 */
export const CoachPage = () => {
  const today = todayStr();
  const [messages, setMessages] = useState<Message[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    } catch {
      return [];
    }
  });
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const [logs, water, sleep, goals, weights, targets, streak, surveys, recipes] = await Promise.all([
      foodLogApi.getAll({ date: today }).then((r) => (r.data || []) as FoodLog[]),
      waterApi.list().then((r) => (r.data || []) as HydrationLog[]),
      sleepApi.list().then((r) => (r.data || []) as SleepLog[]),
      weightApi.goals().then((r) => (r.data || []) as WeightGoal[]),
      weightApi.logs().then((r) => (r.data || []) as WeightLog[]),
      targetApi.get().then((r) => r.data.targets as Targets),
      streakApi.get().then((r) => r.data),
      surveyApi.list().then((r) => r.data || []),
      recipeApi.all().then((r) => r.data || []),
    ]);
    const survey = surveys[0] ?? null;
    return {
      logs,
      water,
      sleep,
      goal: goals[0] ?? null,
      weights,
      targets: targets as Targets,
      streak,
      survey,
      recipes,
      // preferences-derived goals
      waterGoal: resolveWaterGoal(undefined, survey?.water_target_liters),
      sleepTarget: resolveSleepTarget(survey?.sleep_target_hours),
    };
  }, [today]);
  const { data, loading, error, reload } = useAsync(load, [today]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const persist = (next: Message[] | ((prev: Message[]) => Message[])) => {
    setMessages((prev) => {
      const value = typeof next === 'function' ? next(prev) : next;
      localStorage.setItem(HISTORY_KEY, JSON.stringify(value.slice(-50)));
      return value;
    });
  };

  const ask = (question: string) => {
    if (!data || thinking || !question.trim()) return;
    const q = question.trim();
    persist([...messages, { role: 'user', text: q, time: new Date().toISOString() }]);
    setInput('');
    setThinking(true);
    // Small delay so the reply feels like a conversation turn
    setTimeout(() => {
      const ctx: CoachData = {
        date: today,
        targets: data.targets,
        todayLogs: data.logs,
        waterLogs: data.water,
        waterGoal: data.waterGoal,
        sleepLogs: data.sleep,
        sleepTarget: data.sleepTarget,
        goal: data.goal,
        weightLogs: data.weights,
        streak: data.streak?.currentStreak ?? 0,
        recipes: data.recipes,
      };
      const reply = coachAnswer(q, ctx);
      persist((prev) => [...prev, { role: 'coach', text: reply, time: new Date().toISOString() }]);
      setThinking(false);
    }, 450);
  };

  const recommendations = useMemo(() => {
    if (!data) return [];
    return dailyRecommendations({
      date: today,
      targets: data.targets,
      todayLogs: data.logs,
      waterLogs: data.water,
      waterGoal: data.waterGoal,
      sleepLogs: data.sleep,
      sleepTarget: data.sleepTarget,
      goal: data.goal,
      weightLogs: data.weights,
      streak: data.streak?.currentStreak ?? 0,
      recipes: data.recipes,
    });
  }, [data, today]);

  if (loading && !data) return <SkeletonCard />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return null;

  return (
    <div className="animate-fade-up grid grid-cols-1 lg:grid-cols-3 gap-5">
      {/* Chat */}
      <div className="lg:col-span-2 space-y-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-teal-600" /> Your Coach
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Grounded in your logged data — meals, water, sleep, weight and streaks
          </p>
        </div>

        <Card padded={false}>
          <div ref={scrollRef} className="h-[55vh] lg:h-[60vh] overflow-y-auto px-4 py-4 space-y-3">
            {messages.length === 0 && (
              <div className="text-center py-10">
                <span className="w-14 h-14 rounded-2xl bg-teal-50 text-teal-600 flex items-center justify-center mx-auto mb-4">
                  <Sparkles className="w-7 h-7" />
                </span>
                <p className="font-bold text-slate-800">Hi! I'm your health coach 👋</p>
                <p className="text-sm text-slate-500 mt-1 max-w-sm mx-auto">
                  Ask me anything about your day, meals, protein, sleep or weight — I'll answer using your real logged data.
                </p>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
                    m.role === 'user'
                      ? 'bg-teal-600 text-white rounded-br-md'
                      : 'bg-slate-100 text-slate-800 rounded-bl-md'
                  }`}
                >
                  {m.text}
                </div>
              </div>
            ))}
            {thinking && (
              <div className="flex justify-start">
                <div className="bg-slate-100 rounded-2xl rounded-bl-md px-4 py-3 flex gap-1.5">
                  <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '120ms' }} />
                  <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '240ms' }} />
                </div>
              </div>
            )}
          </div>
          <div className="border-t border-slate-100 p-3 flex gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && ask(input)}
              placeholder="Ask your coach…"
              className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500/40 focus:border-teal-500 text-sm"
            />
            <Button onClick={() => ask(input)} disabled={!input.trim() || thinking} aria-label="Send">
              <SendHorizonal className="w-4 h-4" />
            </Button>
          </div>
        </Card>

        {/* Suggested prompts */}
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
          {SUGGESTED.map((s) => (
            <button
              key={s}
              onClick={() => ask(s)}
              className="shrink-0 text-sm font-medium text-teal-700 bg-teal-50 border border-teal-100 rounded-full px-4 py-2 hover:bg-teal-100 transition"
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Daily recommendations sidebar */}
      <div className="space-y-4">
        <Card title="Today for you" subtitle="Live from your logged data">
          <div className="space-y-3">
            {recommendations.map((r, i) => (
              <div key={i} className="rounded-xl border border-slate-100 p-3.5 flex gap-3">
                <span className="text-xl shrink-0">{r.icon}</span>
                <div>
                  <p className="text-sm font-bold text-slate-800">{r.title}</p>
                  <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{r.text}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {messages.length > 0 && (
          <Card>
            <Button
              variant="ghost"
              size="sm"
              className="w-full !text-slate-400"
              onClick={() => {
                persist([]);
                localStorage.removeItem(HISTORY_KEY);
              }}
            >
              Clear conversation history
            </Button>
          </Card>
        )}

        <p className="text-xs text-slate-400 leading-relaxed">
          Your coach provides general wellness guidance based on the data you log. It is not medical
          advice — for personal medical questions, consult a healthcare professional.
        </p>
      </div>
    </div>
  );
};
