import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft, ArrowRight, CalendarCheck, ChefHat, ClipboardList, MessageCircle, ShieldCheck, ShoppingCart, Sparkles,
} from 'lucide-react';
import { PublicLayout } from '@/components/layout/PublicLayout';
import { Num } from '@/components/ui/Num';
import { WHATSAPP_URL } from '@/components/WhatsAppWidget';
import { useDocumentTitle, useLanguage } from '@/i18n/LanguageContext';
import { purchaseApi, Plan } from '@/services/api';

/**
 * The front door: what a visitor sees before they have an account.
 *
 * Every claim on this page is something the product actually does — the
 * calculators, the 45-recipe library, the health boundary that hands a person
 * the conversation — and prices come from the same PLANS the checkout charges.
 * No testimonials and no numbers that nobody measured: a health product that
 * invents its social proof has already told you how it treats the truth.
 */

const Section = ({ id, children, className = '' }: { id?: string; children: React.ReactNode; className?: string }) => (
  <section id={id} className={`px-4 py-16 md:py-24 ${className}`}>
    <div className="mx-auto max-w-6xl">{children}</div>
  </section>
);

/**
 * An illustration of how Yoni answers, taken from the shakshuka recipe in the
 * library (data/recipes.json) — the vessel, the heat and the cue are its own.
 * Labelled as an example, because it is one.
 */
const ChatExample = () => {
  const { t } = useLanguage();
  const bubbles: { from: 'user' | 'yoni'; key: string }[] = [
    { from: 'user', key: 'landing.chat.user' },
    { from: 'yoni', key: 'landing.chat.yoni1' },
    { from: 'yoni', key: 'landing.chat.yoni2' },
    { from: 'yoni', key: 'landing.chat.yoni3' },
  ];
  return (
    <figure className="relative mx-auto w-full max-w-sm">
      <div aria-hidden="true" className="absolute -inset-6 rounded-[3rem] bg-gradient-to-br from-emerald-200/60 via-teal-100/40 to-sky-200/50 blur-2xl" />
      <div className="relative overflow-hidden rounded-[2.25rem] border border-slate-200 bg-white shadow-2xl shadow-emerald-900/10">
        <div className="flex items-center gap-3 bg-emerald-700 px-5 py-4 text-white">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/15">
            <ChefHat size={20} />
          </div>
          <div>
            <p className="font-semibold leading-tight">{t('landing.chat.name')}</p>
            <p className="text-xs text-emerald-100">{t('landing.chat.status')}</p>
          </div>
        </div>
        {/* The customer's own messages sit at the end of the line, where
            WhatsApp puts outgoing messages, in either direction. */}
        <ol className="space-y-2.5 bg-[#efeae2] px-4 py-5">
          {bubbles.map((b) => (
            <li key={b.key} className={`flex ${b.from === 'user' ? 'justify-end' : 'justify-start'}`}>
              <p
                className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed shadow-sm ${
                  b.from === 'user' ? 'rounded-se-sm bg-[#d9fdd3] text-slate-900' : 'rounded-ss-sm bg-white text-slate-800'
                }`}
              >
                {t(b.key)}
              </p>
            </li>
          ))}
        </ol>
      </div>
      <figcaption className="relative mt-3 text-center text-xs text-slate-500">{t('landing.chat.caption')}</figcaption>
    </figure>
  );
};

// The order a customer usually meets them: a free diagnosis, Yael's menu,
// then Adi day to day (and Yael again, at the supermarket).
const STEPS = [
  { icon: <CalendarCheck size={22} />, key: 'landing.how.1' },
  { icon: <ClipboardList size={22} />, key: 'landing.how.2' },
  { icon: <MessageCircle size={22} />, key: 'landing.how.3' },
];

// What is sold, and who delivers it: Adi and Yoni on WhatsApp, Yael in person.
const FEATURES = [
  { icon: <MessageCircle size={22} />, key: 'landing.features.adi', tone: 'bg-emerald-50 text-emerald-700' },
  { icon: <ClipboardList size={22} />, key: 'landing.features.menu', tone: 'bg-violet-50 text-violet-700' },
  { icon: <ChefHat size={22} />, key: 'landing.features.yoni', tone: 'bg-amber-50 text-amber-700' },
  { icon: <ShoppingCart size={22} />, key: 'landing.features.supermarket', tone: 'bg-rose-50 text-rose-700' },
];

const PricingTeaser = () => {
  const { t } = useLanguage();
  const [plans, setPlans] = useState<Plan[] | null>(null);
  useEffect(() => {
    purchaseApi
      .plans()
      .then(({ data }) => setPlans([...data.plans].sort((a, b) => a.amount - b.amount)))
      .catch(() => setPlans([]));
  }, []);
  // Nothing to show is better than a price the checkout would not charge.
  if (!plans || plans.length === 0) return null;

  return (
    <Section id="pricing">
      <div className="mb-10 text-center">
        <h2 className="text-3xl font-extrabold tracking-tight text-slate-900 md:text-4xl">{t('landing.pricing.title')}</h2>
        <p className="mx-auto mt-3 max-w-xl text-slate-600">{t('landing.pricing.subtitle')}</p>
      </div>
      <div className="mx-auto grid max-w-3xl gap-4 sm:grid-cols-2">
        {plans.map((plan) => {
          const featured = plan.includes.includes('yoni');
          return (
            <Link
              key={plan.id}
              to="/pricing"
              className={`group rounded-3xl bg-white p-6 ring-1 transition hover:-translate-y-0.5 hover:shadow-lg ${
                featured ? 'ring-2 ring-emerald-500 shadow-md shadow-emerald-100' : 'ring-slate-200'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-bold text-slate-900">{t(`pricing.plan.${plan.id}.name`)}</h3>
                {featured && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-700 px-2.5 py-0.5 text-xs font-semibold text-white">
                    <Sparkles size={12} /> {t('pricing.recommended')}
                  </span>
                )}
              </div>
              <p className="mt-2 text-sm text-slate-600">{t(`pricing.plan.${plan.id}.desc`)}</p>
              <p className="mt-4 flex items-baseline gap-1.5">
                <span className="text-3xl font-extrabold text-slate-900"><Num>₪{plan.amount}</Num></span>
                <span className="text-sm text-slate-500">{t('pricing.perMonth')}</span>
              </p>
            </Link>
          );
        })}
      </div>
      <p className="mt-8 text-center">
        <Link to="/pricing" className="font-semibold text-emerald-700 hover:text-emerald-800">{t('landing.pricing.cta')}</Link>
      </p>
    </Section>
  );
};

