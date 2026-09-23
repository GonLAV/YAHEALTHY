import { useLanguage } from '@/i18n/LanguageContext';

/**
 * What today's calories were actually made of.
 *
 * The three macro bars need a target to mean anything, and a target needs a
 * survey, an approval and a screen that until now did not exist — so for most
 * people they are three empty tracks. This needs none of that: a split is a
 * fact about what was logged, complete on its own, and it is readable on day
 * one.
 *
 * Rendered as a single stacked bar rather than a donut. A donut of three
 * slices asks the eye to compare angles; a stacked bar puts them on one axis,
 * survives being 80px tall on a phone, and needs no chart library.
 *
 * Percentages by calories, not by grams — 30 g of fat and 30 g of carbs are
 * not the same share of a day, and by-grams is the reading that quietly
 * misleads. 4/4/9 kcal per gram are the standard Atwater factors; they are
 * arithmetic on the numbers already stored, not a claim about anyone's body.
 */

const KCAL_PER_GRAM = { protein: 4, carbs: 4, fat: 9 } as const;

const SEGMENTS = [
  { key: 'protein', labelKey: 'dash.protein', bar: 'bg-rose-500', dot: 'bg-rose-500' },
  { key: 'carbs', labelKey: 'dash.carbs', bar: 'bg-sky-500', dot: 'bg-sky-500' },
  { key: 'fat', labelKey: 'dash.fat', bar: 'bg-amber-500', dot: 'bg-amber-500' },
] as const;

export const MacroSplit = ({
  protein, carbs, fat,
}: { protein: number; carbs: number; fat: number }) => {
  const { t } = useLanguage();

  const kcal = {
    protein: protein * KCAL_PER_GRAM.protein,
    carbs: carbs * KCAL_PER_GRAM.carbs,
    fat: fat * KCAL_PER_GRAM.fat,
  };
  const total = kcal.protein + kcal.carbs + kcal.fat;

  // Nothing logged yet: no bar, rather than three zero-width segments or a
  // full-width grey one pretending to be data.
  if (total <= 0) return null;

  const pct = {
    protein: Math.round((kcal.protein / total) * 100),
    carbs: Math.round((kcal.carbs / total) * 100),
    fat: Math.round((kcal.fat / total) * 100),
  };

  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
      <h2 className="mb-4 font-semibold text-slate-900">{t('macroSplit.title')}</h2>

      {/* The bar itself carries no direction: in RTL the first segment simply
          starts at the right, which is where a Hebrew reader begins. The legend
          below names each colour, so the order carries no meaning on its own. */}
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-slate-100">
        {SEGMENTS.map((s) => (
          <div
            key={s.key}
            className={s.bar}
            style={{ width: `${pct[s.key]}%` }}
            role="presentation"
          />
        ))}
      </div>

      <dl className="mt-4 grid grid-cols-3 gap-3">
        {SEGMENTS.map((s) => (
          <div key={s.key}>
            <dt className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
              <span className={`h-2 w-2 shrink-0 rounded-full ${s.dot}`} />
              {t(s.labelKey)}
            </dt>
            <dd className="mt-1">
              {/* .num on the number, never on the label beside it. */}
              <span className="num text-lg font-bold text-slate-900">{pct[s.key]}%</span>
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
};

export default MacroSplit;
