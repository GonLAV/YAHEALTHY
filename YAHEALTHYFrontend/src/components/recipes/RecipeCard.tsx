import { ReactNode } from 'react';
import {
  Apple, Carrot, ChefHat, ChevronDown, CircleCheck, Clock, CookingPot, Egg, Flame,
  Gauge, Lightbulb, ListOrdered, Salad, ShieldAlert, ShoppingBasket, Thermometer, Timer, Users,
  UtensilsCrossed,
} from 'lucide-react';
import { AddToWeek } from '@/components/AddToWeek';
import { Num } from '@/components/ui/Num';
import { useLanguage } from '@/i18n/LanguageContext';
import type { MealType, Recipe, RecipeStep } from '@/services/api';

/**
 * The API sends a little more than the shared Recipe type declares. Only the
 * calorie basis is read here, so the card can say what the number is per.
 */
export type RecipeWithNutrition = Recipe & {
  nutrition?: { basis?: string; estimated?: boolean | null };
};

export const CATEGORY_ORDER = ['breakfast', 'main', 'salad', 'side', 'snack'];

// Full class strings, so Tailwind sees every one of them.
const CATEGORY_STYLE: Record<string, { icon: ReactNode; tile: string }> = {
  breakfast: { icon: <Egg size={22} />, tile: 'bg-amber-50 text-amber-600' },
  main: { icon: <UtensilsCrossed size={22} />, tile: 'bg-emerald-50 text-emerald-700' },
  salad: { icon: <Salad size={22} />, tile: 'bg-lime-50 text-lime-700' },
  side: { icon: <Carrot size={22} />, tile: 'bg-orange-50 text-orange-600' },
  snack: { icon: <Apple size={22} />, tile: 'bg-sky-50 text-sky-600' },
};
const FALLBACK_STYLE = { icon: <ChefHat size={22} />, tile: 'bg-slate-100 text-slate-500' };

// Heat is one of five fixed words in the recipe data. Translating a closed
// list like this is a label, not a translation of the recipe; anything
// outside it is shown exactly as written.
const HEAT_KEYS: Record<string, string> = {
  'גבוה': 'high',
  'בינוני-גבוה': 'mediumHigh',
  'בינוני': 'medium',
  'בינוני-נמוך': 'mediumLow',
  'נמוך': 'low',
};

const mealFor = (category: string): MealType =>
  category === 'breakfast' ? 'breakfast' : category === 'snack' ? 'snack' : 'dinner';

