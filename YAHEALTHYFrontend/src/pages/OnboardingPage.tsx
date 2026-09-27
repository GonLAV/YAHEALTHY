import { FormEvent, Fragment, ReactNode, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertCircle, ArrowLeft, ArrowRight, Check, GlassWater, Heart, Languages, Info, ShieldAlert,
} from 'lucide-react';
import {
  ActivityLevel, OnboardingGoal, TargetsPreview, TargetsPreviewInput,
  hydrationApi, onboardingApi, preferencesApi, weightApi,
} from '@/services/api';
import { useLanguage } from '@/i18n/LanguageContext';
import { useOnboarding } from '@/hooks/useOnboarding';
import { todayISO } from '@/utils/date';

/*
 * Onboarding wizard. Six steps, each a <form> wrapping a <fieldset>/<legend>,
 * so Enter advances and screen readers announce the group. Focus moves to the
 * step heading on every step change.
 *
 * Nothing here calculates a target: step 4 asks the backend
 * (/api/onboarding/targets-preview), which uses the same calculators and
 * safety floors as the rest of the app. The wizard saves through the existing
 * endpoints (preferences, weight goals, hydration logs) and then marks
 * onboarding complete, before the "first win" step, so leaving at the last
 * step still counts as finished.
 */

const GOALS: OnboardingGoal[] = [
  'lose_weight', 'maintain_weight', 'gain_weight', 'eat_healthier', 'sleep_better', 'more_energy',
];
const ACTIVITY_LEVELS: ActivityLevel[] = ['sedentary', 'light', 'moderate', 'active', 'very_active'];
const DIETS = ['vegetarian', 'vegan', 'kosher', 'gluten_free', 'lactose_free'] as const;
type Diet = (typeof DIETS)[number];

const STEPS = ['goal', 'body', 'diet', 'targets', 'reminders', 'firstWin'] as const;
type StepKey = (typeof STEPS)[number];

const FIRST_WIN_LITERS = 0.25;

interface Answers {
  goal: OnboardingGoal | '';
  sex: 'male' | 'female' | '';
  ageMode: 'age' | 'birthYear';
  ageValue: string;
  heightCm: string;
  weightKg: string;
  targetWeightKg: string;
  activityLevel: ActivityLevel | '';
  diets: Record<Diet, boolean>;
  allergies: string;
  calories: string;
  proteinG: string;
  carbsG: string;
  fatG: string;
  waterLiters: string;
  sleepHours: string;
  reminders: { whatsapp: boolean; email: boolean };
}

const INITIAL: Answers = {
  goal: '',
  sex: '',
  ageMode: 'age',
  ageValue: '',
  heightCm: '',
  weightKg: '',
  targetWeightKg: '',
  activityLevel: '',
  diets: { vegetarian: false, vegan: false, kosher: false, gluten_free: false, lactose_free: false },
  allergies: '',
  calories: '',
  proteinG: '',
  carbsG: '',
  fatG: '',
  waterLiters: '',
  sleepHours: '',
  reminders: { whatsapp: false, email: false },
};

// Per-viewer convenience only: a reload mid-wizard keeps the answers.
const DRAFT_KEY = 'yahealthy-onboarding-draft';
const loadDraft = (): Answers => {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    if (raw) return { ...INITIAL, ...JSON.parse(raw) };
  } catch {
    /* storage unavailable */
  }
  return INITIAL;
};
const saveDraft = (a: Answers) => {
  try {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(a));
  } catch {
    /* storage unavailable */
  }
};
const clearDraft = () => {
  try {
    sessionStorage.removeItem(DRAFT_KEY);
  } catch {
    /* storage unavailable */
  }
};

