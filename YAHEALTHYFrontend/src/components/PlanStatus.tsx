import { useEffect, useState } from 'react';
import { ShieldCheck, Clock } from 'lucide-react';
import { paymentsApi, ActivePlan } from '@/services/api';
import { useLanguage } from '@/i18n/LanguageContext';

/**
 * The plan this person is actually on, and when it ends.
 *
 * /api/payments/my-plans has existed since the paywall shipped and nothing in
 * the app called it, so somebody's own subscription was visible to the billing
 * provider and to the database and not to them.
 *
 * It is worth showing for its own sake, and worth showing because of what sat
 * behind it. getActiveSubscriptions tested status and never read ends_at, so a
 * plan that had ended went on granting access indefinitely; once that was
 * fixed, a renewal after expiry returned nothing and the payment callback
 * logged an activation that had not happened. Both failures are silent from
 * the outside. A person who can see their own plan and its end date is the
 * cheapest detector either one will ever have.
 *
 * Deliberately quiet: a line, not a banner. Nobody opens a nutrition app to
 * think about billing.
 */

const DAY = 86400000;

export const PlanStatus = () => {
  const { t, lang } = useLanguage();
  const [plans, setPlans] = useState<ActivePlan[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    paymentsApi
      .getMyPlans()
      .then((res) => { if (!cancelled) setPlans(res.data.plans ?? []); })
      .catch(() => { if (!cancelled) setPlans([]); });
    return () => { cancelled = true; };
  }, []);

  if (!plans || plans.length === 0) return null;

  const locale = lang === 'he' ? 'he-IL' : 'en-US';

  // The soonest end date across active plans, when there is one at all.
  const ending = plans
    .filter((p) => p.endsAt)
    .sort((a, b) => String(a.endsAt).localeCompare(String(b.endsAt)))[0];

  const daysLeft = ending
    ? Math.ceil((new Date(ending.endsAt as string).getTime() - Date.now()) / DAY)
    : null;

  // Only speak up when it is close. An end date three months out is not news.
  const endingSoon = daysLeft != null && daysLeft <= 14;

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl bg-white px-5 py-3.5 shadow-sm ring-1 ring-slate-100">
      <span className="flex items-center gap-2 text-sm font-medium text-slate-700">
        <ShieldCheck size={17} className="text-emerald-600" />
        {plans.map((p) => t(`plan.${p.plan}`)).join(' · ')}
      </span>

      {endingSoon && (
        <span className="flex items-center gap-1.5 text-xs font-medium text-amber-700">
          <Clock size={14} />
          {/* .num around the count only. */}
          {t('plan.endsIn', { n: daysLeft as number })}
        </span>
      )}

      {ending && !endingSoon && (
        <span className="text-xs text-slate-400">
          {t('plan.until')}{' '}
          <span className="num">
            {new Date(ending.endsAt as string).toLocaleDateString(locale, {
              day: 'numeric', month: 'short', year: 'numeric',
            })}
          </span>
        </span>
      )}
    </div>
  );
};

export default PlanStatus;
