import { useCallback, useEffect, useRef, useState } from 'react';
import { Gift, Copy, Check, Share2, Users, BadgeCheck, CalendarPlus, AlertCircle, MessageCircle } from 'lucide-react';
import { referralApi, ReferralSummary } from '@/services/api';
import { useLanguage } from '@/i18n/LanguageContext';
import PageHeader from '@/components/ui/PageHeader';
import StatCard from '@/components/ui/StatCard';

type CopyState = 'idle' | 'copied' | 'failed';

export const InvitePage = () => {
  const { t } = useLanguage();
  const [summary, setSummary] = useState<ReferralSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [copyState, setCopyState] = useState<CopyState>('idle');
  const linkRef = useRef<HTMLInputElement>(null);
  const resetTimer = useRef<number>();

  const canNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await referralApi.getMe();
      setSummary(res.data);
    } catch (err) {
      console.error('Failed to load referral summary:', err);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    return () => window.clearTimeout(resetTimer.current);
  }, [load]);

  const shareText = summary ? t('referral.shareText', { code: summary.code }) : '';

  const handleCopy = async () => {
    if (!summary) return;
    window.clearTimeout(resetTimer.current);
    try {
      await navigator.clipboard.writeText(summary.shareUrl);
      setCopyState('copied');
    } catch {
      // Clipboard API refused (insecure context, permissions): leave the link
      // selected so a manual copy is one keystroke away.
      linkRef.current?.select();
      setCopyState('failed');
    }
    resetTimer.current = window.setTimeout(() => setCopyState('idle'), 4000);
  };

  const handleNativeShare = async () => {
    if (!summary || !canNativeShare) return;
    try {
      await navigator.share({ title: t('referral.shareTitle'), text: shareText, url: summary.shareUrl });
    } catch {
      /* dismissed by the user — nothing to do */
    }
  };

  const whatsappHref = summary
    ? `https://wa.me/?text=${encodeURIComponent(`${shareText} ${summary.shareUrl}`)}`
    : '#';

  return (
    <div className="mx-auto max-w-4xl p-4 md:p-8">
      <PageHeader title={t('referral.title')} subtitle={t('referral.subtitle')} icon={<Gift size={24} />} />

      {loading && (
        <div role="status" aria-live="polite" className="flex items-center gap-3 rounded-3xl bg-white p-8 text-sm text-slate-500 shadow-sm ring-1 ring-slate-100">
          <div className="h-6 w-6 animate-spin rounded-full border-4 border-emerald-200 border-t-emerald-600" aria-hidden="true" />
          {t('referral.loading')}
        </div>
      )}

      {!loading && error && (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          <AlertCircle size={16} className="shrink-0" aria-hidden="true" />
          <span className="flex-1">{t('referral.loadFailed')}</span>
          <button
            onClick={load}
            className="rounded-full bg-white px-3 py-1.5 font-semibold text-rose-700 ring-1 ring-rose-200 transition hover:bg-rose-100"
          >
            {t('referral.retry')}
          </button>
        </div>
      )}

      {!loading && summary && (
        <div className="space-y-6">
          <section
            aria-labelledby="invite-share-heading"
            className="rounded-3xl bg-gradient-to-br from-emerald-700 to-teal-700 p-6 text-white shadow-md md:p-8"
          >
            <h2 id="invite-share-heading" className="text-sm font-medium text-emerald-50">
              {t('referral.yourCode')}
            </h2>
            <p className="num mt-1 font-mono text-4xl font-extrabold tracking-widest">{summary.code}</p>
            <p className="mt-3 text-sm text-emerald-50">
              {t('referral.rewardExplainer', {
                days: summary.rewards.perReferral,
                max: summary.rewards.maxRewardedReferrals,
              })}
            </p>

            <label htmlFor="invite-link" className="mt-6 block text-sm font-medium text-emerald-50">
              {t('referral.yourLink')}
            </label>
            <div className="mt-1.5 flex flex-col gap-2 sm:flex-row">
              <input
                id="invite-link"
                ref={linkRef}
                type="text"
                readOnly
                dir="ltr"
                value={summary.shareUrl}
                onFocus={(e) => e.currentTarget.select()}
                className="min-w-0 flex-1 rounded-xl border border-white/30 bg-white/15 px-4 py-2.5 text-start text-sm text-white outline-none placeholder:text-emerald-100 focus:bg-white/25"
              />
              <button
                onClick={handleCopy}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-emerald-700 shadow-sm transition hover:bg-emerald-50"
              >
                {copyState === 'copied' ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
                {t('referral.copyLink')}
              </button>
            </div>
            <p role="status" aria-live="polite" className="mt-2 min-h-[1.25rem] text-sm font-medium text-emerald-50">
              {copyState === 'copied' && t('referral.copied')}
              {copyState === 'failed' && t('referral.copyFailed')}
            </p>

            <div className="mt-4 flex flex-wrap gap-3">
              <a
                href={whatsappHref}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-xl bg-[#25D366] px-4 py-2.5 text-sm font-semibold text-slate-900 shadow-sm transition hover:brightness-95"
              >
                <MessageCircle size={16} aria-hidden="true" />
                {t('referral.shareWhatsApp')}
              </a>
              {canNativeShare && (
                <button
                  onClick={handleNativeShare}
                  className="inline-flex items-center gap-2 rounded-xl bg-white/15 px-4 py-2.5 text-sm font-semibold text-white ring-1 ring-white/30 transition hover:bg-white/25"
                >
                  <Share2 size={16} aria-hidden="true" />
                  {t('referral.shareMore')}
                </button>
              )}
            </div>
          </section>

          <section aria-labelledby="invite-stats-heading">
            <h2 id="invite-stats-heading" className="mb-3 text-lg font-bold text-slate-900">
              {t('referral.stats')}
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <StatCard label={t('referral.invited')} value={summary.invitedCount} icon={<Users size={18} />} color="emerald" />
              <StatCard label={t('referral.converted')} value={summary.convertedCount} icon={<BadgeCheck size={18} />} color="sky" />
              <StatCard
                label={t('referral.daysEarned')}
                value={summary.rewards.earnedPremiumDays}
                unit={t('referral.days')}
                icon={<CalendarPlus size={18} />}
                color="violet"
              />
            </div>
          </section>
        </div>
      )}
    </div>
  );
};

export default InvitePage;