const num = (s: string): number | null => {
  if (s.trim() === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};
const inRange = (s: string, min: number, max: number) => {
  const n = num(s);
  return n !== null && n >= min && n <= max;
};

type BodyErrors = Partial<Record<'sex' | 'age' | 'height' | 'weight' | 'target' | 'activity', string>>;

export const OnboardingPage = () => {
  const { t, lang, toggleLang } = useLanguage();
  const { markComplete } = useOnboarding();
  const navigate = useNavigate();

  const [answers, setAnswers] = useState<Answers>(loadDraft);
  const [step, setStep] = useState(0);
  const [error, setError] = useState('');
  const [bodyErrors, setBodyErrors] = useState<BodyErrors>({});
  const [basicsSkipped, setBasicsSkipped] = useState(false);
  const [preview, setPreview] = useState<TargetsPreview | null>(null);
  const [previewKey, setPreviewKey] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewFailed, setPreviewFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [winState, setWinState] = useState<'idle' | 'logging' | 'done' | 'failed'>('idle');

  const headingRef = useRef<HTMLHeadingElement>(null);
  const dashboardButtonRef = useRef<HTMLButtonElement>(null);
  const firstRender = useRef(true);

  const stepKey: StepKey = STEPS[step];
  const total = STEPS.length;

  useEffect(() => saveDraft(answers), [answers]);

  // Move focus to the new step's heading so keyboard and screen reader users
  // land at the top of the step rather than on a button that has moved.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    headingRef.current?.focus();
  }, [step]);

  useEffect(() => {
    if (winState === 'done') dashboardButtonRef.current?.focus();
  }, [winState]);

  const set = <K extends keyof Answers>(key: K, value: Answers[K]) =>
    setAnswers((prev) => ({ ...prev, [key]: value }));

  // ── body basics ───────────────────────────────────────────────────────────
  const thisYear = new Date().getFullYear();
  const validateBody = (a: Answers): BodyErrors => {
    const errs: BodyErrors = {};
    if (!a.sex) errs.sex = t('onb.err.sex');
    if (a.ageMode === 'age' ? !inRange(a.ageValue, 10, 120) : !inRange(a.ageValue, thisYear - 120, thisYear - 10)) {
      errs.age = a.ageMode === 'age' ? t('onb.err.age') : t('onb.err.birthYear');
    }
    if (!inRange(a.heightCm, 100, 250)) errs.height = t('onb.err.height');
    if (!inRange(a.weightKg, 30, 300)) errs.weight = t('onb.err.weight');
    if (a.targetWeightKg.trim() !== '' && !inRange(a.targetWeightKg, 30, 300)) errs.target = t('onb.err.weight');
    if (!a.activityLevel) errs.activity = t('onb.err.activity');
    return errs;
  };
  const basicsValid = !basicsSkipped && Object.keys(validateBody(answers)).length === 0;

  const previewInput = (): TargetsPreviewInput | null => {
    if (!basicsValid || !answers.goal || !answers.sex || !answers.activityLevel) return null;
    const ageNum = Number(answers.ageValue);
    return {
      goal: answers.goal,
      sex: answers.sex,
      ...(answers.ageMode === 'age' ? { age: Math.floor(ageNum) } : { birthYear: Math.floor(ageNum) }),
      heightCm: Number(answers.heightCm),
      weightKg: Number(answers.weightKg),
      targetWeightKg: num(answers.targetWeightKg),
      activityLevel: answers.activityLevel,
    };
  };

  // ── targets preview (step 4) ──────────────────────────────────────────────
  const loadPreview = async (input: TargetsPreviewInput, key: string) => {
    setPreviewLoading(true);
    setPreviewFailed(false);
    try {
      const res = await onboardingApi.previewTargets(input);
      const p = res.data;
      setPreview(p);
      setPreviewKey(key);
      setAnswers((prev) => ({
        ...prev,
        calories: p.calories ? String(p.calories.center) : '',
        proteinG: p.macros ? String(p.macros.proteinG.center) : '',
        carbsG: p.macros ? String(p.macros.carbsG.center) : '',
        fatG: p.macros ? String(p.macros.fatG.center) : '',
        waterLiters: String(p.waterLiters),
        sleepHours: String(p.sleepHours),
      }));
    } catch {
      setPreviewFailed(true);
    } finally {
      setPreviewLoading(false);
    }
  };

  useEffect(() => {
    if (stepKey !== 'targets') return;
    const input = previewInput();
    if (!input) {
      setPreview(null);
      return;
    }
    const key = JSON.stringify(input);
    // Only recalculate (and overwrite edits) when the answers behind it changed.
    if (key !== previewKey) loadPreview(input, key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepKey]);

  // ── navigation ────────────────────────────────────────────────────────────
  const goTo = (next: number) => {
    setError('');
    setStep(Math.max(0, Math.min(total - 1, next)));
  };

  const validateTargets = (): string => {
    if (answers.calories.trim() !== '' && !inRange(answers.calories, 1000, 5000)) return t('onb.err.calories');
    for (const v of [answers.proteinG, answers.carbsG, answers.fatG]) {
      if (v.trim() !== '' && !inRange(v, 0, 1000)) return t('onb.err.macros');
    }
    if (answers.waterLiters.trim() !== '' && !inRange(answers.waterLiters, 0.5, 6)) return t('onb.err.water');
    if (answers.sleepHours.trim() !== '' && !inRange(answers.sleepHours, 4, 12)) return t('onb.err.sleep');
    return '';
  };

  const handleNext = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (stepKey === 'goal' && !answers.goal) {
      setError(t('onb.err.goal'));
      return;
    }
    if (stepKey === 'body') {
      const errs = validateBody(answers);
      setBodyErrors(errs);
      if (Object.keys(errs).length) {
        setError(t('onb.err.fixFields'));
        return;
      }
      setBasicsSkipped(false);
    }
    if (stepKey === 'targets') {
      const msg = validateTargets();
      if (msg) {
        setError(msg);
        return;
      }
    }
    if (stepKey === 'reminders') {
      await saveAll();
      return;
    }
    goTo(step + 1);
  };

  const handleSkipStep = async () => {
    setError('');
    if (stepKey === 'body') {
      setBodyErrors({});
      setBasicsSkipped(true);
    }
    if (stepKey === 'targets') {
      setAnswers((prev) => ({ ...prev, calories: '', proteinG: '', carbsG: '', fatG: '', waterLiters: '', sleepHours: '' }));
    }
    if (stepKey === 'reminders') {
      setAnswers((prev) => ({ ...prev, reminders: { whatsapp: false, email: false } }));
      await saveAll({ whatsapp: false, email: false });
      return;
    }
    goTo(step + 1);
  };

  const skipWizard = async () => {
    try {
      await onboardingApi.complete(true);
    } catch {
      /* the guard fails open; worst case they see the wizard again next time */
    }
    clearDraft();
    markComplete();
    navigate('/dashboard', { replace: true });
  };

  // ── save (end of step 5) ──────────────────────────────────────────────────
  const saveAll = async (remindersOverride?: Answers['reminders']) => {
    setSaving(true);
    setError('');
    try {
      let current: Record<string, unknown> = {};
      try {
        current = (await preferencesApi.get()).data.preferences || {};
      } catch {
        /* nothing stored yet */
      }

      // The server validates macro values as non-negative numbers, so carry
      // over only the ones that are actually set.
      const macroTargets: Record<string, number> = {};
      const existingMacro = (current.macroTargets || {}) as Record<string, unknown>;
      for (const [k, v] of Object.entries(existingMacro)) {
        if (typeof v === 'number' && Number.isFinite(v)) macroTargets[k] = v;
      }
      const setMacro = (k: string, v: string) => {
        const n = num(v);
        if (n !== null) macroTargets[k] = Math.round(n);
      };
      setMacro('calorieOverride', answers.calories);
      setMacro('protein_grams', answers.proteinG);
      setMacro('carbs_grams', answers.carbsG);
      setMacro('fat_grams', answers.fatG);

      const basics = basicsValid
        ? {
            sex: answers.sex,
            ...(answers.ageMode === 'age'
              ? { age: Number(answers.ageValue) }
              : { birthYear: Number(answers.ageValue) }),
            heightCm: Number(answers.heightCm),
            weightKg: Number(answers.weightKg),
            targetWeightKg: num(answers.targetWeightKg),
            activityLevel: answers.activityLevel,
          }
        : null;

      const water = num(answers.waterLiters);
      const sleep = num(answers.sleepHours);
      const next: Record<string, unknown> = {
        ...current,
        onboarding: { goal: answers.goal || null, profile: basics },
        dietary: {
          ...Object.fromEntries(DIETS.map((d) => [d, answers.diets[d]])),
          allergies: answers.allergies.trim(),
        },
        reminders: remindersOverride ?? answers.reminders,
        ...(water !== null ? { waterTargetLiters: water } : {}),
        ...(sleep !== null ? { sleepTargetHours: sleep } : {}),
      };
      if (Object.keys(macroTargets).length) next.macroTargets = macroTargets;
      else delete next.macroTargets;

      await preferencesApi.put(next);

      const target = num(answers.targetWeightKg);
      if (basics && target !== null && target !== basics.weightKg) {
        try {
          await weightApi.createGoal({ startWeightKg: basics.weightKg, targetWeightKg: target });
        } catch {
          /* the goal can be set later on the Weight page; not worth failing onboarding */
        }
      }

      await onboardingApi.complete();
      clearDraft();
      markComplete();
      goTo(STEPS.indexOf('firstWin'));
    } catch {
      setError(t('onb.err.save'));
    } finally {
      setSaving(false);
    }
  };

  const logFirstWater = async () => {
    setWinState('logging');
    try {
      await hydrationApi.add({ date: todayISO(), litersConsumed: FIRST_WIN_LITERS });
      setWinState('done');
    } catch {
      setWinState('failed');
    }
  };

  const finish = () => navigate('/dashboard', { replace: true });

  // ── rendering helpers ─────────────────────────────────────────────────────
  const inputClass =
    'w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-100';
  const invalidClass = 'border-rose-300 bg-rose-50';

  const legend = ({ title, hint }: { title: string; hint?: string }) => (
    <>
      <legend className="mb-1 w-full">
        <h2 ref={headingRef} tabIndex={-1} className="text-xl font-bold text-slate-900 md:text-2xl">
          {title}
        </h2>
      </legend>
      {hint && <p className="mb-5 text-sm text-slate-500">{hint}</p>}
    </>
  );

  const fieldError = ({ id, msg }: { id: string; msg?: string }) =>
    msg ? (
      <p id={id} className="mt-1 text-xs font-medium text-rose-700">
        {msg}
      </p>
    ) : null;

  const describedBy = (...ids: (string | false | undefined)[]) => ids.filter(Boolean).join(' ') || undefined;

  const choiceCard = ({
    name, value, checked, onChange, label, description,
  }: {
    name: string; value: string; checked: boolean; onChange: () => void; label: string; description?: string;
  }) => (
    <label
      className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition focus-within:ring-2 focus-within:ring-emerald-300 ${
        checked ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 bg-white hover:border-emerald-300'
      }`}
    >
      <input type="radio" name={name} value={value} checked={checked} onChange={onChange} className="mt-1 h-4 w-4 accent-emerald-600" />
      <span>
        <span className="block text-sm font-semibold text-slate-900">{label}</span>
        {description && <span className="mt-0.5 block text-xs text-slate-500">{description}</span>}
      </span>
    </label>
  );

  const numberField = ({
    id, label, unitHint, value, onChange, error: errorText, step: inputStep = 'any', optional = false,
  }: {
    id: string; label: string; unitHint: string; value: string; onChange: (v: string) => void;
    error?: string; step?: string; optional?: boolean;
  }) => (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-slate-700">
        {label}
        {optional && <span className="ms-1 font-normal text-slate-400">({t('onb.optional')})</span>}
      </label>
      <input
        id={id}
        type="number"
        inputMode="decimal"
        step={inputStep}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-describedby={describedBy(`${id}-hint`, errorText && `${id}-error`)}
        aria-invalid={errorText ? true : undefined}
        className={`${inputClass} ${errorText ? invalidClass : ''}`}
      />
      <p id={`${id}-hint`} className="mt-1 text-xs text-slate-500">{unitHint}</p>
      {fieldError({ id: `${id}-error`, msg: errorText })}
    </div>
  );

  // ── steps ─────────────────────────────────────────────────────────────────
  const renderGoal = () => (
    <fieldset>
      {legend({ title: t('onb.goal.title'), hint: t('onb.goal.hint') })}
      <div className="grid gap-3 sm:grid-cols-2">
        {GOALS.map((g) => (
          <Fragment key={g}>{choiceCard({ name: 'goal', value: g, checked: answers.goal === g, onChange: () => set('goal', g), label: t(`onb.goal.${g}`), description: t(`onb.goal.${g}.desc`) })}</Fragment>
        ))}
      </div>
    </fieldset>
  );

  const renderBody = () => (
    <fieldset>
      {legend({ title: t('onb.body.title'), hint: t('onb.body.hint') })}
      <div className="space-y-5">
        <fieldset aria-describedby={describedBy('onb-sex-hint', bodyErrors.sex && 'onb-sex-error')}>
          <legend className="mb-1.5 text-sm font-medium text-slate-700">{t('onb.body.sex')}</legend>
          <div className="grid grid-cols-2 gap-3">
            {(['female', 'male'] as const).map((s) => (
              <Fragment key={s}>{choiceCard({ name: 'sex', value: s, checked: answers.sex === s, onChange: () => set('sex', s), label: t(`onb.body.sex.${s}`) })}</Fragment>
            ))}
          </div>
          <p id="onb-sex-hint" className="mt-1 text-xs text-slate-500">{t('onb.body.sexHint')}</p>
          {fieldError({ id: 'onb-sex-error', msg: bodyErrors.sex })}
        </fieldset>

        <fieldset>
          <legend className="mb-1.5 text-sm font-medium text-slate-700">{t('onb.body.ageMode')}</legend>
          <div className="mb-3 flex flex-wrap gap-4 text-sm text-slate-700">
            {(['age', 'birthYear'] as const).map((m) => (
              <label key={m} className="inline-flex items-center gap-2">
                <input
                  type="radio"
                  name="ageMode"
                  value={m}
                  checked={answers.ageMode === m}
                  onChange={() => setAnswers((prev) => ({ ...prev, ageMode: m, ageValue: '' }))}
                  className="h-4 w-4 accent-emerald-600"
                />
                {t(`onb.body.ageMode.${m}`)}
              </label>
            ))}
          </div>
          {numberField({ id: 'onb-age', label: answers.ageMode === 'age' ? t('onb.body.age') : t('onb.body.birthYear'), unitHint: answers.ageMode === 'age' ? t('onb.body.ageHint') : t('onb.body.birthYearHint'), value: answers.ageValue, onChange: (v) => set('ageValue', v), error: bodyErrors.age, step: '1' })}
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          {numberField({ id: 'onb-height', label: t('onb.body.height'), unitHint: t('onb.body.heightHint'), value: answers.heightCm, onChange: (v) => set('heightCm', v), error: bodyErrors.height })}
          {numberField({ id: 'onb-weight', label: t('onb.body.weight'), unitHint: t('onb.body.weightHint'), value: answers.weightKg, onChange: (v) => set('weightKg', v), error: bodyErrors.weight })}
          {numberField({ id: 'onb-target', label: t('onb.body.target'), unitHint: t('onb.body.targetHint'), value: answers.targetWeightKg, onChange: (v) => set('targetWeightKg', v), error: bodyErrors.target, optional: true })}
        </div>

        <div>
          <label htmlFor="onb-activity" className="mb-1.5 block text-sm font-medium text-slate-700">
            {t('onb.body.activity')}
          </label>
          <select
            id="onb-activity"
            value={answers.activityLevel}
            onChange={(e) => set('activityLevel', e.target.value as ActivityLevel)}
            aria-describedby={describedBy(bodyErrors.activity && 'onb-activity-error')}
            aria-invalid={bodyErrors.activity ? true : undefined}
            className={`${inputClass} ${bodyErrors.activity ? invalidClass : ''}`}
          >
            <option value="">{t('onb.body.activityPlaceholder')}</option>
            {ACTIVITY_LEVELS.map((lvl) => (
              <option key={lvl} value={lvl}>
                {t(`onb.activity.${lvl}`)}
              </option>
            ))}
          </select>
          {fieldError({ id: 'onb-activity-error', msg: bodyErrors.activity })}
        </div>
      </div>
    </fieldset>
  );

  const renderDiet = () => (
    <fieldset>
      {legend({ title: t('onb.diet.title'), hint: t('onb.diet.hint') })}
      <div className="grid gap-3 sm:grid-cols-2">
        {DIETS.map((d) => (
          <label
            key={d}
            className={`flex cursor-pointer items-center gap-3 rounded-2xl border p-4 text-sm font-medium transition focus-within:ring-2 focus-within:ring-emerald-300 ${
              answers.diets[d] ? 'border-emerald-500 bg-emerald-50 text-slate-900' : 'border-slate-200 bg-white text-slate-700 hover:border-emerald-300'
            }`}
          >
            <input
              type="checkbox"
              checked={answers.diets[d]}
              onChange={(e) => set('diets', { ...answers.diets, [d]: e.target.checked })}
              className="h-4 w-4 accent-emerald-600"
            />
            {t(`onb.diet.${d}`)}
          </label>
        ))}
      </div>
      <div className="mt-5">
        <label htmlFor="onb-allergies" className="mb-1.5 block text-sm font-medium text-slate-700">
          {t('onb.diet.allergies')}
          <span className="ms-1 font-normal text-slate-400">({t('onb.optional')})</span>
        </label>
        <textarea
          id="onb-allergies"
          rows={2}
          maxLength={300}
          value={answers.allergies}
          onChange={(e) => set('allergies', e.target.value)}
          aria-describedby="onb-allergies-hint"
          className={inputClass}
        />
        <p id="onb-allergies-hint" className="mt-1 text-xs text-slate-500">{t('onb.diet.allergiesHint')}</p>
      </div>
    </fieldset>
  );

  const safetyNotes = (): string[] => {
    const notes: string[] = [];
    if (preview) {
      for (const flag of preview.safety.flags) notes.push(t(`onb.safety.${flag}`));
      const edited = num(answers.calories);
      if (edited !== null && edited < preview.safety.safeCalorieFloor) {
        notes.push(t('onb.safety.editedBelowFloor', { floor: preview.safety.safeCalorieFloor }));
      }
    }
    return notes;
  };

  const renderTargets = () => {
    const notes = safetyNotes();
    return (
      <fieldset>
        {legend({ title: t('onb.targets.title'), hint: t('onb.targets.hint') })}

        <div role="status" aria-live="polite">
          {previewLoading && (
            <p className="flex items-center gap-3 rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">
              <span className="h-5 w-5 animate-spin rounded-full border-4 border-emerald-200 border-t-emerald-600" aria-hidden="true" />
              {t('onb.targets.calculating')}
            </p>
          )}
          {!previewLoading && !preview && (
            <p className="flex items-start gap-2 rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
              <Info size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
              {previewFailed ? t('onb.targets.failed') : t('onb.targets.needBasics')}
            </p>
          )}
          {!previewLoading && preview && (
            <p className="rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-800">
              {preview.calories
                ? t('onb.targets.summary', { low: preview.calories.low, high: preview.calories.high })
                : t('onb.targets.noCalories')}
            </p>
          )}
        </div>

        {notes.length > 0 && (
          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <p className="flex items-center gap-2 font-semibold">
              <ShieldAlert size={16} aria-hidden="true" />
              {t('onb.safety.title')}
            </p>
            <ul className="mt-2 list-disc space-y-1 ps-5">
              {notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          {numberField({ id: 'onb-calories', label: t('onb.targets.calories'), unitHint: t('onb.targets.caloriesHint'), value: answers.calories, onChange: (v) => set('calories', v), step: '10', optional: true })}
          {numberField({ id: 'onb-protein', label: t('onb.targets.protein'), unitHint: t('onb.targets.gramsHint'), value: answers.proteinG, onChange: (v) => set('proteinG', v), step: '1', optional: true })}
          {numberField({ id: 'onb-carbs', label: t('onb.targets.carbs'), unitHint: t('onb.targets.gramsHint'), value: answers.carbsG, onChange: (v) => set('carbsG', v), step: '1', optional: true })}
          {numberField({ id: 'onb-fat', label: t('onb.targets.fat'), unitHint: t('onb.targets.gramsHint'), value: answers.fatG, onChange: (v) => set('fatG', v), step: '1', optional: true })}
          {numberField({ id: 'onb-water', label: t('onb.targets.water'), unitHint: t('onb.targets.waterHint'), value: answers.waterLiters, onChange: (v) => set('waterLiters', v), step: '0.1', optional: true })}
          {numberField({ id: 'onb-sleep', label: t('onb.targets.sleep'), unitHint: t('onb.targets.sleepHint'), value: answers.sleepHours, onChange: (v) => set('sleepHours', v), step: '0.5', optional: true })}
        </div>

        <p className="mt-5 flex items-start gap-2 text-xs text-slate-500">
          <Info size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
          {t('onb.targets.disclaimer')}
        </p>
      </fieldset>
    );
  };

  const renderReminders = () => (
    <fieldset>
      {legend({ title: t('onb.reminders.title'), hint: t('onb.reminders.hint') })}
      <div className="space-y-3">
        {(['whatsapp', 'email'] as const).map((ch) => (
          <label
            key={ch}
            className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition focus-within:ring-2 focus-within:ring-emerald-300 ${
              answers.reminders[ch] ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 bg-white hover:border-emerald-300'
            }`}
          >
            <input
              type="checkbox"
              checked={answers.reminders[ch]}
              onChange={(e) => set('reminders', { ...answers.reminders, [ch]: e.target.checked })}
              className="mt-1 h-4 w-4 accent-emerald-600"
            />
            <span>
              <span className="block text-sm font-semibold text-slate-900">{t(`onb.reminders.${ch}`)}</span>
              <span className="mt-0.5 block text-xs text-slate-500">{t(`onb.reminders.${ch}.desc`)}</span>
            </span>
          </label>
        ))}
      </div>
      <p className="mt-4 text-xs text-slate-500">{t('onb.reminders.changeLater')}</p>
    </fieldset>
  );

  const renderFirstWin = () => (
    <fieldset>
      {legend({ title: t('onb.win.title'), hint: t('onb.win.hint') })}
      <div className="flex flex-col items-center gap-4 rounded-3xl bg-sky-50 p-6 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-sky-100 text-sky-600">
          {winState === 'done' ? <Check size={30} aria-hidden="true" /> : <GlassWater size={30} aria-hidden="true" />}
        </div>
        {winState !== 'done' && (
          <button
            type="button"
            onClick={logFirstWater}
            disabled={winState === 'logging'}
            className="rounded-xl bg-sky-600 px-6 py-3 font-semibold text-white shadow-md shadow-sky-200 transition hover:bg-sky-700 disabled:opacity-60"
          >
            {winState === 'logging' ? t('onb.win.logging') : t('onb.win.logWater')}
          </button>
        )}
        <p role="status" aria-live="polite" className="min-h-[1.25rem] text-sm font-medium text-sky-800">
          {winState === 'done' && t('onb.win.done')}
        </p>
        {winState === 'failed' && (
          <p role="alert" className="text-sm font-medium text-rose-700">{t('onb.win.failed')}</p>
        )}
      </div>
    </fieldset>
  );

  const renderStep: Record<StepKey, () => ReactNode> = {
    goal: renderGoal,
    body: renderBody,
    diet: renderDiet,
    targets: renderTargets,
    reminders: renderReminders,
    firstWin: renderFirstWin,
  };

  const skippable = stepKey === 'body' || stepKey === 'diet' || stepKey === 'targets' || stepKey === 'reminders';
  const BackIcon = lang === 'he' ? ArrowRight : ArrowLeft;
  const NextIcon = lang === 'he' ? ArrowLeft : ArrowRight;

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-teal-50 to-sky-50">
      <a href="#onboarding-main" className="skip-link rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-lg">
        {t('a11y.skipToContent')}
      </a>

      <header className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 pt-6">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-600">
            <Heart size={18} className="text-white" fill="white" aria-hidden="true" />
          </div>
          <span className="text-lg font-extrabold text-slate-900">{t('app.name')}</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleLang}
            aria-label={t('a11y.toggleLang')}
            className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-sm font-semibold text-emerald-700 ring-1 ring-emerald-100 transition hover:bg-emerald-50"
          >
            <Languages size={16} aria-hidden="true" />
            {lang === 'he' ? 'EN' : 'עב'}
          </button>
          {stepKey !== 'firstWin' && (
            <button
              type="button"
              onClick={skipWizard}
              className="rounded-full px-3 py-1.5 text-sm font-medium text-slate-500 transition hover:bg-white hover:text-slate-700"
            >
              {t('onb.skipAll')}
            </button>
          )}
        </div>
      </header>

      <main id="onboarding-main" className="mx-auto max-w-2xl px-4 pb-12 pt-6">
        <h1 className="sr-only">{t('onb.pageTitle')}</h1>

        {/* Progress */}
        <div className="mb-6">
          <p id="onb-progress-label" className="mb-2 text-sm font-medium text-slate-600">
            {t('onb.stepOf', { current: step + 1, total })} · {t(`onb.stepName.${stepKey}`)}
          </p>
          <div
            role="progressbar"
            aria-labelledby="onb-progress-label"
            aria-valuemin={1}
            aria-valuemax={total}
            aria-valuenow={step + 1}
            className="h-2 w-full overflow-hidden rounded-full bg-white ring-1 ring-slate-100"
          >
            <div className="h-2 rounded-full bg-emerald-500 transition-all duration-500" style={{ width: `${((step + 1) / total) * 100}%` }} />
          </div>
          <ol className="mt-3 hidden gap-2 text-xs text-slate-500 sm:flex">
            {STEPS.map((s, i) => (
              <li
                key={s}
                aria-current={i === step ? 'step' : undefined}
                className={`flex-1 truncate text-center ${i === step ? 'font-semibold text-emerald-700' : i < step ? 'text-slate-600' : ''}`}
              >
                {i < step && <span className="sr-only">{t('onb.stepDone')} </span>}
                {t(`onb.stepName.${s}`)}
              </li>
            ))}
          </ol>
        </div>

        <form onSubmit={handleNext} noValidate className="rounded-3xl bg-white p-6 shadow-xl ring-1 ring-slate-100 md:p-8">
          {renderStep[stepKey]()}

          {error && (
            <div role="alert" className="mt-5 flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              <AlertCircle size={16} className="shrink-0" aria-hidden="true" />
              {error}
            </div>
          )}

          <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
            {stepKey === 'firstWin' ? (
              <span />
            ) : (
              <button
                type="button"
                onClick={() => goTo(step - 1)}
                disabled={step === 0 || saving}
                className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 disabled:invisible"
              >
                <BackIcon size={16} aria-hidden="true" />
                {t('onb.back')}
              </button>
            )}

            <div className="flex flex-wrap items-center gap-3">
              {skippable && (
                <button
                  type="button"
                  onClick={handleSkipStep}
                  disabled={saving}
                  className="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-60"
                >
                  {t('onb.skipStep')}
                </button>
              )}
              {stepKey === 'firstWin' ? (
                <button
                  ref={dashboardButtonRef}
                  type="button"
                  onClick={finish}
                  className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-emerald-200 transition hover:bg-emerald-700"
                >
                  {winState === 'done' ? t('onb.win.toDashboard') : t('onb.win.skipToDashboard')}
                  <NextIcon size={16} aria-hidden="true" />
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={saving || previewLoading}
                  className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-emerald-200 transition hover:bg-emerald-700 disabled:opacity-60"
                >
                  {stepKey === 'reminders' ? (saving ? t('onb.saving') : t('onb.saveContinue')) : t('onb.next')}
                  <NextIcon size={16} aria-hidden="true" />
                </button>
              )}
            </div>
          </div>
        </form>
      </main>
    </div>
  );
};

export default OnboardingPage;
