import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, ChefHat, Languages, Search, SearchX } from 'lucide-react';
import { recipeApi } from '@/services/api';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { Num } from '@/components/ui/Num';
import { CATEGORY_ORDER, RecipeCard, type RecipeWithNutrition } from '@/components/recipes/RecipeCard';
import { useLanguage } from '@/i18n/LanguageContext';

/**
 * Lower-cased, without niqqud, accents or the quote marks Hebrew uses in
 * abbreviations, so "קק״ל" finds "קק\"ל" and "Creme" finds "Crème".
 */
const normalize = (text: string) =>
  text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-֑ͯ-ׇ]/g, '')
    .replace(/["'׳״`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

/** Both names and every ingredient, in whatever language the reader types. */
const searchText = (r: RecipeWithNutrition) =>
  normalize([r.name, r.name_en ?? '', ...r.ingredients.map((i) => i.item)].join(' | '));

export const RecipesPage = () => {
  const { t, lang } = useLanguage();
  const [recipes, setRecipes] = useState<RecipeWithNutrition[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [category, setCategory] = useState('all');
  const [query, setQuery] = useState('');
  const [openIds, setOpenIds] = useState<Set<string>>(() => new Set());

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      const res = await recipeApi.getAll();
      setRecipes(Array.isArray(res.data) ? res.data : []);
    } catch {
      setFailed(true);
      setRecipes([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const index = useMemo(() => recipes.map((r) => ({ recipe: r, text: searchText(r) })), [recipes]);

  const matching = useMemo(() => {
    const words = normalize(query).split(' ').filter(Boolean);
    if (words.length === 0) return recipes;
    return index.filter(({ text }) => words.every((w) => text.includes(w))).map(({ recipe }) => recipe);
  }, [index, recipes, query]);

  // Known categories in a fixed order, then anything new the data brings.
  const categories = useMemo(() => {
    const present = new Set(recipes.map((r) => r.category));
    return [
      ...CATEGORY_ORDER.filter((c) => present.has(c)),
      ...[...present].filter((c) => !CATEGORY_ORDER.includes(c)),
    ];
  }, [recipes]);

  const countIn = (c: string) => (c === 'all' ? matching.length : matching.filter((r) => r.category === c).length);

  const visible = useMemo(
    () => (category === 'all' ? matching : matching.filter((r) => r.category === category)),
    [matching, category]
  );

  const categoryLabel = (c: string) => {
    const key = `recipes.category.${c}`;
    const text = t(key);
    return text === key ? c : text;
  };

  const toggle = (id: string) =>
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const filtered = visible.length !== recipes.length;
  const showAll = () => {
    setQuery('');
    setCategory('all');
  };

  const pill = (active: boolean) =>
    `inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${
      active
        ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-200'
        : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-emerald-50 hover:text-emerald-700 hover:ring-emerald-200'
    }`;

  return (
    <div className="mx-auto max-w-4xl p-4 md:p-8">
      <PageHeader title={t('recipes.title')} subtitle={t('recipes.subtitle')} icon={<ChefHat size={22} />} />

      {recipes.length > 0 && (
        <div className="mb-5 space-y-3">
          <div>
            <label htmlFor="recipe-search" className="sr-only">
              {t('recipes.search.label')}
            </label>
            <div className="relative">
              <Search size={18} aria-hidden className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                id="recipe-search"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('recipes.search.placeholder')}
                autoComplete="off"
                enterKeyHint="search"
                className="w-full rounded-2xl border border-slate-200 bg-white py-3 pe-4 ps-11 text-sm shadow-sm outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              />
            </div>
            {lang === 'en' && (
              <p className="mt-2 flex items-start gap-1.5 text-xs text-slate-500">
                <Languages size={14} aria-hidden className="mt-px shrink-0" />
                {t('recipes.contentInHebrew')}
              </p>
            )}
          </div>

          <div role="group" aria-label={t('recipes.filter.label')} className="flex flex-wrap gap-2">
            {['all', ...categories].map((c) => {
              const active = c === category;
              return (
                <button key={c} type="button" onClick={() => setCategory(c)} aria-pressed={active} className={pill(active)}>
                  {c === 'all' ? t('recipes.category.all') : categoryLabel(c)}
                  <span
                    className={`rounded-full px-1.5 text-xs font-bold ${active ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'}`}
                  >
                    <Num>{countIn(c)}</Num>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* One live region for both: "loading…" while it loads, then how many
          recipes the search and category leave, as they change. */}
      <p id="recipe-count" role="status" aria-live="polite" className="mb-3 text-sm text-slate-500">
        {loading ? (
          t('recipes.loading')
        ) : recipes.length > 0 ? (
          filtered ? (
            <>
              <Num>{visible.length}</Num> {t('recipes.count.of')} <Num>{recipes.length}</Num> {t('recipes.count.many')}
            </>
          ) : (
            <>
              <Num>{recipes.length}</Num> {t(recipes.length === 1 ? 'recipes.count.one' : 'recipes.count.many')}
            </>
          )
        ) : null}
      </p>

      {loading ? (
        <div aria-hidden className="space-y-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
              <div className="h-12 w-12 shrink-0 animate-pulse rounded-2xl bg-slate-100" />
              <div className="flex-1 space-y-2">
                <div className="h-3 w-16 animate-pulse rounded bg-slate-100" />
                <div className="h-4 w-2/3 animate-pulse rounded bg-slate-100" />
                <div className="h-3 w-1/2 animate-pulse rounded bg-slate-100" />
              </div>
            </div>
          ))}
        </div>
      ) : failed ? (
        <div
          role="alert"
          className="flex flex-col gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-rose-700 sm:flex-row sm:items-center"
        >
          <p className="flex flex-1 items-center gap-2 text-sm font-medium">
            <AlertCircle size={18} aria-hidden className="shrink-0" />
            {t('recipes.error')}
          </p>
          <button
            type="button"
            onClick={load}
            className="self-start rounded-xl bg-white px-4 py-2 text-sm font-semibold text-rose-700 ring-1 ring-rose-200 hover:bg-rose-100 sm:self-auto"
          >
            {t('common.retry')}
          </button>
        </div>
      ) : recipes.length === 0 ? (
        <EmptyState icon={<ChefHat size={28} />} text={t('recipes.empty')} />
      ) : visible.length === 0 ? (
        <div className="space-y-4">
          <EmptyState icon={<SearchX size={28} />} text={t('recipes.noMatch')} />
          <div className="text-center">
            <button
              type="button"
              onClick={showAll}
              className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
            >
              {t('recipes.showAll')}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map((recipe) => (
            <RecipeCard key={recipe.id} recipe={recipe} open={openIds.has(recipe.id)} onToggle={() => toggle(recipe.id)} />
          ))}
        </div>
      )}
    </div>
  );
};
