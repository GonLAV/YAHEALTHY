import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { translations } from '@/i18n/translations';
import { useLanguage } from '@/i18n/LanguageContext';
import { buildSeoHead, matchPublicRoute, seoHeadTags, serializeJsonLd } from './site';

/**
 * Keeps <head> in step with the public page being shown, after client-side
 * navigation. The prerendered HTML already carries the same tags (built by the
 * same functions), so on first load this simply rewrites identical values.
 *
 * On leaving a public page its tags are removed and the plain app description
 * is restored: signed-in screens are not indexable and do not need them.
 */
export const useSeoHead = () => {
  const { pathname } = useLocation();
  // Re-applied when the language state catches up with the URL: the
  // LanguageContext layout effect resets document.title on a language change.
  const { lang } = useLanguage();

  useEffect(() => {
    const match = matchPublicRoute(pathname);
    if (!match) return;
    const head = buildSeoHead(match);

    const plainDescription = document.querySelector<HTMLMetaElement>('meta[name="description"]:not([data-seo])');
    const previousDescription = plainDescription?.content ?? '';
    plainDescription?.remove();
    document.head.querySelectorAll('[data-seo]').forEach((el) => el.remove());

    document.title = head.title;
    const added: Element[] = [];
    for (const { tag, attrs } of seoHeadTags(head)) {
      const el = document.createElement(tag);
      el.setAttribute('data-seo', '');
      for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
      document.head.appendChild(el);
      added.push(el);
    }
    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.setAttribute('data-seo', '');
    script.textContent = serializeJsonLd(head);
    document.head.appendChild(script);
    added.push(script);

    return () => {
      added.forEach((el) => el.remove());
      // Back to the app-wide title LanguageContext uses (a prerendered first
      // load had the page's own title, which must not outlive the page).
      const t = translations[head.lang];
      document.title = `${t['app.name']} — ${t['app.tagline']}`;
      if (!document.querySelector('meta[name="description"]')) {
        const meta = document.createElement('meta');
        meta.name = 'description';
        meta.content = previousDescription || head.description;
        document.head.appendChild(meta);
      }
    };
  }, [pathname, lang]);
};
