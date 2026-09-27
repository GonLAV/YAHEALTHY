import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Check,
  ChefHat,
  ChevronDown,
  Droplets,
  Heart,
  Languages,
  Lock,
  MessageCircle,
  MessageCircleHeart,
  Moon,
  NotebookPen,
  Scale,
  Sparkles,
  UserPlus,
  UtensilsCrossed,
} from 'lucide-react';
import { useLanguage } from '@/i18n/LanguageContext';
import { marketingApi, UTM_KEYS, type LeadInput, type MarketingPlan } from '@/services/api';

// ─── SEO ──────────────────────────────────────────────────────────────────────

/**
 * Title and meta description for the landing page, per language. On leaving
 * the page the app-wide title comes back (LanguageContext sets it in a layout
 * effect, so this passive effect always runs after it and wins while mounted).
 */
const useLandingMeta = () => {
  const { lang, t } = useLanguage();

  useEffect(() => {
    let meta = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'description';
      document.head.appendChild(meta);
    }
    const previousDescription = meta.content;

    document.title = t('landing.meta.title');
    meta.content = t('landing.meta.description');

    return () => {
      document.title = `${t('app.name')} — ${t('app.tagline')}`;
      if (meta) meta.content = previousDescription;
    };
    // `t` changes identity every render; the language is what matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);
};

// ─── Small building blocks ────────────────────────────────────────────────────

const LangToggle = () => {
  const { lang, toggleLang, t } = useLanguage();
  return (
    <button
      type="button"
      onClick={toggleLang}
      aria-label={t('a11y.toggleLang')}
      className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100"
    >
      <Languages size={16} aria-hidden="true" />
      <span lang={lang === 'he' ? 'en' : 'he'}>{lang === 'he' ? 'EN' : 'עב'}</span>
    </button>
  );
};

const Brand = () => (
  <span className="flex items-center gap-2.5">
    <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-emerald-600 shadow-sm shadow-emerald-200">
      <Heart size={18} className="text-white" fill="white" aria-hidden="true" />
    </span>
    <span className="text-lg font-extrabold tracking-tight text-slate-900">YAHealthy</span>
  </span>
);

const SectionHeading = ({ id, title, subtitle }: { id: string; title: string; subtitle?: string }) => (
  <div className="mx-auto mb-10 max-w-2xl text-center">
    <h2 id={id} className="text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">
      {title}
    </h2>
    {subtitle && <p className="mt-3 text-base text-slate-600">{subtitle}</p>}
  </div>
);

// ─── Hero ─────────────────────────────────────────────────────────────────────

/** A decorative sketch of the dashboard — shapes and labels only, no numbers. */
const HeroPreview = () => {
  const { t } = useLanguage();
  const tiles = [
    { icon: <UtensilsCrossed size={16} />, label: t('nav.foodLog'), width: 'w-3/4', tone: 'bg-emerald-500' },
    { icon: <Droplets size={16} />, label: t('nav.hydration'), width: 'w-1/2', tone: 'bg-sky-500' },
    { icon: <Moon size={16} />, label: t('nav.sleep'), width: 'w-2/3', tone: 'bg-indigo-500' },
    { icon: <Scale size={16} />, label: t('nav.weight'), width: 'w-2/5', tone: 'bg-amber-500' },
  ];

  return (
    <figure className="relative mx-auto w-full max-w-sm" role="img" aria-label={t('landing.hero.previewLabel')}>
      <div aria-hidden="true" className="absolute -inset-4 rounded-[2.5rem] bg-gradient-to-tr from-emerald-200/60 via-teal-100/60 to-sky-200/60 blur-2xl" />
      <div aria-hidden="true" className="relative rounded-[2rem] bg-white p-5 shadow-2xl shadow-emerald-900/10 ring-1 ring-slate-100">
        <div className="mb-4 flex items-center justify-between">
          <span className="text-sm font-bold text-slate-900">{t('landing.hero.previewToday')}</span>
          <span className="h-2 w-16 rounded-full bg-slate-100" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          {tiles.map((tile) => (
            <div key={tile.label} className="rounded-2xl bg-slate-50 p-3">
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-slate-700">
                <span className="text-slate-500">{tile.icon}</span>
                {tile.label}
              </div>
              <div className="h-1.5 w-full rounded-full bg-slate-200">
                <div className={`h-1.5 rounded-full ${tile.tone} ${tile.width}`} />
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 flex items-start gap-3 rounded-2xl bg-emerald-50 p-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white">
            <Sparkles size={16} />
          </span>
          <div>
            <div className="text-xs font-bold text-emerald-800">{t('landing.hero.previewCoach')}</div>
            <div className="mt-0.5 text-xs text-emerald-700">{t('landing.hero.previewCoachText')}</div>
          </div>
        </div>
      </div>
    </figure>
  );
};

// ─── FAQ (accessible disclosure) ──────────────────────────────────────────────

const FaqItem = ({ question, answer }: { question: string; answer: string }) => {
  const [open, setOpen] = useState(false);
  const id = useId();
  const buttonId = `faq-btn-${id}`;
  const panelId = `faq-panel-${id}`;

  return (
    <div className="rounded-2xl bg-white ring-1 ring-slate-200">
      <h3>
        <button
          id={buttonId}
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center justify-between gap-4 rounded-2xl px-5 py-4 text-start text-base font-semibold text-slate-900 transition hover:bg-slate-50"
        >
          <span>{question}</span>
          <ChevronDown
            size={20}
            aria-hidden="true"
            className={`shrink-0 text-emerald-600 transition-transform ${open ? 'rotate-180' : ''}`}
          />
        </button>
      </h3>
      <div
        id={panelId}
        role="region"
        aria-labelledby={buttonId}
        hidden={!open}
        className="px-5 pb-5 text-sm leading-relaxed text-slate-600"
      >
        {answer}
      </div>
    </div>
  );
};

// ─── Pricing ──────────────────────────────────────────────────────────────────

interface PlanCardProps {
  name: string;
  price: ReactNode;
  features: string[];
  cta: ReactNode;
  badge?: string;
  highlighted?: boolean;
}

const PlanCard = ({ name, price, features, cta, badge, highlighted }: PlanCardProps) => (
  <article
    className={`relative flex flex-col rounded-3xl p-6 ${
      highlighted ? 'bg-emerald-600 text-white shadow-xl shadow-emerald-200' : 'bg-white text-slate-900 ring-1 ring-slate-200'
    }`}
  >
    {badge && (
      <span
        className={`absolute -top-3 start-6 rounded-full px-3 py-1 text-xs font-bold ${
          highlighted ? 'bg-amber-300 text-amber-950' : 'bg-emerald-100 text-emerald-800'
        }`}
      >
        {badge}
      </span>
    )}
    <h3 className="text-lg font-bold">{name}</h3>
    <div className={`mt-2 min-h-[2.5rem] text-2xl font-extrabold ${highlighted ? 'text-white' : 'text-slate-900'}`}>{price}</div>
    <ul className="mt-5 flex flex-1 flex-col gap-3">
      {features.map((feature) => (
        <li key={feature} className="flex items-start gap-2.5 text-sm">
          <Check
            size={18}
            aria-hidden="true"
            className={`mt-0.5 shrink-0 ${highlighted ? 'text-emerald-100' : 'text-emerald-600'}`}
          />
          <span className={highlighted ? 'text-emerald-50' : 'text-slate-600'}>{feature}</span>
        </li>
      ))}
    </ul>
    <div className="mt-6">{cta}</div>
  </article>
);

// ─── Lead form ────────────────────────────────────────────────────────────────

type LeadStatus = 'idle' | 'submitting' | 'success';

interface LeadFormProps {
  source: string;
  utm: Partial<Record<(typeof UTM_KEYS)[number], string>>;
  emailRef: React.RefObject<HTMLInputElement>;
}

const LeadForm = ({ source, utm, emailRef }: LeadFormProps) => {
  const { t, lang } = useLanguage();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState('');
  const [status, setStatus] = useState<LeadStatus>('idle');
  const [error, setError] = useState('');
  const [errorField, setErrorField] = useState<'email' | 'consent' | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setErrorField(null);

    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) {
      setError(t('landing.lead.invalidEmail'));
      setErrorField('email');
      return;
    }
    if (!consent) {
      setError(t('landing.lead.consentRequired'));
      setErrorField('consent');
      return;
    }

    setStatus('submitting');
    const payload: LeadInput = {
      email: email.trim(),
      consent: true,
      lang,
      source,
      ...utm,
      ...(name.trim() ? { name: name.trim() } : {}),
      ...(website ? { website } : {}),
    };

    try {
      await marketingApi.submitLead(payload);
      setStatus('success');
      setEmail('');
      setName('');
      setConsent(false);
    } catch (err: any) {
      const code = err?.response?.status;
      setStatus('idle');
      if (code === 429) setError(t('landing.lead.rateLimited'));
      else if (code === 400) {
        setError(t('landing.lead.invalidEmail'));
        setErrorField('email');
      } else setError(t('landing.lead.error'));
    }
  };

  const inputClass =
    'w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 aria-[invalid=true]:border-rose-400';

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="lead-email" className="mb-1.5 block text-sm font-medium text-slate-700">
            {t('landing.lead.email')}
          </label>
          <input
            ref={emailRef}
            id="lead-email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            dir="ltr"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={errorField === 'email'}
            aria-describedby={errorField === 'email' ? 'lead-error' : undefined}
            placeholder="you@example.com"
            className={`${inputClass} text-start`}
          />
        </div>
        <div>
          <label htmlFor="lead-name" className="mb-1.5 block text-sm font-medium text-slate-700">
            {t('landing.lead.name')} <span className="font-normal text-slate-500">{t('landing.lead.optional')}</span>
          </label>
          <input
            id="lead-name"
            name="name"
            type="text"
            autoComplete="name"
            maxLength={100}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputClass}
          />
        </div>
      </div>

      {/* Honeypot: invisible to people and to assistive tech; bots tend to fill it. */}
      <div aria-hidden="true" className="sr-only">
        <label htmlFor="lead-website">{t('landing.lead.honeypot')}</label>
        <input
          id="lead-website"
          name="website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
        />
      </div>

      <div className="flex items-start gap-3">
        <input
          id="lead-consent"
          name="consent"
          type="checkbox"
          required
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          aria-invalid={errorField === 'consent'}
          aria-describedby={errorField === 'consent' ? 'lead-error' : undefined}
          className="mt-0.5 h-5 w-5 shrink-0 rounded border-slate-300 accent-emerald-600"
        />
        <label htmlFor="lead-consent" className="text-sm leading-relaxed text-slate-600">
          {t('landing.lead.consent')}
        </label>
      </div>

      {error && (
        <div
          id="lead-error"
          role="alert"
          className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
        >
          <AlertCircle size={16} className="shrink-0" aria-hidden="true" />
          {error}
        </div>
      )}

      <div role="status" aria-live="polite">
        {status === 'success' && (
          <p className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
            <Check size={16} className="shrink-0" aria-hidden="true" />
            {t('landing.lead.success')}
          </p>
        )}
      </div>

      <button
        type="submit"
        disabled={status === 'submitting'}
        className="w-full rounded-xl bg-emerald-600 px-6 py-3 font-semibold text-white shadow-md shadow-emerald-200 transition hover:bg-emerald-700 disabled:opacity-60 sm:w-auto sm:self-start"
      >
        {status === 'submitting' ? t('landing.lead.submitting') : t('landing.lead.submit')}
      </button>
    </form>
  );
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export const LandingPage = () => {
  const { t, lang, isRTL } = useLanguage();
  const location = useLocation();
  useLandingMeta();

  const Forward = isRTL ? ArrowLeft : ArrowRight;
  const emailRef = useRef<HTMLInputElement>(null);
  const [leadSource, setLeadSource] = useState('landing');
  const [plans, setPlans] = useState<Record<string, MarketingPlan> | null>(null);

  // First-touch campaign attribution from the URL the visitor arrived on.
  const utm = useMemo(() => {
    const params = new URLSearchParams(location.search);
    const found: Partial<Record<(typeof UTM_KEYS)[number], string>> = {};
    for (const key of UTM_KEYS) {
      const value = params.get(key);
      if (value) found[key] = value.slice(0, 200);
    }
    return found;
    // Only the landing URL counts; in-page anchor jumps must not rewrite it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;
    marketingApi
      .getPlans()
      .then((res) => {
        if (cancelled) return;
        setPlans(Object.fromEntries(res.data.plans.map((p) => [p.id, p])));
      })
      .catch(() => {
        if (!cancelled) setPlans({});
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const goToLeadForm = (source: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    setLeadSource(source);
    document.getElementById('contact')?.scrollIntoView({ block: 'start' });
    emailRef.current?.focus({ preventScroll: true });
  };

  const formatPrice = (plan: MarketingPlan | undefined) => {
    if (!plans) {
      return <span className="block h-7 w-24 animate-pulse rounded-lg bg-current opacity-20" aria-hidden="true" />;
    }
    if (!plan || plan.amount === null) {
      return <span className="text-base font-semibold opacity-90">{t('landing.pricing.onRequest')}</span>;
    }
    const formatted = new Intl.NumberFormat(lang === 'he' ? 'he-IL' : 'en-IL', {
      style: 'currency',
      currency: plan.currency || 'ILS',
      maximumFractionDigits: 0,
    }).format(plan.amount);
    return <span className="num">{formatted}</span>;
  };

  const steps = [
    { icon: <UserPlus size={22} />, title: t('landing.how.step1.title'), body: t('landing.how.step1.body') },
    { icon: <NotebookPen size={22} />, title: t('landing.how.step2.title'), body: t('landing.how.step2.body') },
    { icon: <Sparkles size={22} />, title: t('landing.how.step3.title'), body: t('landing.how.step3.body') },
  ];

  const features = [
    { key: 'food', icon: <UtensilsCrossed size={22} />, tone: 'bg-emerald-100 text-emerald-700' },
    { key: 'hydration', icon: <Droplets size={22} />, tone: 'bg-sky-100 text-sky-700' },
    { key: 'sleep', icon: <Moon size={22} />, tone: 'bg-indigo-100 text-indigo-700' },
    { key: 'weight', icon: <Scale size={22} />, tone: 'bg-amber-100 text-amber-700' },
    { key: 'coach', icon: <MessageCircleHeart size={22} />, tone: 'bg-rose-100 text-rose-700' },
    { key: 'whatsapp', icon: <MessageCircle size={22} />, tone: 'bg-green-100 text-green-700' },
  ];

  const faqs = [1, 2, 3, 4, 5, 6].map((n) => ({
    question: t(`landing.faq.q${n}`),
    answer: t(`landing.faq.a${n}`),
  }));

  const navLinks = [
    { href: '#how-it-works', label: t('landing.nav.how') },
    { href: '#features', label: t('landing.nav.features') },
    { href: '#pricing', label: t('landing.nav.pricing') },
    { href: '#faq', label: t('landing.nav.faq') },
  ];

  const secondaryBtn =
    'inline-flex w-full items-center justify-center gap-2 rounded-xl bg-white px-5 py-3 font-semibold text-emerald-700 ring-1 ring-emerald-200 transition hover:bg-emerald-50';
  const primaryBtn =
    'inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 font-semibold text-white shadow-md shadow-emerald-200 transition hover:bg-emerald-700';

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <a href="#main-content" className="skip-link rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-lg">
        {t('a11y.skipToContent')}
      </a>

      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-slate-100 bg-white/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link to="/" aria-label="YAHealthy" className="rounded-xl">
            <Brand />
          </Link>
          <nav aria-label={t('landing.nav.label')} className="hidden items-center gap-6 md:flex">
            {navLinks.map((link) => (
              <a key={link.href} href={link.href} className="text-sm font-medium text-slate-600 transition hover:text-emerald-700">
                {link.label}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <LangToggle />
            <Link
              to="/login"
              className="hidden rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 sm:inline-flex"
            >
              {t('landing.nav.login')}
            </Link>
            <Link
              to="/signup"
              className="inline-flex rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700"
            >
              {t('landing.nav.signup')}
            </Link>
          </div>
        </div>
      </header>

      <main id="main-content" tabIndex={-1} className="outline-none">
        {/* Hero */}
        <section aria-labelledby="hero-title" className="relative overflow-hidden bg-gradient-to-br from-emerald-50 via-teal-50 to-sky-50">
          <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-14 sm:px-6 sm:py-20 lg:grid-cols-2 lg:py-24">
            <div className="text-center lg:text-start">
              <p className="inline-flex items-center gap-2 rounded-full bg-white/80 px-3 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-100">
                <ChefHat size={14} aria-hidden="true" />
                {t('landing.hero.eyebrow')}
              </p>
              <h1 id="hero-title" className="mt-5 text-3xl font-extrabold leading-tight tracking-tight text-slate-900 sm:text-5xl">
                {t('landing.hero.title')}{' '}
                <span className="bg-gradient-to-l from-emerald-600 to-teal-500 bg-clip-text text-transparent">
                  {t('landing.hero.titleAccent')}
                </span>
              </h1>
              <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-slate-600 sm:text-lg lg:mx-0">
                {t('landing.hero.subtitle')}
              </p>
              <div className="mx-auto mt-8 flex max-w-md flex-col gap-3 sm:flex-row lg:mx-0">
                <Link to="/signup" className={primaryBtn}>
                  {t('landing.hero.cta')}
                  <Forward size={18} aria-hidden="true" />
                </Link>
                <a href="#how-it-works" className={secondaryBtn}>
                  {t('landing.hero.secondary')}
                </a>
              </div>
              <p className="mt-4 text-xs text-slate-500">{t('landing.hero.note')}</p>
            </div>
            <HeroPreview />
          </div>
        </section>

        {/* How it works */}
        <section id="how-it-works" aria-labelledby="how-title" className="scroll-mt-20 px-4 py-16 sm:px-6 sm:py-20">
          <div className="mx-auto max-w-6xl">
            <SectionHeading id="how-title" title={t('landing.how.title')} subtitle={t('landing.how.subtitle')} />
            <ol className="grid gap-6 md:grid-cols-3">
              {steps.map((step, i) => (
                <li key={step.title} className="relative rounded-3xl bg-slate-50 p-6 ring-1 ring-slate-100">
                  <div className="flex items-center gap-3">
                    <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-600 text-white" aria-hidden="true">
                      {step.icon}
                    </span>
                    <span className="num text-sm font-bold text-emerald-700" aria-hidden="true">
                      0{i + 1}
                    </span>
                  </div>
                  <h3 className="mt-4 text-lg font-bold text-slate-900">{step.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600">{step.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Features */}
        <section id="features" aria-labelledby="features-title" className="scroll-mt-20 bg-slate-50 px-4 py-16 sm:px-6 sm:py-20">
          <div className="mx-auto max-w-6xl">
            <SectionHeading id="features-title" title={t('landing.features.title')} subtitle={t('landing.features.subtitle')} />
            <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {features.map((f) => (
                <li key={f.key} className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-100 transition hover:shadow-md">
                  <span className={`flex h-11 w-11 items-center justify-center rounded-2xl ${f.tone}`} aria-hidden="true">
                    {f.icon}
                  </span>
                  <h3 className="mt-4 text-lg font-bold text-slate-900">{t(`landing.features.${f.key}.title`)}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600">{t(`landing.features.${f.key}.body`)}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Pricing */}
        <section id="pricing" aria-labelledby="pricing-title" className="scroll-mt-20 px-4 py-16 sm:px-6 sm:py-20">
          <div className="mx-auto max-w-6xl">
            <SectionHeading id="pricing-title" title={t('landing.pricing.title')} subtitle={t('landing.pricing.subtitle')} />
            <div className="grid gap-6 pt-3 md:grid-cols-3" aria-busy={plans === null}>
              <PlanCard
                name={t('landing.pricing.app.name')}
                price={<span className="text-base font-semibold text-slate-700">{t('landing.pricing.app.price')}</span>}
                features={[1, 2, 3, 4].map((n) => t(`landing.pricing.app.f${n}`))}
                cta={
                  <Link to="/signup" className={secondaryBtn}>
                    {t('landing.pricing.app.cta')}
                  </Link>
                }
              />
              <PlanCard
                name={t('landing.pricing.base.name')}
                price={formatPrice(plans?.base)}
                features={[1, 2, 3].map((n) => t(`landing.pricing.base.f${n}`))}
                cta={
                  <a href="#contact" onClick={goToLeadForm('pricing-base')} className={secondaryBtn}>
                    {t('landing.pricing.paidCta')}
                  </a>
                }
              />
              <PlanCard
                highlighted
                badge={t('landing.pricing.yoni.badge')}
                name={t('landing.pricing.yoni.name')}
                price={formatPrice(plans?.yoni)}
                features={[1, 2, 3].map((n) => t(`landing.pricing.yoni.f${n}`))}
                cta={
                  <a
                    href="#contact"
                    onClick={goToLeadForm('pricing-yoni')}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-white px-5 py-3 font-semibold text-emerald-700 transition hover:bg-emerald-50"
                  >
                    {t('landing.pricing.paidCta')}
                  </a>
                }
              />
            </div>
            <p className="mt-6 flex items-center justify-center gap-2 text-center text-xs text-slate-500">
              <Lock size={14} aria-hidden="true" className="shrink-0" />
              {t('landing.pricing.securePayment')}
            </p>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" aria-labelledby="faq-title" className="scroll-mt-20 bg-slate-50 px-4 py-16 sm:px-6 sm:py-20">
          <div className="mx-auto max-w-3xl">
            <SectionHeading id="faq-title" title={t('landing.faq.title')} />
            <div className="flex flex-col gap-3">
              {faqs.map((faq) => (
                <FaqItem key={faq.question} question={faq.question} answer={faq.answer} />
              ))}
            </div>
          </div>
        </section>

        {/* Lead capture */}
        <section id="contact" aria-labelledby="contact-title" className="scroll-mt-20 px-4 py-16 sm:px-6 sm:py-20">
          <div className="mx-auto max-w-3xl rounded-3xl bg-gradient-to-br from-emerald-50 via-teal-50 to-sky-50 p-6 ring-1 ring-emerald-100 sm:p-10">
            <h2 id="contact-title" className="text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">
              {t('landing.lead.title')}
            </h2>
            <p className="mb-6 mt-2 text-slate-600">{t('landing.lead.subtitle')}</p>
            <LeadForm source={leadSource} utm={utm} emailRef={emailRef} />
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white px-4 pb-24 pt-12 sm:px-6 md:pb-12">
        <div className="mx-auto grid max-w-6xl gap-10 md:grid-cols-4">
          <div className="md:col-span-2">
            <Brand />
            <p className="mt-3 max-w-sm text-sm text-slate-600">{t('landing.footer.tagline')}</p>
          </div>
          <nav aria-label={t('landing.footer.product')}>
            <h2 className="text-sm font-bold text-slate-900">{t('landing.footer.product')}</h2>
            <ul className="mt-3 flex flex-col gap-2 text-sm">
              {navLinks.map((link) => (
                <li key={link.href}>
                  <a href={link.href} className="text-slate-600 transition hover:text-emerald-700">
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          <nav aria-label={t('landing.footer.account')}>
            <h2 className="text-sm font-bold text-slate-900">{t('landing.footer.account')}</h2>
            <ul className="mt-3 flex flex-col gap-2 text-sm">
              <li>
                <Link to="/login" className="text-slate-600 transition hover:text-emerald-700">
                  {t('landing.nav.login')}
                </Link>
              </li>
              <li>
                <Link to="/signup" className="text-slate-600 transition hover:text-emerald-700">
                  {t('landing.nav.signup')}
                </Link>
              </li>
            </ul>
          </nav>
        </div>
        <div className="mx-auto mt-10 flex max-w-6xl flex-col gap-3 border-t border-slate-100 pt-6 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <p className="max-w-2xl">{t('landing.footer.disclaimer')}</p>
          <p className="num shrink-0">{t('landing.footer.rights', { year: new Date().getFullYear() })}</p>
        </div>
      </footer>
    </div>
  );
};
