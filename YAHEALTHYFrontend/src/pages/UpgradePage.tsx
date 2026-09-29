import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AlertCircle, Check, Crown, MessageCircle, ShieldCheck } from 'lucide-react';
import {
  entitlementsApi,
  marketingApi,
  paymentsApi,
  type EntitlementsSummary,
  type MarketingPlan,
  type OwnedPlan,
  type PaymentStatus,
} from '@/services/api';
import { useLanguage } from '@/i18n/LanguageContext';
import PageHeader from '@/components/ui/PageHeader';
import { WHATSAPP_NUMBER } from '@/components/WhatsAppWidget';
import {
  entitlementLabelKey,
  formatEndDate,
  formatPlanPrice,
  orderPlans,
  periodKey,
  planCta,
  planName,
  resolvePlanId,
} from '@/utils/plans';

interface Loaded {
  plans: MarketingPlan[];
  status: PaymentStatus;
  entitlements: EntitlementsSummary | null;
  owned: OwnedPlan[];
}

/**
 * /upgrade — the plans, what the person already has, and how to get more.
 *
 * Charging is off until the owner turns it on (CHECKOUT_ENABLED +
 * CANCELLATION_POLICY_URL on the server). Until then every plan offers
 * "Talk to us" on WhatsApp instead of a Pay button.
 */
