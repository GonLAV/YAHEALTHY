import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { analyticsApi } from '@/services/api';

type DailyInsights = {
  date?: string;
  logCount?: number;
  totalCalories?: number;
  totalProtein?: number;
  targetCalories?: number | null;
  mealCounts?: Record<string, number>;
  messages?: string[];
};

export const CoachingPage = () => {
  const { user } = useAuth();
  const userId = user?.id;

  const [insights, setInsights] = useState<DailyInsights | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadInsights = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await analyticsApi.getInsights();
      setInsights(res.data ?? null);
    } catch (err) {
      console.error('Failed to load insights:', err);
      setError('לא הצלחנו לטעון את התובנות. אפשר לנסות לרענן.');
      setInsights(null);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    loadInsights();
  }, [loadInsights]);

  if (!userId) {
    return (
      <div className="min-h-screen bg-gray-50 p-8" dir="rtl">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-3xl font-bold text-gray-900">ליווי</h1>
          <p className="text-gray-600 mt-2">יש להתחבר כדי לראות את הליווי.</p>
        </div>
      </div>
    );
  }

  const hasData = !!insights && (insights.logCount ?? 0) > 0;

  return (
    <div className="min-h-screen bg-gray-50 p-8" dir="rtl">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">ליווי</h1>

        {/* Today's numbers */}
        <div className="bg-white rounded-lg shadow p-6 mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-gray-900">התמונה של היום</h2>
            <button
              onClick={loadInsights}
              disabled={loading}
              className="text-indigo-600 hover:text-indigo-700 font-semibold disabled:opacity-50"
            >
              {loading ? 'מרענן…' : 'רענן'}
            </button>
          </div>

          {loading ? (
            <p className="text-gray-600">טוען…</p>
          ) : error ? (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-800">{error}</p>
            </div>
          ) : !hasData ? (
            <p className="text-gray-600">
              עוד לא רשמת כלום היום. אחרי שתרשום ארוחה, התמונה תופיע כאן.
            </p>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <div className="p-4 bg-indigo-50 rounded-lg border border-indigo-200">
                  <p className="text-sm text-indigo-700">ארוחות שנרשמו</p>
                  <p className="text-2xl font-bold text-indigo-900">{insights?.logCount}</p>
                </div>
                <div className="p-4 bg-indigo-50 rounded-lg border border-indigo-200">
                  <p className="text-sm text-indigo-700">קלוריות</p>
                  <p className="text-2xl font-bold text-indigo-900">
                    {insights?.totalCalories ?? 0}
                    {insights?.targetCalories ? (
                      <span className="text-base font-normal text-indigo-700">
                        {' '}
                        / {insights.targetCalories}
                      </span>
                    ) : null}
                  </p>
                </div>
                <div className="p-4 bg-indigo-50 rounded-lg border border-indigo-200">
                  <p className="text-sm text-indigo-700">חלבון (גרם)</p>
                  <p className="text-2xl font-bold text-indigo-900">
                    {Math.round(insights?.totalProtein ?? 0)}
                  </p>
                </div>
              </div>

              {Array.isArray(insights?.messages) && insights!.messages!.length > 0 && (
                <ul className="mt-4 space-y-2">
                  {insights!.messages!.map((m, i) => (
                    <li key={i} className="text-sm text-gray-700">
                      • {m}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>

        {/*
          There is deliberately no free-text nutrition Q&A here.
          An automated answer cannot tell whether the person asking is pregnant,
          diabetic, managing an eating disorder or under 18, so anything
          resembling personal dietary advice has to reach a human first.
          See docs/compliance-register.md.
        */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-2">שאלה לתזונאית</h2>
          <p className="text-gray-700">
            שאלות על תזונה אישית נענות על ידי התזונאית, לא אוטומטית. זה נכון במיוחד אם יש
            היריון, סוכרת, מחלה כרונית, נטילת תרופות, או אם השאלה נוגעת למישהו מתחת לגיל 18.
          </p>
          <p className="text-gray-700 mt-3">
            הליווי ניתן על ידי תזונאית טבעית — לא דיאטנית קלינית ולא רופאה, והוא אינו מחליף
            ייעוץ רפואי.
          </p>
          <p className="text-sm text-gray-500 mt-4">
            הדרך ליצור קשר תופיע כאן בקרוב.
          </p>
        </div>
      </div>
    </div>
  );
};
