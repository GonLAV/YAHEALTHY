import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, CalendarCheck, ChefHat, Check, ShoppingCart, Sparkles } from 'lucide-react';
import { PublicLayout } from '@/components/layout/PublicLayout';
import { Num } from '@/components/ui/Num';
import { useLanguage } from '@/i18n/LanguageContext';
import { purchaseApi, Plan, Session } from '@/services/api';

// The same test the server applies (utils/phone.js), loosely: it only saves a
// round trip for an obvious typo. The server's answer is the one that counts.
export const looksLikeIsraeliMobile = (value: string) =>
  /^(\+?972|0)?5\d{8}$/.test(value.replace(/[\s-]/g, ''));

export const inputClass =
  'w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-100';

const Price = ({ amount, suffix }: { amount: number; suffix: string }) => (
  <div className="flex items-baseline gap-1.5">
    <span className="text-3xl font-extrabold text-slate-900">
      <Num>₪{amount}</Num>
    </span>
    <span className="text-sm text-slate-500">{suffix}</span>
  </div>
);

const CheckoutForm = ({ plan, onCancel }: { plan: Plan; onCancel: () => void }) => {
  const { t } = useLanguage();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!looksLikeIsraeliMobile(phone)) {
      setError(t('form.invalidPhone'));
      return;
    }
    setBusy(true);
    try {
      const { data } = await purchaseApi.checkout({ plan: plan.id, name, email, phone });
      // PayPlus's own page. Nothing about the card passes through this app.
      window.location.href = data.paymentPageLink;
    } catch (err: any) {
      setBusy(false);
      const status = err.response?.status;
      setError(status === 400 ? t('pricing.invalid') : status === 503 ? t('pricing.unavailable') : t('common.error'));
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4 rounded-3xl bg-white p-6 shadow-xl ring-1 ring-slate-100 md:p-8">
      <h2 className="text-lg font-bold text-slate-900">
        {t('pricing.checkoutTitle', { plan: t(`pricing.plan.${plan.id}.name`) })}
      </h2>
      <div>
        <label htmlFor="co-name" className="mb-1.5 block text-sm font-medium text-slate-700">{t('form.name')}</label>
        <input id="co-name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} required />
      </div>
      <div>
        <label htmlFor="co-email" className="mb-1.5 block text-sm font-medium text-slate-700">{t('form.email')}</label>
        <input id="co-email" type="email" autoComplete="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} required />
      </div>
      <div>
        <label htmlFor="co-phone" className="mb-1.5 block text-sm font-medium text-slate-700">{t('form.phone')}</label>
        <input id="co-phone" type="tel" autoComplete="tel" dir="ltr" placeholder="050-1234567" value={phone} onChange={(e) => setPhone(e.target.value)} className={inputClass} required />
        <p className="mt-1.5 text-xs text-slate-500">{t('pricing.phoneHint')}</p>
      </div>

      {error && (
        <div role="alert" className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          <AlertCircle size={16} className="shrink-0" />
          {error}
        </div>
      )}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="button" onClick={onCancel} className="rounded-xl px-5 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-100">
          {t('common.cancel')}
        </button>
        <button type="submit" disabled={busy} className="rounded-xl bg-emerald-600 px-6 py-3 font-semibold text-white shadow-md shadow-emerald-200 transition hover:bg-emerald-700 disabled:opacity-60">
          {busy ? t('pricing.redirecting') : t('pricing.toPayment')}
        </button>
      </div>
      <p className="text-center text-xs text-slate-400">{t('pricing.securePayment')}</p>
    </form>
  );
};