export const LandingPage = () => {
  const { t, isRTL } = useLanguage();
  useDocumentTitle(t('title.landing'));
  const Arrow = isRTL ? ArrowLeft : ArrowRight;

  return (
    <PublicLayout bare>
      {/* ── hero ─────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden px-4 pb-16 pt-12 md:pb-24 md:pt-20">
        <div aria-hidden="true" className="pointer-events-none absolute -top-40 start-1/2 h-[36rem] w-[36rem] -translate-x-1/2 rounded-full bg-emerald-300/20 blur-3xl rtl:translate-x-1/2" />
        <div className="relative mx-auto grid max-w-6xl items-center gap-12 md:grid-cols-2">
          <div className="text-center md:text-start">
            <p className="inline-flex items-center gap-2 rounded-full bg-white/80 px-3.5 py-1.5 text-xs font-semibold text-emerald-800 ring-1 ring-emerald-200">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
              {t('landing.hero.eyebrow')}
            </p>
            <h1 className="mt-5 text-4xl font-extrabold leading-[1.1] tracking-tight text-slate-900 md:text-6xl">
              {t('landing.hero.title')}
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-slate-600 md:mx-0">{t('landing.hero.subtitle')}</p>
            <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center md:justify-start">
              <Link
                to="/book"
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-700 px-6 py-3.5 font-semibold text-white shadow-lg shadow-emerald-600/25 transition hover:bg-emerald-800 sm:w-auto"
              >
                {t('landing.hero.ctaPrimary')} <Arrow size={18} aria-hidden="true" />
              </Link>
              <Link
                to="/pricing"
                className="inline-flex w-full items-center justify-center rounded-2xl bg-white px-6 py-3.5 font-semibold text-slate-800 ring-1 ring-slate-200 transition hover:ring-emerald-300 sm:w-auto"
              >
                {t('landing.hero.ctaSecondary')}
              </Link>
            </div>
            <a href={WHATSAPP_URL} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-emerald-800">
              <MessageCircle size={16} aria-hidden="true" /> {t('landing.hero.whatsapp')}
            </a>
          </div>
          <ChatExample />
        </div>
      </section>

      {/* ── how it works ─────────────────────────────────────────────────── */}
      <Section className="bg-white">
        <h2 className="text-center text-3xl font-extrabold tracking-tight text-slate-900 md:text-4xl">{t('landing.how.title')}</h2>
        <ol className="mt-12 grid gap-6 md:grid-cols-3">
          {STEPS.map((step, i) => (
            <li key={step.key} className="relative rounded-3xl bg-slate-50 p-6 ring-1 ring-slate-100">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-700 text-white">{step.icon}</span>
                <span className="text-sm font-bold text-emerald-700"><Num>{String(i + 1).padStart(2, '0')}</Num></span>
              </div>
              <h3 className="mt-4 text-lg font-bold text-slate-900">{t(`${step.key}.title`)}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{t(`${step.key}.desc`)}</p>
            </li>
          ))}
        </ol>
      </Section>

      {/* ── what you get ─────────────────────────────────────────────────── */}
      <Section>
        <div className="mb-12 text-center">
          <h2 className="text-3xl font-extrabold tracking-tight text-slate-900 md:text-4xl">{t('landing.features.title')}</h2>
          <p className="mx-auto mt-3 max-w-xl text-slate-600">{t('landing.features.subtitle')}</p>
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          {FEATURES.map((f) => (
            <article key={f.key} className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-100 transition hover:shadow-md">
              <span className={`flex h-11 w-11 items-center justify-center rounded-2xl ${f.tone}`}>{f.icon}</span>
              <h3 className="mt-4 text-lg font-bold text-slate-900">{t(`${f.key}.title`)}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{t(`${f.key}.desc`)}</p>
            </article>
          ))}
        </div>
        <p className="mx-auto mt-8 max-w-2xl text-center text-sm text-slate-600">{t('landing.features.appLine')}</p>
      </Section>

      {/* ── the health boundary ──────────────────────────────────────────── */}
      <Section className="bg-slate-900 text-white">
        <div className="grid items-center gap-8 md:grid-cols-[auto,1fr]">
          <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-emerald-500/15 text-emerald-300 md:mx-0">
            <ShieldCheck size={32} />
          </span>
          <div className="text-center md:text-start">
            <h2 className="text-2xl font-extrabold tracking-tight md:text-3xl">{t('landing.safety.title')}</h2>
            <p className="mt-3 max-w-3xl leading-relaxed text-slate-300">{t('landing.safety.desc')}</p>
          </div>
        </div>
      </Section>

      <PricingTeaser />

      {/* ── last call ────────────────────────────────────────────────────── */}
      <Section>
        <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-emerald-700 to-teal-700 px-6 py-12 text-center text-white shadow-xl shadow-emerald-600/20 md:px-12">
          <h2 className="text-3xl font-extrabold tracking-tight md:text-4xl">{t('landing.final.title')}</h2>
          <p className="mx-auto mt-3 max-w-xl text-emerald-50">{t('landing.final.desc')}</p>
          <Link
            to="/book"
            className="mt-8 inline-flex items-center gap-2 rounded-2xl bg-white px-6 py-3.5 font-semibold text-emerald-800 shadow-lg transition hover:bg-emerald-50"
          >
            {t('landing.hero.ctaPrimary')} <Arrow size={18} aria-hidden="true" />
          </Link>
        </div>
      </Section>
    </PublicLayout>
  );
};
