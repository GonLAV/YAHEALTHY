import { ReactNode } from 'react';
import { useLanguage } from '@/i18n/LanguageContext';

/**
 * The wrapper every chart in this app should sit in.
 *
 * It exists so the bidi decisions get made once. A chart in a Hebrew UI has a
 * split personality: the plot area reads left-to-right because that is how
 * every chart anyone has ever seen advances through time, while the title, the
 * legend and the numbers beside it are Hebrew and read right-to-left. Getting
 * that wrong looks like a bug even when the data is right, and getting it right
 * by hand in each chart means getting it wrong in the third one.
 *
 * So: the header and footer stay in the page's own direction, and only the plot
 * is pinned LTR. index.css already pins `.recharts-wrapper`; this makes the
 * intent visible at the call site rather than leaving it to a global rule
 * somebody will wonder about later.
 */
export const ChartCard = ({
  title,
  aside,
  footer,
  height = 200,
  children,
}: {
  title: string;
  /** Short text at the far end of the title row — a total, an average. */
  aside?: ReactNode;
  footer?: ReactNode;
  height?: number;
  children: ReactNode;
}) => (
  <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
    <div className="mb-4 flex items-baseline justify-between gap-3">
      <h2 className="font-semibold text-slate-900">{title}</h2>
      {aside && <div className="text-xs font-medium text-slate-400">{aside}</div>}
    </div>

    {/* Time advances rightward in both languages. Mirroring it is technically
        the RTL-correct thing and practically confusing — Hebrew speakers read
        every chart in Excel, Sheets and the news this way. */}
    <div style={{ direction: 'ltr' }} className="w-full">
      <div style={{ height }}>{children}</div>
    </div>

    {footer && <div className="mt-3 text-xs text-slate-500">{footer}</div>}
  </div>
);

/**
 * Axis tick styling that matches the rest of the page.
 *
 * Recharts renders ticks as SVG <text>, which does not inherit the RTL font
 * swap in index.css — without `fontFamily: 'inherit'` a Hebrew chart labels
 * itself in Inter while everything around it is Heebo.
 */
export const TICK_STYLE = { fontSize: 11, fill: '#94a3b8', fontFamily: 'inherit' } as const;

/**
 * Short date labels for an axis, in the reader's language.
 *
 * Not `date.slice(5)`: that yields "09-23", which is locale-blind and a
 * bidi-neutral sandwich that can reorder unpredictably beside Hebrew.
 */
export const useAxisDate = () => {
  const { lang } = useLanguage();
  const locale = lang === 'he' ? 'he-IL' : 'en-US';

  return {
    /** "23 בספט׳" / "Sep 23" — for ranges longer than a week. */
    short: (iso: string) =>
      new Date(`${iso}T00:00:00`).toLocaleDateString(locale, { day: 'numeric', month: 'short' }),
    /**
     * Single letters in Hebrew (א ב ג ד ה ו ש), three letters in English.
     * Hebrew day names are far shorter, so a week fits without collisions
     * where "Mon/Tue/Wed" would already be crowding at phone width.
     */
    weekday: (iso: string) =>
      new Date(`${iso}T00:00:00`).toLocaleDateString(locale, {
        weekday: lang === 'he' ? 'narrow' : 'short',
      }),
  };
};

export default ChartCard;