const Chip = ({
  icon,
  className,
  children,
  ...attrs
}: {
  icon: ReactNode;
  className: string;
  children: ReactNode;
  lang?: string;
  dir?: 'ltr' | 'rtl';
}) => (
  <span {...attrs} className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${className}`}>
    {icon}
    <span>{children}</span>
  </span>
);

export const RecipeCard = ({
  recipe,
  open,
  onToggle,
}: {
  recipe: RecipeWithNutrition;
  open: boolean;
  onToggle: () => void;
}) => {
  const { t, lang } = useLanguage();

  // The recipe text itself is written in Hebrew. In English every piece of it
  // is marked as Hebrew, so it keeps its own direction (and punctuation) and a
  // screen reader switches voice; the labels around it stay English.
  const hebrew = lang === 'en' ? ({ lang: 'he', dir: 'rtl' } as const) : {};
  const ui = lang === 'en' ? ({ lang: 'en', dir: 'ltr' } as const) : {};

  const title = lang === 'en' && recipe.name_en ? recipe.name_en : recipe.name;
  const titleIsHebrew = title === recipe.name;
  const style = CATEGORY_STYLE[recipe.category] ?? FALLBACK_STYLE;
  const label = (prefix: string, value: string) => {
    const key = `recipes.${prefix}.${value}`;
    const text = t(key);
    return text === key ? value : text;
  };
  const heatLabel = (heat: string) => (HEAT_KEYS[heat] ? t(`recipes.heat.${HEAT_KEYS[heat]}`) : heat);
  const perServing = recipe.nutrition?.basis === 'per_serving';

  const buttonId = `recipe-button-${recipe.id}`;
  const panelId = `recipe-panel-${recipe.id}`;
  const titleId = `recipe-title-${recipe.id}`;

  const timing = (step: RecipeStep) => (
    <>
      {step.heat && (
        <Chip {...ui} icon={<Flame size={13} aria-hidden />} className="bg-orange-50 text-orange-700 ring-orange-100">
          {heatLabel(step.heat)}
        </Chip>
      )}
      {step.temp_c != null && (
        <Chip {...ui} icon={<Thermometer size={13} aria-hidden />} className="bg-rose-50 text-rose-700 ring-rose-100">
          <Num>{step.temp_c}°C</Num>
        </Chip>
      )}
      {step.minutes != null && (
        <Chip {...ui} icon={<Timer size={13} aria-hidden />} className="bg-sky-50 text-sky-700 ring-sky-100">
          <Num unit={t('recipes.minutes')}>{step.minutes}</Num>
        </Chip>
      )}
    </>
  );

  return (
    <article className="rounded-2xl bg-white shadow-sm ring-1 ring-slate-100">
      <h2>
        <button
          id={buttonId}
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={panelId}
          className={`flex w-full items-center gap-3 p-4 text-start transition hover:bg-slate-50/70 md:gap-4 md:p-5 ${
            open ? 'rounded-t-2xl' : 'rounded-2xl'
          }`}
        >
          <span aria-hidden className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${style.tile}`}>
            {style.icon}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-semibold text-slate-500">{label('category', recipe.category)}</span>
            <span
              id={titleId}
              {...(titleIsHebrew ? hebrew : {})}
              className="mt-0.5 block text-base font-bold leading-snug text-slate-900 md:text-lg"
            >
              {title}
            </span>
            <span className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
              <span className="inline-flex items-center gap-1.5">
                <Clock size={15} aria-hidden className="text-slate-400" />
                <span>
                  <Num unit={t('recipes.minutes')}>{recipe.time_minutes}</Num>
                </span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Gauge size={15} aria-hidden className="text-slate-400" />
                <span>
                  <span className="sr-only">{t('recipes.difficulty.label')}: </span>
                  {label('difficulty', recipe.difficulty)}
                </span>
              </span>
              {recipe.servings ? (
                <span className="inline-flex items-center gap-1.5">
                  <Users size={15} aria-hidden className="text-slate-400" />
                  <span>
                    <Num unit={t(recipe.servings === 1 ? 'recipes.serving' : 'recipes.servings')}>{recipe.servings}</Num>
                  </span>
                </span>
              ) : null}
              <span className="inline-flex items-center gap-1.5">
                <Flame size={15} aria-hidden className="text-slate-400" />
                <span>
                  <Num unit={t(perServing ? 'recipes.kcalPerServing' : 'common.kcal')}>{recipe.calories}</Num>
                </span>
              </span>
            </span>
          </span>
          <ChevronDown
            size={20}
            aria-hidden
            className={`shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}
          />
        </button>
      </h2>

      <div id={panelId} role="region" aria-labelledby={titleId} hidden={!open}>
        {open && (
          <div className="space-y-6 border-t border-slate-100 px-4 pb-5 pt-5 md:px-6 md:pb-6">
            {lang === 'en' && recipe.name_en && (
              <p className="text-sm text-slate-500">
                {t('recipes.hebrewName')}:{' '}
                <span {...hebrew} className="font-semibold text-slate-700">{recipe.name}</span>
              </p>
            )}

            {(recipe.safety || recipe.vessel) && (
              <div className="space-y-3">
                {recipe.safety && (
                  <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4">
                    <ShieldAlert size={20} aria-hidden className="mt-0.5 shrink-0 text-red-600" />
                    <p className="text-sm font-semibold text-red-900">
                      {t('recipes.safety')}: <span {...hebrew}>{recipe.safety}</span>
                    </p>
                  </div>
                )}
                {recipe.vessel && (
                  <p className="flex items-start gap-2.5 text-sm text-slate-700">
                    <CookingPot size={18} aria-hidden className="mt-0.5 shrink-0 text-slate-400" />
                    <span>
                      <span className="font-semibold text-slate-900">{t('recipes.vessel')}:</span>{' '}
                      <span {...hebrew}>{recipe.vessel}</span>
                    </span>
                  </p>
                )}
              </div>
            )}

            <div className="grid gap-6 lg:grid-cols-5">
              <section aria-labelledby={`${titleId}-ingredients`} className="lg:col-span-2">
                <h3 id={`${titleId}-ingredients`} className="flex items-center gap-2 font-bold text-slate-900">
                  <ShoppingBasket size={18} aria-hidden className="text-emerald-700" />
                  {t('recipes.ingredients')}
                </h3>
                <ul className="mt-3 divide-y divide-slate-200/70 rounded-2xl bg-slate-50 px-4">
                  {recipe.ingredients.map((ing, i) => (
                    <li key={i} {...hebrew} className="flex flex-wrap items-baseline gap-x-3 py-2.5">
                      <span className="font-medium text-slate-800">{ing.item}</span>
                      <span className="ms-auto text-end text-sm text-slate-500">{ing.amount}</span>
                    </li>
                  ))}
                </ul>
              </section>

              <section aria-labelledby={`${titleId}-steps`} className="lg:col-span-3">
                <h3 id={`${titleId}-steps`} className="flex items-center gap-2 font-bold text-slate-900">
                  <ListOrdered size={18} aria-hidden className="text-emerald-700" />
                  {t('recipes.steps')}
                </h3>
                <ol role="list" className="mt-3 space-y-4">
                  {recipe.steps.map((step) => {
                    const hasTiming = step.heat || step.temp_c != null || step.minutes != null;
                    return (
                      <li key={step.step} {...hebrew} className="flex gap-3">
                        <span
                          aria-hidden
                          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-700 text-sm font-bold text-white"
                        >
                          <Num>{step.step}</Num>
                        </span>
                        <div className="min-w-0 flex-1 pt-0.5">
                          <p className="leading-relaxed text-slate-800">{step.text}</p>
                          {hasTiming && <div className="mt-2 flex flex-wrap gap-1.5">{timing(step)}</div>}
                          {step.cue && (
                            <p className="mt-2 flex items-start gap-1.5 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                              <CircleCheck size={16} aria-hidden className="mt-0.5 shrink-0 text-emerald-700" />
                              <span>
                                <span {...ui} className="font-semibold">{t('recipes.cue')}:</span> {step.cue}
                              </span>
                            </p>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </section>
            </div>

            {((recipe.tips && recipe.tips.length > 0) || recipe.chef_note) && (
              <div className={`grid gap-4 ${recipe.tips?.length && recipe.chef_note ? 'lg:grid-cols-2' : ''}`}>
                {recipe.tips && recipe.tips.length > 0 && (
                  <section aria-labelledby={`${titleId}-tips`} className="rounded-2xl bg-white p-4 ring-1 ring-slate-100">
                    <h3 id={`${titleId}-tips`} className="flex items-center gap-2 font-bold text-slate-900">
                      <Lightbulb size={18} aria-hidden className="text-amber-500" />
                      {t('recipes.tips')}
                    </h3>
                    <ul className="mt-2 space-y-2">
                      {recipe.tips.map((tip, i) => (
                        <li key={i} {...hebrew} className="flex gap-2 text-sm leading-relaxed text-slate-700">
                          <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                          <span>{tip}</span>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
                {recipe.chef_note && (
                  <div className="flex items-start gap-3 rounded-2xl bg-amber-50 p-4 ring-1 ring-amber-100">
                    <ChefHat size={20} aria-hidden className="mt-0.5 shrink-0 text-amber-600" />
                    <p className="text-sm leading-relaxed text-amber-900">
                      <span className="font-semibold">{t('recipes.chefNote')}:</span>{' '}
                      <span {...hebrew}>{recipe.chef_note}</span>
                    </p>
                  </div>
                )}
              </div>
            )}

            <div>
              {recipe.nutrition?.estimated === true && (
                <p className="text-xs text-slate-500">{t('recipes.caloriesEstimated')}</p>
              )}
              <AddToWeek recipeId={recipe.id} defaultMeal={mealFor(recipe.category)} />
            </div>
          </div>
        )}
      </div>
    </article>
  );
};

export default RecipeCard;
