import { ReactNode, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, CalendarCheck, ChefHat, ClipboardList, MessageCircle, ShoppingCart, Sparkles } from 'lucide-react';
import { PublicLayout } from '@/components/layout/PublicLayout';
import { Num } from '@/components/ui/Num';
import { useLanguage } from '@/i18n/LanguageContext';
import { purchaseApi, Plan, Product, Session } from '@/services/api';

// The same test the server applies (utils/phone.js), loosely: it only saves a
// round trip for an obvious typo. The server's answer is the one that counts.
export const looksLikeIsraeliMobile = (value: string) =>
  /^(\+?972|0)?5\d{8}$/.test(value.replace(/[\s-]/g, ''));

export const inputClass =
  'w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-100';

/** Something the checkout can sell directly: a monthly plan or a one-time product. */
interface Buyable {
  id: string;
  amount: number;
  nameKey: string;
}

const Price = ({ amount, suffix }: { amount: number; suffix: string }) => (
  <div className="flex items-baseline gap-1.5">
    <span className="text-3xl font-extrabold text-slate-900">
      <Num>₪{amount}</Num>
    </span>
    <span className="text-sm text-slate-500">{suffix}</span>
  </div>
);

const CheckoutForm = ({ item, onCancel }: { item: Buyable; onCancel: () => void }) => {
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
      const { data } = await purchaseApi.checkout({ plan: item.id, name, email, phone });
      // PayPlus's own page (or, in the demo, the stand-in). Nothing about the
      // card passes through this app.
      window.location.href = data.paymentPageLink;
    } catch (err: any) {
      setBusy(false);
      const status = err.response?.status;
      setError(status === 400 ? t('pricing.invalid') : status === 503 ? t('pricing.unavailable') : t('common.error'));
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4 rounded-3xl bg-white p-6 shadow-xl ring-1 ring-slate-100 md:p-8">
      <h2 className="text-lg font-bold text-slate-900">{t('pricing.checkoutTitle', { plan: t(item.nameKey) })}</h2>
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
        <input id="co-phone" type="tel" inputMode="tel" autoComplete="tel" dir="ltr" placeholder="050-1234567" value={phone} onChange={(e) => setPhone(e.target.value)} className={inputClass} required aria-describedby="co-phone-hint" />
        <p id="co-phone-hint" className="mt-1.5 text-xs text-slate-500">{t('pricing.phoneHint')}</p>
      </div>

      {error && (
        <div role="alert" className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          <AlertCircle size={16} className="shrink-0" aria-hidden="true" />
          {error}
        </div>
      )}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="button" onClick={onCancel} className="rounded-xl px-5 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-100">
          {t('common.cancel')}
        </button>
        <button type="submit" disabled={busy} className="rounded-xl bg-emerald-600 px-6 py-3 font-semibold text-white shadow-md shadow-emerald-200 transition hover:bg-emerald-700 disabled:opacity-60">
          {busy ? t('pricing.redirecting') : <>{t('pricing.toPayment')} · <Num>₪{item.amount}</Num></>}
        </button>
      </div>
      <p className="text-center text-xs text-slate-500">{t('pricing.securePayment')}</p>
    </form>
  );
};

/** One product card. `who` says which person or bot you get — the product *is* them. */
const Card = ({
  icon,
  tone,
  who,
  name,
  desc,
  price,
  cta,
  featured = false,
}: {
  icon: ReactNode;
  tone: string;
  who: string;
  name: string;
  desc: string;
  price: ReactNode;
  cta: ReactNode;
  featured?: boolean;
}) => {
  const { t } = useLanguage();
  return (
    <article
      className={`relative flex flex-col rounded-3xl bg-white p-6 shadow-sm ring-1 ${
        featured ? 'ring-2 ring-emerald-500 shadow-lg shadow-emerald-100' : 'ring-slate-100'
      }`}
    >
      {featured && (
        <span className="absolute -top-3 start-6 inline-flex items-center gap-1 rounded-full bg-emerald-600 px-3 py-1 text-xs font-semibold text-white">
          <Sparkles size={12} aria-hidden="true" /> {t('pricing.recommended')}
        </span>
      )}
      <div className="flex items-center gap-3">
        <span className={`flex h-11 w-11 items-center justify-center rounded-2xl ${tone}`}>{icon}</span>
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{who}</span>
      </div>
      <h2 className="mt-4 text-lg font-bold text-slate-900">{name}</h2>
      <p className="mt-2 flex-1 text-sm leading-relaxed text-slate-600">{desc}</p>
      <div className="mt-5">{price}</div>
      <div className="mt-5">{cta}</div>
    </article>
  );
};

