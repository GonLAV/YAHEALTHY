import { useEffect, useMemo, useState } from 'react';
import { Check, ClipboardCopy, ShoppingCart } from 'lucide-react';
import type { GroceryItem } from '@/services/mealPlanApi';
import { useLanguage } from '@/i18n/LanguageContext';
import EmptyState from '@/components/ui/EmptyState';

/** Recipe data carries Hebrew ingredient categories; map them to translation keys. */
const CATEGORY_KEYS: Record<string, string> = {
  'ירקות': 'vegetables',
  'פירות': 'fruit',
  'חלבון': 'protein',
  'דגנים': 'grains',
  'שומן': 'fat',
  'תבלינים': 'spices',
  'חומצה': 'acid',
  'אחר': 'other',
};

const OTHER = '__other__';
const storageKey = (weekStart: string) => `yahealthy-grocery-ticks:${weekStart}`;
const itemKey = (item: GroceryItem) => item.item.trim().toLowerCase();

const readTicks = (weekStart: string): Set<string> => {
  try {
    const raw = localStorage.getItem(storageKey(weekStart));
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
};

const writeTicks = (weekStart: string, ticks: Set<string>) => {
  try {
    if (ticks.size === 0) localStorage.removeItem(storageKey(weekStart));
    else localStorage.setItem(storageKey(weekStart), JSON.stringify([...ticks]));
  } catch {
    // Storage unavailable (private mode, quota): ticks just won't persist.
  }
};

const copyText = async (text: string): Promise<boolean> => {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to the legacy path
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
};

interface GroceryListProps {
  /** YYYY-MM-DD of the visible week's first day; ticks are stored per week. */
  weekStart: string;
  rangeLabel: string;
  items: GroceryItem[];
  loading: boolean;
  error: boolean;
  onRetry: () => void;
}

export const GroceryList = ({ weekStart, rangeLabel, items, loading, error, onRetry }: GroceryListProps) => {
  const { t } = useLanguage();
  const [ticks, setTicks] = useState<Set<string>>(() => readTicks(weekStart));
  const [message, setMessage] = useState('');

  useEffect(() => {
    setTicks(readTicks(weekStart));
    setMessage('');
  }, [weekStart]);

  const catLabel = (category: string) => {
    if (category === OTHER) return t('grocery.cat.other');
    const key = CATEGORY_KEYS[category];
    return key ? t(`grocery.cat.${key}`) : category;
  };

  // Keep the API's order (most-used first) inside each group; groups appear in
  // the order their first item does.
  const groups = useMemo(() => {
    const map = new Map<string, GroceryItem[]>();
    for (const item of items) {
      const cat = item.category || OTHER;
      const list = map.get(cat) ?? [];
      list.push(item);
      map.set(cat, list);
    }
    return [...map.entries()];
  }, [items]);

  const total = items.length;
  const done = items.filter((i) => ticks.has(itemKey(i))).length;

  const toggle = (item: GroceryItem) => {
    setTicks((prev) => {
      const next = new Set(prev);
      const key = itemKey(item);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      writeTicks(weekStart, next);
      return next;
    });
  };

  const clearTicks = () => {
    const empty = new Set<string>();
    writeTicks(weekStart, empty);
    setTicks(empty);
  };

  const handleCopy = async () => {
    const lines: string[] = [`${t('grocery.title')} — ${rangeLabel}`];
    let count = 0;
    for (const [cat, list] of groups) {
      const remaining = list.filter((i) => !ticks.has(itemKey(i)));
      if (remaining.length === 0) continue;
      lines.push('', `${catLabel(cat)}:`);
      for (const i of remaining) {
        lines.push(`- ${i.item}${i.amounts.length ? ` (${i.amounts.join('; ')})` : ''}`);
        count += 1;
      }
    }
    const ok = await copyText(lines.join('\n'));
    setMessage(ok ? t('grocery.copied', { count }) : t('grocery.copyFailed'));
  };

  const note = t('grocery.itemsNote');

  return (
    <section aria-labelledby="grocery-heading" className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="grocery-heading" className="font-semibold text-slate-900">
            {t('grocery.title')}
          </h2>
          <p className="text-sm text-slate-500">{t('grocery.forWeek', { range: rangeLabel })}</p>
        </div>
        {total > 0 && (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleCopy}
              disabled={done === total}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-50"
            >
              <ClipboardCopy size={16} aria-hidden="true" />
              {t('grocery.copy')}
            </button>
            <button
              type="button"
              onClick={clearTicks}
              disabled={done === 0}
              className="rounded-xl px-4 py-2 text-sm font-semibold text-slate-600 ring-1 ring-slate-200 transition hover:bg-slate-50 disabled:opacity-50"
            >
              {t('grocery.clearTicks')}
            </button>
          </div>
        )}
      </div>

      <p role="status" aria-live="polite" className="mt-2 min-h-[1.25rem] text-sm text-emerald-700">
        {loading ? t('common.loading') : message}
      </p>

      {error && !loading ? (
        <div role="alert" className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-rose-50 p-4 text-sm text-rose-700">
          <span>{t('grocery.loadError')}</span>
          <button
            type="button"
            onClick={onRetry}
            className="rounded-lg bg-white px-3 py-1.5 font-semibold text-rose-700 ring-1 ring-rose-200 hover:bg-rose-100"
          >
            {t('mealPlan.retry')}
          </button>
        </div>
      ) : !loading && total === 0 ? (
        <div className="mt-2">
          <EmptyState icon={<ShoppingCart size={24} />} text={t('grocery.empty')} />
        </div>
      ) : total > 0 ? (
        <>
          <p className="mt-1 text-xs text-slate-500">
            {done === total ? t('grocery.nothingLeft') : t('grocery.progress', { done, total })}
            {note && <span className="ms-2">{note}</span>}
          </p>
          <div className="mt-4 flex flex-col gap-5">
            {groups.map(([cat, list]) => (
              <fieldset key={cat}>
                <legend className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
                  {catLabel(cat)}
                </legend>
                <ul className="divide-y divide-slate-100">
                  {list.map((item) => {
                    const key = itemKey(item);
                    const checked = ticks.has(key);
                    const id = `grocery-${weekStart}-${key.replace(/\s+/g, '-')}`;
                    return (
                      <li key={key} className="flex items-start gap-3 py-2.5">
                        <input
                          id={id}
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggle(item)}
                          className="mt-0.5 h-5 w-5 shrink-0 rounded border-slate-300 accent-emerald-600"
                        />
                        <label htmlFor={id} className="min-w-0 flex-1 cursor-pointer">
                          <span
                            className={`block font-medium ${checked ? 'text-slate-400 line-through' : 'text-slate-800'}`}
                          >
                            {item.item}
                            {checked && <Check size={14} aria-hidden="true" className="ms-1 inline text-emerald-500" />}
                          </span>
                          <span className="block text-xs text-slate-500">
                            {item.amounts.length > 0 && <>{item.amounts.join(' · ')} · </>}
                            {item.count === 1
                              ? t('grocery.usedInOne')
                              : t('grocery.usedIn', { count: item.count })}
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </fieldset>
            ))}
          </div>
        </>
      ) : null}
    </section>
  );
};

export default GroceryList;
