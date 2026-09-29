import { useId, useState } from 'react';
import { Bookmark, Check, History, Pencil, Star, Trash2, X } from 'lucide-react';
import { useLanguage } from '@/i18n/LanguageContext';
import type { FoodSuggestion, FoodTemplate } from '@/services/api';

const amount = (quantity: number | null, unit: string | null, grams: string) =>
  quantity != null ? `${quantity} ${unit === 'g' || !unit ? grams : unit}` : '';

/** "Log again": the user's own frequent foods for this meal, one tap each. */
export function LogAgainChips({
  suggestions,
  busy,
  onLog,
}: {
  suggestions: FoodSuggestion[];
  busy: boolean;
  onLog: (s: FoodSuggestion) => void;
}) {
  const { t } = useLanguage();
  const uid = useId();
  return (
    <section aria-labelledby={`${uid}-h`} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
      <h2 id={`${uid}-h`} className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
        <History size={16} aria-hidden="true" /> {t('food.logAgain.title')}
      </h2>
      {suggestions.length === 0 ? (
        <p className="text-sm text-slate-500">{t('food.logAgain.empty')}</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {suggestions.map((s) => {
            const qty = amount(s.quantity, s.unit, t('common.grams'));
            return (
              <li key={s.key}>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onLog(s)}
                  aria-label={t('food.logAgain.chip', { name: s.name, kcal: Math.round(s.calories) })}
                  className="flex max-w-[16rem] items-center gap-2 rounded-full bg-emerald-50 px-3.5 py-2 text-sm text-emerald-900 ring-1 ring-emerald-100 transition hover:bg-emerald-100 disabled:opacity-60"
                >
                  <bdi className="truncate font-medium">{s.name}</bdi>
                  {qty && <span className="num shrink-0 text-xs text-emerald-800">{qty}</span>}
                  <span className="shrink-0 whitespace-nowrap text-xs text-emerald-800"><span className="num">{Math.round(s.calories)}</span> {t('common.kcal')}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** Favourite foods and saved meals: one tap to log; rename/delete in manage mode. */
export function SavedMeals({
  templates,
  busy,
  onLog,
  onRename,
  onDelete,
}: {
  templates: FoodTemplate[];
  busy: boolean;
  onLog: (tpl: FoodTemplate) => void;
  onRename: (tpl: FoodTemplate, name: string) => void;
  onDelete: (tpl: FoodTemplate) => void;
}) {
  const { t } = useLanguage();
  const uid = useId();
  const [managing, setManaging] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  const startEdit = (tpl: FoodTemplate) => {
    setEditing(tpl.id);
    setDraft(tpl.name);
  };
  const saveEdit = (tpl: FoodTemplate) => {
    const name = draft.trim();
    if (name && name !== tpl.name) onRename(tpl, name);
    setEditing(null);
  };

  return (
    <section aria-labelledby={`${uid}-h`} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 id={`${uid}-h`} className="flex items-center gap-2 text-sm font-semibold text-slate-700">
          <Star size={16} aria-hidden="true" /> {t('food.saved.title')}
        </h2>
        {templates.length > 0 && (
          <button
            type="button"
            onClick={() => {
              setManaging((m) => !m);
              setEditing(null);
            }}
            aria-pressed={managing}
            className="rounded-lg px-2.5 py-1 text-xs font-medium text-slate-600 ring-1 ring-slate-200 transition hover:bg-slate-50"
          >
            {managing ? t('food.saved.done') : t('food.saved.manage')}
          </button>
        )}
      </div>
      {templates.length === 0 ? (
        <p className="text-sm text-slate-500">{t('food.saved.empty')}</p>
      ) : (
        <ul className={managing ? 'divide-y divide-slate-100' : 'flex flex-wrap gap-2'}>
          {templates.map((tpl) => {
            const isMeal = tpl.kind === 'meal';
            const detail = isMeal
              ? t('food.saved.items', { n: tpl.items?.length ?? 0 })
              : amount(tpl.quantity, tpl.unit, t('common.grams'));
            if (!managing) {
              return (
                <li key={tpl.id}>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onLog(tpl)}
                    aria-label={t('food.saved.log', { name: tpl.name })}
                    className="flex max-w-[16rem] items-center gap-2 rounded-full bg-amber-50 px-3.5 py-2 text-sm text-amber-900 ring-1 ring-amber-100 transition hover:bg-amber-100 disabled:opacity-60"
                  >
                    {isMeal ? <Bookmark size={14} aria-hidden="true" /> : <Star size={14} aria-hidden="true" />}
                    <bdi className="truncate font-medium">{tpl.name}</bdi>
                    {detail && <span className="num shrink-0 text-xs text-amber-800">{detail}</span>}
                    <span className="shrink-0 whitespace-nowrap text-xs text-amber-800"><span className="num">{Math.round(Number(tpl.calories) || 0)}</span> {t('common.kcal')}</span>
                  </button>
                </li>
              );
            }
            return (
              <li key={tpl.id} className="flex items-center gap-2 py-2">
                {editing === tpl.id ? (
                  <form
                    className="flex flex-1 items-center gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      saveEdit(tpl);
                    }}
                  >
                    <label htmlFor={`${uid}-rename-${tpl.id}`} className="sr-only">
                      {t('food.saved.renameLabel', { name: tpl.name })}
                    </label>
                    <input
                      id={`${uid}-rename-${tpl.id}`}
                      autoFocus
                      value={draft}
                      maxLength={120}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => e.key === 'Escape' && setEditing(null)}
                      className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                    />
                    <button type="submit" aria-label={t('common.save')} className="rounded-lg p-2 text-emerald-700 hover:bg-emerald-50">
                      <Check size={16} aria-hidden="true" />
                    </button>
                    <button type="button" onClick={() => setEditing(null)} aria-label={t('common.cancel')} className="rounded-lg p-2 text-slate-500 hover:bg-slate-50">
                      <X size={16} aria-hidden="true" />
                    </button>
                  </form>
                ) : (
                  <>
                    <span className="min-w-0 flex-1">
                      <bdi className="block truncate text-sm font-medium text-slate-800">{tpl.name}</bdi>
                      <span className="num block text-xs text-slate-500">
                        {isMeal ? t('food.saved.meal') : t('food.saved.food')}
                        {detail ? ` · ${detail}` : ''} · {Math.round(Number(tpl.calories) || 0)} {t('common.kcal')}
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => startEdit(tpl)}
                      aria-label={t('food.saved.rename', { name: tpl.name })}
                      className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-50 hover:text-slate-700"
                    >
                      <Pencil size={16} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(tpl)}
                      aria-label={t('food.saved.delete', { name: tpl.name })}
                      className="rounded-lg p-2 text-slate-500 transition hover:bg-rose-50 hover:text-rose-500"
                    >
                      <Trash2 size={16} aria-hidden="true" />
                    </button>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
