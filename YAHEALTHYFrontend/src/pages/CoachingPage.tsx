import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { crmApi } from '@/services/api';

type CrmInsight = {
  id: string;
  insight_type?: string;
  title?: string;
  content?: string;
  created_at?: string;
};

export const CoachingPage = () => {
  const { user } = useAuth();
  const userId = user?.id;

  const [insights, setInsights] = useState<CrmInsight[]>([]);
  const [message, setMessage] = useState('');
  const [response, setResponse] = useState<string>('');
  const [loadingInsights, setLoadingInsights] = useState(false);
  const [asking, setAsking] = useState(false);

  const canAsk = useMemo(() => !asking && message.trim().length > 0, [asking, message]);

  const loadInsights = async () => {
    if (!userId) return;
    setLoadingInsights(true);
    try {
      const res = await crmApi.getInsights(userId);
      const data = (res.data?.data ?? res.data) as CrmInsight[];
      setInsights(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to load insights:', err);
      setInsights([]);
    } finally {
      setLoadingInsights(false);
    }
  };

  useEffect(() => {
    loadInsights();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const handleAsk = async () => {
    if (!userId || !canAsk) return;

    setAsking(true);
    setResponse('');

    try {
      const res = await crmApi.askCoach(userId, message.trim());
      setResponse(res.data?.response || res.data?.message || '');
      setMessage('');

      // Give the backend a moment to write insights (if it does so async)
      setTimeout(loadInsights, 750);
    } catch (err) {
      console.error('Failed to ask coach:', err);
      setResponse('Sorry, I encountered an error. Please try again.');
    } finally {
      setAsking(false);
    }
  };

  if (!userId) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-3xl font-bold text-gray-900">AI Coaching</h1>
          <p className="text-gray-600 mt-2">Please sign in to use coaching.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">AI Coaching</h1>

        {/* Insights */}
        <div className="bg-white rounded-lg shadow p-6 mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-gray-900">Your Insights</h2>
            <button
              onClick={loadInsights}
              disabled={loadingInsights}
              className="text-indigo-600 hover:text-indigo-700 font-semibold disabled:opacity-50"
            >
              {loadingInsights ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>

          {loadingInsights ? (
            <p className="text-gray-600">Loading insights…</p>
          ) : insights.length === 0 ? (
            <p className="text-gray-600">No insights yet. Keep logging food!</p>
          ) : (
            <div className="space-y-4">
              {insights.map((insight) => (
                <div key={insight.id} className="p-4 bg-indigo-50 rounded-lg border border-indigo-200">
                  <p className="font-semibold text-indigo-900">
                    {insight.title || insight.insight_type || 'Insight'}
                  </p>
                  {insight.content && <p className="text-sm text-gray-700 mt-2">{insight.content}</p>}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Chat */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Ask Your Coach</h2>
          <div className="flex gap-2 mb-4">
            <input
              type="text"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Ask me anything about your nutrition…"
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAsk();
              }}
            />
            <button
              onClick={handleAsk}
              disabled={!canAsk}
              className="px-6 py-2 bg-indigo-600 text-white rounded-lg disabled:opacity-50 hover:bg-indigo-700"
            >
              {asking ? 'Thinking…' : 'Ask'}
            </button>
          </div>

          {response && (
            <div className="p-4 bg-green-50 rounded-lg border border-green-200">
              <p className="text-gray-800">{response}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
