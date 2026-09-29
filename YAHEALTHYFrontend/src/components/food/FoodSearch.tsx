import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Clock, PlusCircle, Search } from 'lucide-react';
import { foodsApi, type CatalogFood } from '@/services/api';
import { useLanguage } from '@/i18n/LanguageContext';
import {
  catalogName,
  listboxNextIndex,
  loadRecentSearches,
  pushRecentSearch,
  saveRecentSearches,
} from '@/utils/foodLogging';

const DEBOUNCE_MS = 250;

type Option =
  | { kind: 'recent'; id: string; term: string }
  | { kind: 'food'; id: string; food: CatalogFood }
  | { kind: 'quick'; id: string; term: string };

/**
 * Search the sourced food catalog (GET /api/foods/search) — the primary way
 * to log. WAI-ARIA combobox + listbox: arrows/Home/End move the active
 * option, Enter picks it, Escape closes. With an empty box it offers recent
 * searches; the last option always offers a calories-only quick add.
 */
export function FoodSearch({
  onPick,
  onQuickAdd,
}: {
  onPick: (food: CatalogFood) => void;
  onQuickAdd: (term: string) => void;
}) {
  const { t, lang } = useLanguage();
  const uid = useId();
  const inputId = `${uid}-input`;
  const listId = `${uid}-list`;
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CatalogFood[]>([]);
  const [searched, setSearched] = useState('');
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [recent, setRecent] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  // Read after mount: storage is a per-browser convenience, never needed to render.
  useEffect(() => setRecent(loadRecentSearches()), []);

  const term = query.trim();

  useEffect(() => {
    if (term.length < 2) {
      setResults([]);
      setSearched('');
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    const timer = window.setTimeout(async () => {
      try {
        const res = await foodsApi.search(term, controller.signal);
        setResults(res.data.foods || []);
        setSearched(term);
      } catch {
        if (!controller.signal.aborted) {
          setResults([]);
          setSearched(term);
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [term]);

  const options: Option[] = useMemo(() => {
    if (term.length < 2) return recent.map((r, i) => ({ kind: 'recent', id: `${listId}-r${i}`, term: r }));
    const foods: Option[] = results.map((f) => ({ kind: 'food', id: `${listId}-f-${f.id}`, food: f }));
    return [...foods, { kind: 'quick', id: `${listId}-quick`, term }];
  }, [term, recent, results, listId]);

  useEffect(() => setActive(-1), [options.length, term]);

  const remember = (value: string) => {
    const next = pushRecentSearch(recent, value);
    setRecent(next);
    saveRecentSearches(next);
  };

  const choose = (opt: Option) => {
    if (opt.kind === 'recent') {
      setQuery(opt.term);
      setOpen(true);
      inputRef.current?.focus();
      return;
    }
    remember(term);
    setOpen(false);
    setQuery('');
    if (opt.kind === 'food') onPick(opt.food);
    else onQuickAdd(opt.term);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      if (open) {
        e.preventDefault();
        setOpen(false);
      } else if (query) {
        setQuery('');
      }
      return;
    }
    if (e.key === 'Enter') {
      if (open && active >= 0 && options[active]) {
        e.preventDefault();
        choose(options[active]);
      }
      return;
    }
    // Home/End belong to the text caret unless the list is open.
    if ((e.key === 'Home' || e.key === 'End') && !open) return;
    const next = listboxNextIndex(active, e.key, options.length);
    if (next === null) return;
    e.preventDefault();
    setOpen(true);
    setActive(next);
  };

  const expanded = open && options.length > 0;
  const status =
    term.length < 2
      ? ''
      : loading
        ? t('food.search.loading')
        : searched === term
          ? results.length
            ? t('food.search.results', { n: results.length })
            : t('food.search.noResults', { q: term })
          : '';

  return (
    <div className="relative">
      <label htmlFor={inputId} className="mb-1.5 block text-sm font-medium text-slate-700">
        {t('food.search.label')}
      </label>
      <div className="relative">
        <Search size={18} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
        <input
          ref={inputRef}
          id={inputId}
          type="search"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={expanded}
          aria-controls={listId}
          aria-activedescendant={expanded && active >= 0 ? options[active]?.id : undefined}
          aria-describedby={`${uid}-hint`}
          autoComplete="off"
          enterKeyHint="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={onKeyDown}
          placeholder={t('food.search.placeholder')}
          className="w-full rounded-xl border border-slate-200 bg-white py-3 pe-4 ps-10 text-base outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
        />
      </div>
      <p id={`${uid}-hint`} className="mt-1 text-xs text-slate-500">
        {t('food.search.hint')}
      </p>
      <p role="status" aria-live="polite" className="sr-only">
        {status}
      </p>

      <ul
        id={listId}
        role="listbox"
        aria-label={term.length < 2 ? t('food.search.recent') : t('food.search.catalog')}
        hidden={!expanded}
        className="absolute inset-x-0 top-full z-20 mt-1 max-h-80 overflow-y-auto rounded-xl bg-white py-1 shadow-lg ring-1 ring-slate-200"
      >
        {options.map((opt, i) => (
          <li
            key={opt.id}
            id={opt.id}
            role="option"
            aria-selected={i === active}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => choose(opt)}
            onMouseMove={() => setActive(i)}
            className={`flex cursor-pointer items-center gap-3 px-4 py-2.5 text-sm ${
              i === active ? 'bg-emerald-50 text-emerald-900' : 'text-slate-700'
            } ${opt.kind === 'quick' ? 'border-t border-slate-100' : ''}`}
          >
            {opt.kind === 'recent' && (
              <>
                <Clock size={16} className="shrink-0 text-slate-400" aria-hidden="true" />
                <span className="truncate">{opt.term}</span>
              </>
            )}
            {opt.kind === 'food' && (
              <>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{catalogName(opt.food, lang)}</span>
                  {lang === 'he' && opt.food.nameEn && (
                    <span dir="ltr" className="block truncate text-start text-xs text-slate-500">{opt.food.nameEn}</span>
                  )}
                </span>
                <span className="num shrink-0 text-xs text-slate-500">
                  {t('food.search.per100', { kcal: Math.round(opt.food.per100g.kcal) })}
                </span>
              </>
            )}
            {opt.kind === 'quick' && (
              <>
                <PlusCircle size={16} className="shrink-0 text-emerald-600" aria-hidden="true" />
                <span className="truncate">{t('food.search.quickAddOption', { q: opt.term })}</span>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default FoodSearch;
