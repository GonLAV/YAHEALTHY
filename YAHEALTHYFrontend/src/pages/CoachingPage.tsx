import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { MessageCircleHeart, Send, Sparkles, RefreshCw, Bot, User, ArrowRight } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { crmApi } from '@/services/api';
import { useLanguage } from '@/i18n/LanguageContext';
import PageHeader from '@/components/ui/PageHeader';

type InsightPriority = 'high' | 'medium' | 'low';

/** One card from GET /api/crm/users/:id/insights (utils/coach.js). */
type CrmInsight = {
  id: string;
  insight_type?: string;
  kind?: 'alert' | 'tip' | 'celebrate' | 'safety';
  priority?: InsightPriority;
  rank?: number;
  title?: string;
  reason?: string;
  action?: string;
  content?: string;
  cta?: { href: string; label: string };
  created_at?: string;
};

const PRIORITY_STYLE: Record<InsightPriority, { card: string; badge: string }> = {
  high: { card: 'from-rose-50 to-amber-50 ring-rose-200', badge: 'bg-rose-100 text-rose-800' },
  medium: { card: 'from-violet-50 to-indigo-50 ring-violet-100', badge: 'bg-violet-100 text-violet-800' },
  low: { card: 'from-slate-50 to-emerald-50 ring-slate-200', badge: 'bg-slate-100 text-slate-700' },
};

const isPriority = (p: unknown): p is InsightPriority => p === 'high' || p === 'medium' || p === 'low';

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

  const loadInsights = async () => {
    if (!userId) return;
    setLoadingInsights(true);
    try {
      const res = await crmApi.getInsights(userId, lang);
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
    // Cards are written server-side in the UI language, so refetch on toggle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, lang]);

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
            type="button"
            onClick={loadInsights}
            disabled={loadingInsights}
            className="flex items-center gap-1.5 rounded-full bg-violet-50 px-3.5 py-1.5 text-xs font-semibold text-violet-700 transition hover:bg-violet-100 disabled:opacity-50"
          >
            <RefreshCw size={13} className={loadingInsights ? 'animate-spin' : ''} />
            {loadingInsights ? t('coach.refreshing') : t('coach.refresh')}
          </button>
        </div>

        <div role="status" aria-live="polite" className="sr-only">
          {loadingInsights ? t('coach.insightsLoading') : ''}
        </div>
        {loadingInsights ? (
          <p aria-hidden="true" className="py-4 text-center text-sm text-slate-500">{t('common.loading')}</p>
        ) : insights.length === 0 ? (
          <p className="py-4 text-center text-sm text-slate-500">{t('coach.noInsights')}</p>
        ) : (
          <ol className="flex flex-col gap-3" aria-label={t('coach.insightsList')}>
            {insights.map((insight) => {
              const priority: InsightPriority = isPriority(insight.priority) ? insight.priority : 'medium';
              const style = PRIORITY_STYLE[priority];
              const titleId = `insight-${insight.id}-title`;
              return (
                <li key={insight.id}>
                  <article
                    aria-labelledby={titleId}
                    className={`rounded-2xl bg-gradient-to-br p-4 ring-1 ${style.card}`}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${style.badge}`}>
                        {t(`coach.priority.${priority}`)}
                      </span>
                      <h3 id={titleId} className="font-semibold text-slate-900">
                        {insight.title || insight.insight_type || ''}
                      </h3>
                    </div>
                    {insight.reason || insight.action ? (
                      <dl className="mt-2 flex flex-col gap-1.5 text-sm leading-relaxed text-slate-700">
                        {insight.reason && (
                          <div>
                            <dt className="inline font-semibold text-slate-800">{t('coach.why')} </dt>
                            <dd className="inline">{insight.reason}</dd>
                          </div>
                        )}
                        {insight.action && (
                          <div>
                            <dt className="inline font-semibold text-slate-800">{t('coach.nextStep')} </dt>
                            <dd className="inline">{insight.action}</dd>
                          </div>
                        )}
                      </dl>
                    ) : (
                      insight.content && (
                        <p className="mt-1.5 text-sm leading-relaxed text-slate-700">{insight.content}</p>
                      )
                    )}
                    {insight.cta?.href?.startsWith('/') && (
                      <Link
                        to={insight.cta.href}
                        className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-white px-3.5 py-1.5 text-xs font-semibold text-violet-800 shadow-sm ring-1 ring-violet-200 transition hover:bg-violet-50"
                      >
                        {insight.cta.label}
                        <ArrowRight size={13} aria-hidden="true" className="rtl:rotate-180" />
                      </Link>
                    )}
                  </article>
                </li>
              );
            })}
          </ol>
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
            <p className="flex flex-1 items-center justify-center text-center text-sm text-slate-500">
              {t('coach.placeholder')}
            </p>
          )}
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex items-end gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {msg.role === 'coach' && (
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                  <Bot size={16} />
                </span>
              )}
              <div
                className={`max-w-[80%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-emerald-700 text-white'
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
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                <Bot size={16} />
              </span>
              <span className="flex gap-1 rounded-2xl bg-slate-100 px-4 py-3">
                <span className="h-2 w-2 animate-bounce rounded-full bg-slate-400" />
                <span className="h-2 w-2 animate-bounce rounded-full bg-slate-400" style={{ animationDelay: '0.15s' }} />
                <span className="h-2 w-2 animate-bounce rounded-full bg-slate-400" style={{ animationDelay: '0.3s' }} />
              </span>
            </div>
          )}
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
            className="flex items-center gap-1.5 rounded-xl bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-emerald-200 transition hover:bg-emerald-800 disabled:opacity-50"
          >
            <Send size={16} />
            {t('coach.askBtn')}
          </button>
        </div>
      </div>
    </div>
  );
};