export const PricingPage = () => {
  const { t } = useLanguage();
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [failed, setFailed] = useState(false);
  const [chosen, setChosen] = useState<Plan | null>(null);

  useEffect(() => {
    purchaseApi
      .plans()
      .then(({ data }) => {
        setPlans(data.plans);
        setSessions(data.sessions);
      })
      .catch(() => setFailed(true));
  }, []);

  // Prices come from the server — the same numbers the checkout charges — so
  // this page cannot advertise a price the payment would not take.
  const ordered = [...(plans || [])].sort((a, b) => a.amount - b.amount);
  const supermarket = sessions.find((s) => s.id === 'supermarket');

  return (
    <PublicLayout>
      <div className="mb-10 text-center">
        <h1 className="text-3xl font-extrabold text-slate-900 md:text-4xl">{t('pricing.title')}</h1>
        <p className="mx-auto mt-3 max-w-xl text-slate-600">{t('pricing.subtitle')}</p>
      </div>

      {chosen ? (
        <div className="mx-auto max-w-md">
          <CheckoutForm plan={chosen} onCancel={() => setChosen(null)} />
        </div>
      ) : (
        <>
          {failed && <p className="text-center text-slate-500">{t('pricing.noPlans')}</p>}
          {!plans && !failed && <p className="text-center text-slate-500">{t('common.loading')}</p>}

          <div className="grid gap-5 md:grid-cols-3">
            {ordered.map((plan) => {
              const featured = plan.includes.includes('yoni');
              return (
                <div
                  key={plan.id}
                  className={`relative flex flex-col rounded-3xl bg-white p-6 shadow-sm ring-1 ${
                    featured ? 'ring-2 ring-emerald-500 shadow-lg shadow-emerald-100' : 'ring-slate-100'
                  }`}
                >
                  {featured && (
                    <span className="absolute -top-3 start-6 inline-flex items-center gap-1 rounded-full bg-emerald-600 px-3 py-1 text-xs font-semibold text-white">
                      <Sparkles size={12} /> {t('pricing.recommended')}
                    </span>
                  )}
                  <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
                    {featured ? <ChefHat size={22} /> : <Check size={22} />}
                  </div>
                  <h2 className="text-lg font-bold text-slate-900">{t(`pricing.plan.${plan.id}.name`)}</h2>
                  <p className="mt-2 flex-1 text-sm text-slate-600">{t(`pricing.plan.${plan.id}.desc`)}</p>
                  <div className="mt-5">
                    <Price amount={plan.amount} suffix={t('pricing.perMonth')} />
                  </div>
                  <button
                    onClick={() => setChosen(plan)}
                    className={`mt-5 rounded-xl py-3 font-semibold transition ${
                      featured
                        ? 'bg-emerald-600 text-white shadow-md shadow-emerald-200 hover:bg-emerald-700'
                        : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                    }`}
                  >
                    {t('pricing.choose')}
                  </button>
                </div>
              );
            })}

            {supermarket && (
              <div className="flex flex-col rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-100">
                <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-50 text-amber-700">
                  <ShoppingCart size={22} />
                </div>
                <h2 className="text-lg font-bold text-slate-900">{t('pricing.session.supermarket.name')}</h2>
                <p className="mt-2 flex-1 text-sm text-slate-600">{t('pricing.session.supermarket.desc')}</p>
                <div className="mt-5">
                  <Price amount={supermarket.amount} suffix={t('pricing.once')} />
                </div>
                {/* A session needs a time before it can be paid for, so it
                    goes through booking rather than straight to checkout. */}
                <Link
                  to="/book?type=supermarket"
                  className="mt-5 rounded-xl bg-amber-50 py-3 text-center font-semibold text-amber-800 transition hover:bg-amber-100"
                >
                  {t('pricing.bookSession')}
                </Link>
              </div>
            )}
          </div>

          <div className="mt-10 flex flex-col items-center gap-4 rounded-3xl bg-white/70 p-6 text-center ring-1 ring-slate-100 md:flex-row md:text-start">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-sky-50 text-sky-700">
              <CalendarCheck size={24} />
            </div>
            <div className="flex-1">
              <h2 className="font-bold text-slate-900">{t('pricing.freeDiagnosis.title')}</h2>
              <p className="mt-1 text-sm text-slate-600">{t('pricing.freeDiagnosis.desc')}</p>
            </div>
            <Link to="/book" className="rounded-xl bg-sky-600 px-5 py-3 font-semibold text-white transition hover:bg-sky-700">
              {t('pricing.freeDiagnosis.cta')}
            </Link>
          </div>
        </>
      )}
    </PublicLayout>
  );
};
