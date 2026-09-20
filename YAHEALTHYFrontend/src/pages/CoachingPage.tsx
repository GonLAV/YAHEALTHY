import { useEffect, useMemo, useState } from 'react';
import { MessageCircleHeart, Send, Sparkles, RefreshCw, Bot, User } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { crmApi } from '@/services/api';
import { useLanguage } from '@/i18n/LanguageContext';
import PageHeader from '@/components/ui/PageHeader';

type CrmInsight = {
  id: string;
  insight_type?: string;
  title?: string;
  content?: string;
  created_at?: string;
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

type ChatMessage = {
  role: 'user' | 'coach';
  text: string;
};

export const CoachingPage = () => {
  const { user } = useAuth();
  const { t, lang } = useLanguage();
  const userId = user?.id;

  const [insights, setInsights] = useState<CrmInsight[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [message, setMessage] = useState('');
  const [loadingInsights, setLoadingInsights] = useState(false);
  const [asking, setAsking] = useState(false);

  const canAsk = useMemo(() => !asking && message.trim().length > 0, [asking, message]);
  const [insights, setInsights] = useState<DailyInsights | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadInsights = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await crmApi.getInsights(userId, lang);
      const data = (res.data?.data ?? res.data) as CrmInsight[];
      setInsights(Array.isArray(data) ? data : []);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const handleAsk = async () => {
    if (!userId || !canAsk) return;

    const question = message.trim();
    setMessages((prev) => [...prev, { role: 'user', text: question }]);
    setMessage('');
    setAsking(true);

    try {
      const res = await crmApi.askCoach(userId, question, lang);
      const answer = res.data?.response || res.data?.message || '';
      setMessages((prev) => [...prev, { role: 'coach', text: answer || t('coach.error') }]);
      setTimeout(loadInsights, 750);
    } catch (err) {
      setMessages((prev) => [...prev, { role: 'coach', text: t('coach.error') }]);
    } finally {
      setAsking(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl p-4 md:p-8">
      <PageHeader
        title={t('coach.title')}
        subtitle={t('coach.subtitle')}
        icon={<MessageCircleHeart size={24} />}
      />

      {/* Insights */}
      <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-100">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-semibold text-slate-900">
            <Sparkles size={18} className="text-violet-500" />
            {t('coach.insights')}
          </h2>
          <button
            onClick={loadInsights}
            disabled={loadingInsights}
            className="flex items-center gap-1.5 rounded-full bg-violet-50 px-3.5 py-1.5 text-xs font-semibold text-violet-700 transition hover:bg-violet-100 disabled:opacity-50"
          >
            <RefreshCw size={13} className={loadingInsights ? 'animate-spin' : ''} />
            {loadingInsights ? t('coach.refreshing') : t('coach.refresh')}
          </button>
  }, [loadInsights]);

  if (!userId) {
    return (
      <div className="min-h-screen bg-gray-50 p-8" dir="rtl">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-3xl font-bold text-gray-900">ליווי</h1>
          <p className="text-gray-600 mt-2">יש להתחבר כדי לראות את הליווי.</p>
        </div>

        {loadingInsights ? (
          <p className="py-4 text-center text-sm text-slate-400">{t('common.loading')}</p>
        ) : insights.length === 0 ? (
          <p className="py-4 text-center text-sm text-slate-400">{t('coach.noInsights')}</p>
        ) : (
          <div className="space-y-3">
            {insights.map((insight) => (
              <div
                key={insight.id}
                className="rounded-2xl bg-gradient-to-br from-violet-50 to-indigo-50 p-4 ring-1 ring-violet-100"
              >
                <p className="font-semibold text-violet-900">
                  {insight.title || insight.insight_type || ''}
                </p>
                {insight.content && (
                  <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{insight.content}</p>
                )}
              </div>
            ))}
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
        )}
      </div>

      {/* Chat */}
      <div className="mt-6 rounded-3xl bg-white shadow-sm ring-1 ring-slate-100">
        <div className="border-b border-slate-100 px-6 py-4">
          <h2 className="flex items-center gap-2 font-semibold text-slate-900">
            <Bot size={18} className="text-emerald-500" />
            {t('coach.ask')}
          </h2>
        </div>

        <div className="flex max-h-96 min-h-32 flex-col gap-3 overflow-y-auto p-6">
          {messages.length === 0 && !asking && (
            <p className="flex flex-1 items-center justify-center text-center text-sm text-slate-300">
              {t('coach.placeholder')}
            </p>
          )}
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex items-end gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {msg.role === 'coach' && (
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                  <Bot size={16} />
                </span>
              )}
              <div
                className={`max-w-[80%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-100 text-slate-800'
                }`}
              >
                {msg.text}
              </div>
              {msg.role === 'user' && (
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                  <User size={16} />
                </span>
              )}
            </div>
          ))}
          {asking && (
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                <Bot size={16} />
              </span>
              <span className="flex gap-1 rounded-2xl bg-slate-100 px-4 py-3">
                <span className="h-2 w-2 animate-bounce rounded-full bg-slate-400" />
                <span className="h-2 w-2 animate-bounce rounded-full bg-slate-400" style={{ animationDelay: '0.15s' }} />
                <span className="h-2 w-2 animate-bounce rounded-full bg-slate-400" style={{ animationDelay: '0.3s' }} />
              </span>
            </div>
          )}
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

        <div className="flex gap-2 border-t border-slate-100 p-4">
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={t('coach.placeholder')}
            className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-100"
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAsk();
            }}
          />
          <button
            onClick={handleAsk}
            disabled={!canAsk}
            className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-emerald-200 transition hover:bg-emerald-700 disabled:opacity-50"
          >
            <Send size={16} />
            {t('coach.askBtn')}
          </button>
        </div>
      </div>
    </div>
  );
};
