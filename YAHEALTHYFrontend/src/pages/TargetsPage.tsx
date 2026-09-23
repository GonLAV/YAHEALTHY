import { useEffect, useState } from 'react';
import { Target, Check, Info } from 'lucide-react';
import { targetsApi, NutritionTargets } from '@/services/api';
import { useLanguage } from '@/i18n/LanguageContext';
import PageHeader from '@/components/ui/PageHeader';

/**
 * Where a person sets the numbers their dashboard is measured against.
 *
 * Why this screen exists at all: the dashboard told everyone "set your targets
 * for accurate tracking" and there was no way to. No page, no route, no nav
 * entry, and targetsApi exposed only `get`. Underneath, PUT /api/targets called
 * a database function that was never exported, so it answered 500 on every
 * request. The instruction was impossible to follow at four independent layers.
 *
 * Why it is a form and not a calculator: a number the person picks for
 * themselves is theirs. A number this app derives from their body is a clinical
 * claim, and the registry in data/clinical-approvals.json says a personal
 * calculated calorie target is exactly the content that needs a registered
 * professional to sign it off. So the app takes a number here; it does not
 * propose one, and there is deliberately no "calculate for me" button.
 */

// Matching utils/constants.js. The server enforces these; the client only says
// so up front rather than letting someone type a number and get a 400 back.
const CALORIE_MIN = 1200;
const CALORIE_MAX = 5000;
const MACRO_MAX = 500;

type FieldKey = 'calories' | 'protein_grams' | 'carbs_grams' | 'fat_grams';

const FIELDS: Array<{ key: FieldKey; label: string; unit: string; min: number; max: number }> = [
  { key: 'calories', label: 'targets.calories', unit: 'common.kcal', min: CALORIE_MIN, max: CALORIE_MAX },
  { key: 'protein_grams', label: 'targets.protein', unit: 'common.grams', min: 1, max: MACRO_MAX },
  { key: 'carbs_grams', label: 'targets.carbs', unit: 'common.grams', min: 1, max: MACRO_MAX },
  { key: 'fat_grams', label: 'targets.fat', unit: 'common.grams', min: 1, max: MACRO_MAX },
];

type FormState = Record<FieldKey, string>;

const EMPTY_FORM: FormState = {
  calories: '', protein_grams: '', carbs_grams: '', fat_grams: '',
};

const toForm = (targets: NutritionTargets): FormState => ({
  calories: targets.calories != null ? String(targets.calories) : '',
  protein_grams: targets.protein_grams != null ? String(targets.protein_grams) : '',
  carbs_grams: targets.carbs_grams != null ? String(targets.carbs_grams) : '',
  fat_grams: targets.fat_grams != null ? String(targets.fat_grams) : '',
});

export const TargetsPage = () => {
  const { t } = useLanguage();
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    targetsApi
      .get()
      .then((res) => setForm(toForm(res.data.targets)))
      .catch(() => { /* an empty form is the right starting point either way */ })
      .finally(() => setLoading(false));
  }, []);

  const fieldError = (key: FieldKey): boolean => {
    const raw = form[key].trim();
    if (raw === '') return false;
    const n = Number(raw);
    const spec = FIELDS.find((f) => f.key === key)!;
    return !Number.isFinite(n) || n < spec.min || n > spec.max;
  };

  const anyInvalid = FIELDS.some((f) => fieldError(f.key));

  const save = async () => {
    if (anyInvalid) return;
    setSaving(true);
    setError('');
    setSaved(false);

    // An empty field means "no target", not zero — a zero denominator would
    // make every progress bar read 0% forever.
    const payload: Partial<NutritionTargets> = {};
    for (const f of FIELDS) {
      const raw = form[f.key].trim();
      payload[f.key] = raw === '' ? null : Number(raw);
    }

    try {
      const res = await targetsApi.set(payload);
      setForm(toForm(res.data.targets));
      setSaved(true);
    } catch {
      setError(t('targets.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl p-4 md:p-8">
      <PageHeader
        title={t('targets.title')}
        subtitle={t('targets.subtitle')}
        icon={<Target size={24} />}
      />

      <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100 md:p-6">
        <div className="space-y-5">
          {FIELDS.map((f) => {
            const invalid = fieldError(f.key);
            return (
              <div key={f.key}>
                <label
                  htmlFor={`target-${f.key}`}
                  className="mb-1.5 flex items-baseline justify-between text-sm font-medium text-slate-700"
                >
                  <span>{t(f.label)}</span>
                  <span className="text-xs font-normal text-slate-400">{t('targets.optional')}</span>
                </label>

                <div className="flex items-center gap-2">
                  <input
                    id={`target-${f.key}`}
                    type="number"
                    inputMode="numeric"
                    dir="ltr"
                    value={form[f.key]}
                    min={f.min}
                    max={f.max}
                    onChange={(e) => {
                      setForm({ ...form, [f.key]: e.target.value });
                      setSaved(false);
                    }}
                    aria-invalid={invalid}
                    aria-describedby={`hint-${f.key}`}
                    className={`num w-full rounded-xl border px-3.5 py-2.5 text-start text-slate-900 outline-none transition focus:ring-2 ${
                      invalid
                        ? 'border-rose-300 focus:border-rose-400 focus:ring-rose-100'
                        : 'border-slate-200 focus:border-emerald-400 focus:ring-emerald-100'
                    }`}
                  />
                  <span className="shrink-0 text-sm font-medium text-slate-400">{t(f.unit)}</span>
                </div>

                <p
                  id={`hint-${f.key}`}
                  className={`mt-1 text-xs ${invalid ? 'text-rose-600' : 'text-slate-400'}`}
                >
                  {invalid
                    ? t('targets.outOfRange')
                    : t('targets.rangeHint', { min: f.min, max: f.max })}
                </p>
              </div>
            );
          })}
        </div>

        {error && (
          <p className="mt-4 rounded-xl bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700">{error}</p>
        )}

        <div className="mt-6 flex items-center gap-3">
          <button
            onClick={save}
            disabled={saving || loading || anyInvalid}
            className="flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {saved ? <Check size={18} /> : null}
            {saved ? t('targets.saved') : t('targets.save')}
          </button>

          <button
            onClick={() => { setForm(EMPTY_FORM); setSaved(false); }}
            disabled={saving}
            className="rounded-xl px-4 py-2.5 text-sm font-medium text-slate-500 transition hover:text-slate-800"
          >
            {t('targets.clear')}
          </button>
        </div>
      </div>

      {/*
        Said on the screen that takes the number, not only in a document.
        docs/compliance-register.md calls a medical disclaimer the first
        priority and says it has to appear in the app; this is not that text —
        that one is a lawyer's to write — but a screen that accepts a calorie
        target should not stay silent about what it is and is not.
      */}
      <div className="mt-5 flex gap-3 rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-100">
        <Info size={18} className="mt-0.5 shrink-0 text-slate-400" />
        <p className="text-xs leading-relaxed text-slate-500">{t('targets.notAdvice')}</p>
      </div>
    </div>
  );
};

export default TargetsPage;
