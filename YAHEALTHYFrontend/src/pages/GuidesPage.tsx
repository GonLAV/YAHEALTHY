/**
 * Public content hub: /guides (index) and /guides/:slug (article), plus the
 * English twins under /en. Content lives in src/content/guides.ts.
 */
import type { ReactNode } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, BookOpen, Clock, Info } from 'lucide-react';
import { useLanguage } from '@/i18n/LanguageContext';
import type { Lang } from '@/i18n/translations';
import { PublicFooter, PublicHeader, usePublicPage, type PublicNavLink } from '@/components/public/PublicChrome';
import {
  findGuideById,
  findGuideBySlug,
  guideSignupHref,
  guides,
  readingMinutes,
  type Guide,
  type GuideBlock,
} from '@/content/guides';
import { localizePath } from '@/seo/site';

const guidePath = (lang: Lang, guide: Guide) => localizePath(lang, `/guides/${guide.locales[lang].slug}`);

const formatDate = (lang: Lang, iso: string) =>
  new Intl.DateTimeFormat(lang === 'he' ? 'he-IL' : 'en-GB', { dateStyle: 'long', timeZone: 'UTC' }).format(
    new Date(`${iso}T00:00:00Z`),
  );

const usePublicNav = (current: 'guides' | null): PublicNavLink[] => {
  const { t, lang } = useLanguage();
  return [
    { href: localizePath(lang, '/'), label: t('guides.home') },
    { href: localizePath(lang, '/guides'), label: t('guides.nav'), current: current === 'guides' },
  ];
};

const PublicShell = ({ nav, children }: { nav: PublicNavLink[]; children: ReactNode }) => {
  const { t } = useLanguage();
  return (
    <div className="min-h-screen bg-white text-slate-900">
      <a href="#main-content" className="skip-link rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white shadow-lg">
        {t('a11y.skipToContent')}
      </a>
      <PublicHeader nav={nav} />
      <main id="main-content" tabIndex={-1} className="outline-none">
        {children}
      </main>
      <PublicFooter nav={nav} />
    </div>
  );
};

const GuideMeta = ({ guide }: { guide: Guide }) => {
  const { t, lang } = useLanguage();
  return (
    <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500">
      <span className="inline-flex items-center gap-1.5">
        <Clock size={14} aria-hidden="true" />
        {t('guides.readingTime', { min: readingMinutes(guide.locales[lang]) })}
      </span>
      <span>
        {t('guides.updated')}{' '}
        <time dateTime={guide.dateModified}>{formatDate(lang, guide.dateModified)}</time>
      </span>
    </p>
  );
};

// ─── Index ────────────────────────────────────────────────────────────────────

export const GuidesIndexPage = () => {
  usePublicPage();
  const { t, lang, isRTL } = useLanguage();
  const nav = usePublicNav('guides');
  const Forward = isRTL ? ArrowLeft : ArrowRight;

  return (
    <PublicShell nav={nav}>
      <section aria-labelledby="guides-title" className="bg-gradient-to-br from-emerald-50 via-teal-50 to-sky-50 px-4 py-14 sm:px-6 sm:py-16">
        <div className="mx-auto max-w-4xl text-center">
          <p className="inline-flex items-center gap-2 rounded-full bg-white/80 px-3 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-100">
            <BookOpen size={14} aria-hidden="true" />
            {t('guides.index.eyebrow')}
          </p>
          <h1 id="guides-title" className="mt-4 text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
            {t('guides.index.title')}
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-base text-slate-600">{t('guides.index.subtitle')}</p>
        </div>
      </section>

      <section aria-label={t('guides.nav')} className="px-4 py-12 sm:px-6 sm:py-16">
        <ul className="mx-auto grid max-w-5xl gap-5 sm:grid-cols-2">
          {guides.map((guide) => {
            const loc = guide.locales[lang];
            return (
              <li key={guide.id}>
                <article className="flex h-full flex-col rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-100 transition hover:shadow-md">
                  <h2 className="text-lg font-bold text-slate-900">
                    <Link to={guidePath(lang, guide)} className="hover:text-emerald-800">
                      {loc.title}
                    </Link>
                  </h2>
                  <p className="mt-2 flex-1 text-sm leading-relaxed text-slate-600">{loc.description}</p>
                  <div className="mt-4 flex items-center justify-between gap-3">
                    <GuideMeta guide={guide} />
                  </div>
                  <Link
                    to={guidePath(lang, guide)}
                    aria-label={`${t('guides.readMore')}: ${loc.title}`}
                    className="mt-4 inline-flex items-center gap-1.5 self-start text-sm font-semibold text-emerald-700 hover:text-emerald-800"
                  >
                    {t('guides.readMore')}
                    <Forward size={16} aria-hidden="true" />
                  </Link>
                </article>
              </li>
            );
          })}
        </ul>
      </section>
    </PublicShell>
  );
};