export const PricingPage = () => {
  const { t } = useLanguage();
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [failed, setFailed] = useState(false);
  const [chosen, setChosen] = useState<Buyable | null>(null);

  useEffect(() => {
    purchaseApi
      .plans()
      .then(({ data }) => {
        setPlans(data.plans);
        setProducts(data.products || []);
        setSessions(data.sessions);
      })
      .catch(() => setFailed(true));
  }, []);

  // Prices come from the server — the same numbers the checkout charges — so
  // this page cannot advertise a price the payment would not take. Anything
  // the server does not price is simply not shown.
  const menu = products.find((p) => p.id === 'menu');
  const ordered = [...(plans || [])].sort((a, b) => a.amount - b.amount);
  const supermarket = sessions.find((s) => s.id === 'supermarket');

  const buyButton = (item: Buyable, featured: boolean) => (
    <button
      onClick={() => setChosen(item)}
      className={`w-full rounded-xl py-3 font-semibold transition ${
        featured ? 'bg-emerald-600 text-white shadow-md shadow-emerald-200 hover:bg-emerald-700' : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
      }`}
    >
      {t('pricing.choose')}
    </button>
  );

  return (
    <PublicLayout>
      <div className="mb-10 text-center">
        <h1 className="text-3xl font-extrabold text-slate-900 md:text-4xl">{t('pricing.title')}</h1>
        <p className="mx-auto mt-3 max-w-xl text-slate-600">{t('pricing.subtitle')}</p>
      </div>

      {chosen ? (
        <div className="mx-auto max-w-md">
          <CheckoutForm item={chosen} onCancel={() => setChosen(null)} />
        </div>
      ) : (
        <>
          {failed && <p className="text-center text-slate-500">{t('pricing.noPlans')}</p>}
          {!plans && !failed && <p role="status" className="text-center text-slate-500">{t('common.loading')}</p>}

          <div className="grid gap-5 sm:grid-cols-2">
            {menu && (
              <Card
                icon={<ClipboardList size={22} aria-hidden="true" />}
                tone="bg-violet-50 text-violet-700"
                who={t('pricing.who.yael')}
                name={t('pricing.product.menu.name')}
                desc={t('pricing.product.menu.desc')}
                price={<Price amount={menu.amount} suffix={t('pricing.once')} />}
                cta={buyButton({ id: 'menu', amount: menu.amount, nameKey: 'pricing.product.menu.name' }, false)}
              />
            )}

            {ordered.map((plan) => {
              const withYoni = plan.includes.includes('yoni');
              return (
                <Card
                  key={plan.id}
                  icon={withYoni ? <ChefHat size={22} aria-hidden="true" /> : <MessageCircle size={22} aria-hidden="true" />}
                  tone={withYoni ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}
                  who={withYoni ? t('pricing.who.adiYoni') : t('pricing.who.adi')}
                  name={t(`pricing.plan.${plan.id}.name`)}
                  desc={t(`pricing.plan.${plan.id}.desc`)}
                  price={<Price amount={plan.amount} suffix={t('pricing.perMonth')} />}
                  cta={buyButton({ id: plan.id, amount: plan.amount, nameKey: `pricing.plan.${plan.id}.name` }, withYoni)}
                  featured={withYoni}
                />
              );
            })}

            {supermarket && (
              <Card
                icon={<ShoppingCart size={22} aria-hidden="true" />}
                tone="bg-rose-50 text-rose-700"
                who={t('pricing.who.yael')}
                name={t('pricing.session.supermarket.name')}
                desc={t('pricing.session.supermarket.desc')}
                price={<Price amount={supermarket.amount} suffix={t('pricing.once')} />}
                cta={
                  // A session needs a time before it can be paid for, so it
                  // goes through booking rather than straight to checkout.
                  <Link
                    to="/book?type=supermarket"
                    className="block w-full rounded-xl bg-rose-50 py-3 text-center font-semibold text-rose-800 transition hover:bg-rose-100"
                  >
                    {t('pricing.bookSession')}
                  </Link>
                }
              />
            )}
          </div>

          <div className="mt-10 flex flex-col items-center gap-4 rounded-3xl bg-white/70 p-6 text-center ring-1 ring-slate-100 md:flex-row md:text-start">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-sky-50 text-sky-700">
              <CalendarCheck size={24} aria-hidden="true" />
            </div>
            <div className="flex-1">
              <h2 className="font-bold text-slate-900">{t('pricing.freeDiagnosis.title')}</h2>
              <p className="mt-1 text-sm text-slate-600">{t('pricing.freeDiagnosis.desc')}</p>
            </div>
            <Link to="/book" className="rounded-xl bg-sky-700 px-5 py-3 font-semibold text-white transition hover:bg-sky-800">
              {t('pricing.freeDiagnosis.cta')}
            </Link>
          </div>
        </>
      )}
    </PublicLayout>
  );
};