export const UpgradePage = () => {
  const { t, lang } = useLanguage();
  const [params] = useSearchParams();
  const [data, setData] = useState<Loaded | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [phone, setPhone] = useState('');
  const [installments, setInstallments] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [checkoutError, setCheckoutError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const [plans, status, ent, owned] = await Promise.all([
        marketingApi.getPlans(),
        paymentsApi.status(),
        entitlementsApi.getMe().catch(() => null),
        paymentsApi.myPlans().catch(() => null),
      ]);
      setData({
        plans: plans.data.plans,
        status: status.data,
        entitlements: ent ? ent.data : null,
        owned: owned ? owned.data.plans : [],
      });
    } catch (err) {
      console.error('Failed to load plans:', err);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const requested = params.get('plan');
  const plans = useMemo(() => (data ? orderPlans(data.plans, requested) : []), [data, requested]);
  const checkoutEnabled = Boolean(data?.status.checkoutEnabled);
  const selectedPlan = plans.find((p) => p.id === selected) ?? null;

  const whatsappHref = (plan?: MarketingPlan) => {
    const text = plan ? `${t('upgrade.talkToUsBody')} — ${planName(plan, lang)}` : t('upgrade.talkToUsBody');
    return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`;
  };

  const handlePay = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedPlan) return;
    setSubmitting(true);
    setCheckoutError(false);
    try {
      const res = await paymentsApi.checkout({
        plan: selectedPlan.id,
        phone,
        ...(installments > 1 ? { installments } : {}),
      });
      window.location.assign(res.data.paymentPageLink);
    } catch (err) {
      console.error('Checkout failed:', err);
      setCheckoutError(true);
      setSubmitting(false);
    }
  };

  const premiumUntil = formatEndDate(data?.entitlements?.premiumUntil, lang);
  const primaryBtn =
    'inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-800 disabled:opacity-60';
  const whatsappBtn =
    'inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#25D366] px-4 py-2.5 text-sm font-semibold text-slate-900 shadow-sm transition hover:brightness-95';

  return (
    <div className="mx-auto max-w-5xl p-4 md:p-8">
      <PageHeader title={t('upgrade.title')} subtitle={t('upgrade.subtitle')} icon={<Crown size={24} />} />

      {loading && (
        <div role="status" aria-live="polite" className="flex items-center gap-3 rounded-3xl bg-white p-8 text-sm text-slate-600 shadow-sm ring-1 ring-slate-100">
          <div className="h-6 w-6 animate-spin rounded-full border-4 border-emerald-200 border-t-emerald-600" aria-hidden="true" />
          {t('upgrade.loading')}
        </div>
      )}

      {!loading && error && (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          <AlertCircle size={16} className="shrink-0" aria-hidden="true" />
          <span className="flex-1">{t('upgrade.loadFailed')}</span>
          <button onClick={load} className="rounded-full bg-white px-3 py-1.5 font-semibold text-rose-700 ring-1 ring-rose-200 transition hover:bg-rose-100">
            {t('upgrade.retry')}
          </button>
        </div>
      )}

      {!loading && data && (
        <div className="space-y-6">
          <section aria-labelledby="upgrade-current-heading" className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-100 md:p-6">
            <h2 id="upgrade-current-heading" className="text-lg font-bold text-slate-900">
              {t('upgrade.yourPlan')}
            </h2>
            {data.owned.length === 0 && !premiumUntil && <p className="mt-1 text-sm text-slate-600">{t('upgrade.freePlan')}</p>}
            {(data.owned.length > 0 || premiumUntil) && (
              <ul className="mt-2 space-y-1 text-sm text-slate-700">
                {data.owned.map((o) => {
                  const end = formatEndDate(o.endsAt, lang);
                  return (
                    <li key={`${o.plan}-${o.startedAt}`} className="flex flex-wrap items-center gap-2">
                      <Check size={16} className="text-emerald-700" aria-hidden="true" />
                      <span className="font-semibold">{o.name ? o.name[lang] : o.plan}</span>
                      <span className="text-slate-600">{end ? t('upgrade.until', { date: end }) : t('upgrade.noEnd')}</span>
                    </li>
                  );
                })}
                {premiumUntil && (
                  <li className="flex flex-wrap items-center gap-2">
                    <Check size={16} className="text-emerald-700" aria-hidden="true" />
                    <span>{t('upgrade.referralPremium', { date: premiumUntil })}</span>
                  </li>
                )}
              </ul>
            )}
          </section>

          {!checkoutEnabled && (
            <section
              aria-labelledby="upgrade-talk-heading"
              data-testid="upgrade-talk-to-us"
              className="rounded-3xl border border-emerald-200 bg-emerald-50 p-5 md:p-6"
            >
              <h2 id="upgrade-talk-heading" className="text-lg font-bold text-emerald-900">
                {t('upgrade.talkToUsTitle')}
              </h2>
              <p className="mt-1 text-sm text-emerald-900">{t('upgrade.talkToUsBody')}</p>
              <a href={whatsappHref()} target="_blank" rel="noopener noreferrer" className={`${whatsappBtn} mt-4 sm:w-auto`}>
                <MessageCircle size={16} aria-hidden="true" />
                {t('upgrade.talkWhatsApp')}
              </a>
            </section>
          )}

          <section aria-labelledby="upgrade-plans-heading">
            <h2 id="upgrade-plans-heading" className="mb-3 text-lg font-bold text-slate-900">
              {t('upgrade.allPlans')}
            </h2>
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {plans.map((plan) => {
                const price = formatPlanPrice(plan, lang);
                const pk = periodKey(plan);
                const cta = planCta(plan, checkoutEnabled);
                const highlighted = requested ? resolvePlanId(requested) === plan.id : Boolean(plan.featured);
                return (
                  <li
                    key={plan.id}
                    className={`flex flex-col rounded-3xl bg-white p-5 shadow-sm ring-1 ${highlighted ? 'ring-2 ring-emerald-600' : 'ring-slate-100'}`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-base font-bold text-slate-900">{planName(plan, lang)}</h3>
                      {plan.featured && (
                        <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
                          {t('upgrade.featured')}
                        </span>
                      )}
                    </div>
                    <p className="mt-2 text-xl font-extrabold text-slate-900">
                      {price ? (
                        <>
                          <span className="num">{price}</span>{' '}
                          {pk && <span className="text-sm font-medium text-slate-600">{t(pk)}</span>}
                        </>
                      ) : (
                        <span className="text-base font-semibold text-slate-700">{t('plans.onRequest')}</span>
                      )}
                    </p>
                    <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-600">{t('upgrade.includes')}</p>
                    <ul className="mt-1 flex-1 space-y-1 text-sm text-slate-700">
                      {plan.includes.map((k) => (
                        <li key={k} className="flex items-start gap-2">
                          <Check size={16} className="mt-0.5 shrink-0 text-emerald-700" aria-hidden="true" />
                          {t(entitlementLabelKey(k))}
                        </li>
                      ))}
                    </ul>
                    <div className="mt-4">
                      {cta === 'pay' ? (
                        <button
                          type="button"
                          onClick={() => {
                            setSelected(plan.id);
                            setCheckoutError(false);
                          }}
                          aria-pressed={selected === plan.id}
                          className={primaryBtn}
                        >
                          {t('upgrade.choose', { plan: planName(plan, lang) })}
                        </button>
                      ) : (
                        <a href={whatsappHref(plan)} target="_blank" rel="noopener noreferrer" className={whatsappBtn}>
                          <MessageCircle size={16} aria-hidden="true" />
                          {t('upgrade.talkWhatsApp')}
                          <span className="sr-only"> — {planName(plan, lang)}</span>
                        </a>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>

          {checkoutEnabled && selectedPlan && (
            <section aria-labelledby="upgrade-pay-heading" className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-100 md:p-6">
              <h2 id="upgrade-pay-heading" className="text-lg font-bold text-slate-900">
                {planName(selectedPlan, lang)}
              </h2>
              <form onSubmit={handlePay} className="mt-3 max-w-md space-y-4">
                <div>
                  <label htmlFor="upgrade-phone" className="block text-sm font-medium text-slate-800">
                    {t('upgrade.phoneLabel')}
                  </label>
                  <input
                    id="upgrade-phone"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    dir="ltr"
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    aria-describedby="upgrade-phone-help"
                    className="mt-1 w-full rounded-xl border border-slate-300 px-4 py-2.5 text-start text-sm"
                  />
                  <p id="upgrade-phone-help" className="mt-1 text-xs text-slate-600">
                    {t('upgrade.phoneHelp')}
                  </p>
                </div>
                {data.status.installments && (
                  <div>
                    <label htmlFor="upgrade-installments" className="block text-sm font-medium text-slate-800">
                      {t('upgrade.installments')}
                    </label>
                    <select
                      id="upgrade-installments"
                      value={installments}
                      onChange={(e) => setInstallments(Number(e.target.value))}
                      className="mt-1 rounded-xl border border-slate-300 px-3 py-2 text-sm"
                    >
                      {Array.from({ length: data.status.installments }, (_, i) => i + 1).map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                {data.status.cancellationPolicyUrl && (
                  <p className="text-sm">
                    <a
                      href={data.status.cancellationPolicyUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-semibold text-emerald-800 underline"
                    >
                      {t('upgrade.cancellationPolicy')}
                    </a>
                  </p>
                )}
                {checkoutError && (
                  <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">
                    {t('upgrade.checkoutFailed')}
                  </p>
                )}
                <div className="flex flex-col gap-2 sm:flex-row">
                  <button type="submit" disabled={submitting} className={`${primaryBtn} sm:w-auto`}>
                    <ShieldCheck size={16} aria-hidden="true" />
                    {t('upgrade.pay')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelected(null)}
                    className="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"
                  >
                    {t('upgrade.close')}
                  </button>
                </div>
                <p role="status" aria-live="polite" className="min-h-[1.25rem] text-sm text-slate-600">
                  {submitting ? t('upgrade.redirecting') : ''}
                </p>
              </form>
            </section>
          )}

          <p className="flex items-start gap-2 text-xs text-slate-600">
            <ShieldCheck size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
            {t('upgrade.securePayment')}
          </p>
        </div>
      )}
    </div>
  );
};

export default UpgradePage;