// ─── Article ──────────────────────────────────────────────────────────────────

const Block = ({ block, noteLabel }: { block: GuideBlock; noteLabel: string }) => {
  switch (block.type) {
    case 'h2':
      return <h2 className="mt-10 text-xl font-bold text-slate-900 sm:text-2xl">{block.text}</h2>;
    case 'ul':
      return (
        <ul className="mt-4 flex list-disc flex-col gap-2 ps-6 text-base leading-relaxed text-slate-700 marker:text-emerald-600">
          {block.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      );
    case 'note':
      return (
        <aside role="note" aria-label={noteLabel} className="mt-10 flex gap-3 rounded-2xl bg-amber-50 p-5 text-sm leading-relaxed text-amber-900 ring-1 ring-amber-200">
          <Info size={18} aria-hidden="true" className="mt-0.5 shrink-0" />
          <p>
            <strong className="font-semibold">{noteLabel}: </strong>
            {block.text}
          </p>
        </aside>
      );
    default:
      return <p className="mt-4 text-base leading-relaxed text-slate-700">{block.text}</p>;
  }
};

export const GuidePage = () => {
  const match = usePublicPage();
  const { slug = '' } = useParams();
  const { t, lang, isRTL } = useLanguage();
  const nav = usePublicNav(null);
  const Back = isRTL ? ArrowRight : ArrowLeft;

  // The URL decides the language; `lang` state catches up in a layout effect.
  const urlLang = match?.lang ?? lang;
  const guide = findGuideBySlug(urlLang, slug);
  if (!guide) return <Navigate to={localizePath(urlLang, '/guides')} replace />;

  const loc = guide.locales[lang];
  const related = guide.related.map(findGuideById).filter((g): g is Guide => Boolean(g));

  return (
    <PublicShell nav={nav}>
      <article aria-labelledby="guide-title" className="px-4 py-10 sm:px-6 sm:py-14">
        <div className="mx-auto max-w-2xl">
          <nav aria-label={t('guides.breadcrumb')} className="text-sm text-slate-500">
            <ol className="flex flex-wrap items-center gap-2">
              <li>
                <Link to={localizePath(lang, '/')} className="hover:text-emerald-800">
                  {t('guides.home')}
                </Link>
              </li>
              <li aria-hidden="true">/</li>
              <li>
                <Link to={localizePath(lang, '/guides')} className="hover:text-emerald-800">
                  {t('guides.nav')}
                </Link>
              </li>
              <li aria-hidden="true">/</li>
              <li aria-current="page" className="text-slate-700">
                {loc.title}
              </li>
            </ol>
          </nav>

          <header className="mt-6">
            <h1 id="guide-title" className="text-3xl font-extrabold leading-tight tracking-tight text-slate-900 sm:text-4xl">
              {loc.title}
            </h1>
            <p className="mt-4 text-lg leading-relaxed text-slate-600">{loc.description}</p>
            <div className="mt-4">
              <GuideMeta guide={guide} />
            </div>
          </header>

          <div className="mt-6">
            {loc.body.map((block, i) => (
              <Block key={i} block={block} noteLabel={t('guides.noteLabel')} />
            ))}
          </div>

          <section aria-labelledby="guide-cta-title" className="mt-12 rounded-3xl bg-gradient-to-br from-emerald-50 via-teal-50 to-sky-50 p-6 ring-1 ring-emerald-100 sm:p-8">
            <h2 id="guide-cta-title" className="text-xl font-bold text-slate-900">
              {t('guides.cta.title')}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">{t('guides.cta.body')}</p>
            <Link
              to={guideSignupHref(guide, lang)}
              className="mt-5 inline-flex items-center justify-center rounded-xl bg-emerald-700 px-5 py-3 font-semibold text-white shadow-md shadow-emerald-200 transition hover:bg-emerald-800"
            >
              {t('guides.cta.button')}
            </Link>
          </section>

          {related.length > 0 && (
            <nav aria-labelledby="guide-related-title" className="below-fold mt-12">
              <h2 id="guide-related-title" className="text-lg font-bold text-slate-900">
                {t('guides.related')}
              </h2>
              <ul className="mt-4 flex flex-col gap-3">
                {related.map((g) => (
                  <li key={g.id}>
                    <Link
                      to={guidePath(lang, g)}
                      className="block rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-100 transition hover:bg-emerald-50"
                    >
                      <span className="font-semibold text-slate-900">{g.locales[lang].title}</span>
                      <span className="mt-1 block text-sm text-slate-600">{g.locales[lang].description}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          )}

          <p className="mt-10">
            <Link to={localizePath(lang, '/guides')} className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-700 hover:text-emerald-800">
              <Back size={16} aria-hidden="true" />
              {t('guides.backToAll')}
            </Link>
          </p>
        </div>
      </article>
    </PublicShell>
  );
};
