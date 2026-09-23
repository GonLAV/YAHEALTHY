import { useEffect, useState } from 'react';
import { foodLogApi } from '@/services/api';
import { useLanguage } from '@/i18n/LanguageContext';

/**
 * The last 30 days, one cell each, filled if anything was logged.
 *
 * The streak card states a number and offers no evidence for it. A grid shows
 * the shape of the habit instead: that the gaps are weekends, or that the last
 * fortnight has been solid, or that a streak broke once in the middle of an
 * otherwise good month.
 *
 * That last case is the reason this is worth building. A streak counter resets
 * to zero and erases the thirty days behind it, which is the moment people
 * quit. A grid keeps them visible — a break is one pale square among many
 * filled ones, which is what it actually was.
 *
 * Behaviour, not body. It says nothing about what was eaten, only that
 * something was written down, so there is nothing here to grade or advise on.
 */

const DAYS = 30;

const localDateKey = (d: Date) => {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const lastNDays = (n: number): Date[] => {
  const out: Date[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    out.push(d);
  }
  return out;
};

export const ConsistencyCalendar = () => {
  const { t, lang } = useLanguage();
  const [logged, setLogged] = useState<Set<string> | null>(null);

  useEffect(() => {
    let cancelled = false;
    const dates = lastNDays(DAYS);

    foodLogApi
      .getLoggedDays(localDateKey(dates[0]), localDateKey(dates[dates.length - 1]))
      .then((res) => { if (!cancelled) setLogged(new Set(res.data.days ?? [])); })
      .catch(() => { if (!cancelled) setLogged(new Set()); });

    return () => { cancelled = true; };
  }, []);

  if (logged === null) {
    return <div className="h-32 animate-pulse rounded-2xl bg-slate-100" />;
  }

  const dates = lastNDays(DAYS);
  const count = dates.filter((d) => logged.has(localDateKey(d))).length;
  const locale = lang === 'he' ? 'he-IL' : 'en-US';

  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h2 className="font-semibold text-slate-900">{t('consistency.title')}</h2>
        <span className="text-xs font-medium text-slate-400">
          {/* .num around the count only — the sentence around it stays in the
              page's own direction. */}
          <span className="num font-semibold text-slate-600">{count}</span>
          {' / '}
          <span className="num">{DAYS}</span>
        </span>
      </div>

      {/* Time runs left to right, as it does in the trend chart beside it.
          Pinned rather than left to inherit, so the two read the same way. */}
      <div style={{ direction: 'ltr' }} className="grid grid-cols-10 gap-1.5">
        {dates.map((d) => {
          const key = localDateKey(d);
          const hit = logged.has(key);
          const label = d.toLocaleDateString(locale, { day: 'numeric', month: 'long' });
          return (
            <div
              key={key}
              title={label}
              aria-label={`${label} — ${t(hit ? 'consistency.logged' : 'consistency.notLogged')}`}
              className={`aspect-square rounded-md transition ${
                hit ? 'bg-emerald-500' : 'bg-slate-100'
              }`}
            />
          );
        })}
      </div>

      <p className="mt-3 text-xs text-slate-500">{t('consistency.footer', { n: count })}</p>
    </div>
  );
};

export default ConsistencyCalendar;
