import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  UserCircle, HeartPulse, Salad, Shield, AlertTriangle,
  Save, Check, Loader2,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/i18n/LanguageContext';
import { PageHeader } from '@/components/ui/PageHeader';
import { profileApi, Survey, DietaryPreferences } from '@/services/api';

const DIET_TYPES = ['omnivore', 'vegetarian', 'vegan', 'keto', 'paleo', 'mediterranean'];
const ALLERGIES = ['gluten', 'dairy', 'nuts', 'eggs', 'soy', 'shellfish', 'fish'];
const GENDERS = ['male', 'female', 'non-binary', 'other'];
const LIFESTYLES = ['sedentary', 'light', 'moderate', 'active', 'very_active'];

const inputClass =
  'w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-100';

const labelClass = 'mb-1.5 block text-sm font-medium text-slate-700';

const selectClass = `${inputClass} appearance-none bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20width%3D%2212%22%20height%3D%208%22%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%3E%3Cpath%20d%3D%22M1%201l5%205%205-5%22%20stroke%3D%22%2394a3b8%22%20stroke-width%3D%221.5%22%20fill%3D%22none%22%20stroke-linecap%3D%22round%22/%3E%3C/svg%3E')] bg-[length:12px] bg-[right_0.75rem_center] bg-no-repeat pe-8`;

function SuccessBanner({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
      <Check size={16} />
      {message}
    </div>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
      {message}
    </div>
  );
}

function SectionCard({
  icon, title, subtitle, children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-100">
      <div className="mb-5 flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
          {icon}
        </span>
        <div>
          <h2 className="font-semibold text-slate-900">{title}</h2>
          {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
        </div>
      </div>
      {children}
    </div>
  );
}

export const ProfilePage = () => {
  const { user, logout } = useAuth();
  const { t, lang } = useLanguage();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);

  // Name
  const [name, setName] = useState('');
  const [nameSaving, setNameSaving] = useState(false);
  const [nameSuccess, setNameSuccess] = useState(false);

  // Health metrics
  const [latestSurvey, setLatestSurvey] = useState<Survey | null>(null);
  const [healthForm, setHealthForm] = useState({
    gender: 'male',
    age: '',
    heightCm: '',
    weightKg: '',
    targetWeightKg: '',
    targetDays: '90',
    lifestyle: 'moderate',
  });
  const [healthSaving, setHealthSaving] = useState(false);
  const [healthSuccess, setHealthSuccess] = useState(false);
  const [healthError, setHealthError] = useState('');

  // Dietary preferences
  const [dietType, setDietType] = useState('omnivore');
  const [allergies, setAllergies] = useState<string[]>([]);
  const [dietSaving, setDietSaving] = useState(false);
  const [dietSuccess, setDietSuccess] = useState(false);

  // Security
  const [pwForm, setPwForm] = useState({ old: '', new: '', confirm: '' });
  const [pwSaving, setPwSaving] = useState(false);
  const [pwError, setPwError] = useState('');
  const [pwSuccess, setPwSuccess] = useState(false);

  // Danger zone
  const [deletePw, setDeletePw] = useState('');
  const [deleteSaving, setDeleteSaving] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const fetchAll = useCallback(async () => {
    try {
      const [prefsRes, surveysRes] = await Promise.all([
        profileApi.getPreferences(),
        profileApi.getSurveys(),
      ]);

      const prefs = prefsRes.data?.preferences as DietaryPreferences || {};
      if (prefs.dietType) setDietType(prefs.dietType);
      if (Array.isArray(prefs.allergies)) setAllergies(prefs.allergies);

      const surveys = surveysRes.data || [];
      if (surveys.length > 0) {
        const latest = surveys[0];
        setLatestSurvey(latest);
        setHealthForm({
          gender: latest.gender || 'male',
          age: String(latest.age || ''),
          heightCm: String(latest.height_cm || ''),
          weightKg: String(latest.weight_kg || ''),
          targetWeightKg: String(latest.target_weight_kg || ''),
          targetDays: String(latest.target_days || '90'),
          lifestyle: latest.lifestyle || 'moderate',
        });
      }
    } catch (err) {
      console.error('Failed to load profile data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user?.name) setName(user.name);
    fetchAll();
  }, [user, fetchAll]);

  // ── Handlers ──

  const handleSaveName = async (e: React.FormEvent) => {
    e.preventDefault();
    setNameSaving(true);
    setNameSuccess(false);
    try {
      await profileApi.updateName(name);
      setNameSuccess(true);
      setTimeout(() => setNameSuccess(false), 3000);
    } catch {
      // ignore
    } finally {
      setNameSaving(false);
    }
  };

  const handleSaveHealth = async (e: React.FormEvent) => {
    e.preventDefault();
    setHealthError('');
    setHealthSuccess(false);
    setHealthSaving(true);
    try {
      const res = await profileApi.createSurvey({
        gender: healthForm.gender,
        age: parseInt(healthForm.age, 10),
        heightCm: parseFloat(healthForm.heightCm),
        weightKg: parseFloat(healthForm.weightKg),
        targetWeightKg: parseFloat(healthForm.targetWeightKg),
        targetDays: parseInt(healthForm.targetDays, 10),
        lifestyle: healthForm.lifestyle,
      });
      setLatestSurvey(res.data);
      setHealthSuccess(true);
      setTimeout(() => setHealthSuccess(false), 3000);
    } catch (err: any) {
      setHealthError(err.response?.data?.error || t('common.error'));
    } finally {
      setHealthSaving(false);
    }
  };

  const toggleAllergy = (a: string) => {
    setAllergies((prev) =>
      prev.includes(a) ? prev.filter((x) => x !== a) : [...prev, a],
    );
  };

  const handleSaveDiet = async (e: React.FormEvent) => {
    e.preventDefault();
    setDietSaving(true);
    setDietSuccess(false);
    try {
      await profileApi.updatePreferences({ dietType, allergies });
      setDietSuccess(true);
      setTimeout(() => setDietSuccess(false), 3000);
    } catch {
      // ignore
    } finally {
      setDietSaving(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwError('');
    setPwSuccess(false);

    if (pwForm.new.length < 10) {
      setPwError(t('profile.passwordTooShort'));
      return;
    }
    if (pwForm.new !== pwForm.confirm) {
      setPwError(t('profile.passwordMismatch'));
      return;
    }

    setPwSaving(true);
    try {
      const res = await profileApi.changePassword(pwForm.old, pwForm.new);
      if (res.data?.token) {
        localStorage.setItem('token', res.data.token);
      }
      setPwForm({ old: '', new: '', confirm: '' });
      setPwSuccess(true);
      setTimeout(() => setPwSuccess(false), 3000);
    } catch (err: any) {
      setPwError(err.response?.data?.error || t('profile.wrongPassword'));
    } finally {
      setPwSaving(false);
    }
  };

  const handleDeleteAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setDeleteError('');
    setDeleteSaving(true);
    try {
      await profileApi.deleteAccount(deletePw);
      await logout();
      navigate('/login');
    } catch (err: any) {
      setDeleteError(err.response?.data?.error || t('common.error'));
    } finally {
      setDeleteSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-emerald-200 border-t-emerald-600" />
      </div>
    );
  }

  const fmtDate = (iso?: string) =>
    iso
      ? new Date(iso).toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-US', {
          day: 'numeric', month: 'short', year: 'numeric',
        })
      : '';

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 md:p-8">
      <PageHeader
        title={t('profile.title')}
        subtitle={t('profile.subtitle')}
        icon={<UserCircle size={24} />}
      />

      {/* ── Personal Info ── */}
      <SectionCard icon={<UserCircle size={22} />} title={t('profile.personalInfo')}>
        <form onSubmit={handleSaveName} className="space-y-4">
          <div>
            <label className={labelClass} htmlFor="profile-name">{t('profile.name')}</label>
            <input
              id="profile-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputClass}
              maxLength={100}
              required
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="profile-email">{t('profile.email')}</label>
            <input
              id="profile-email"
              type="email"
              value={user?.email || ''}
              disabled
              className={`${inputClass} cursor-not-allowed opacity-60`}
            />
          </div>
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={nameSaving || name === (user?.name || '')}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-6 py-2.5 font-semibold text-white shadow-md shadow-emerald-200 transition hover:bg-emerald-700 disabled:opacity-60"
            >
              {nameSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              {t('profile.saveName')}
            </button>
            {nameSuccess && <SuccessBanner message={t('profile.nameSaved')} />}
          </div>
        </form>
      </SectionCard>

      {/* ── Health Metrics ── */}
      <SectionCard
        icon={<HeartPulse size={22} />}
        title={t('profile.healthMetrics')}
        subtitle={t('profile.healthSubtitle')}
      >
        {latestSurvey && (
          <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl bg-slate-50 p-3 text-center">
              <div className="text-xs font-medium text-slate-500">{t('profile.bmi')}</div>
              <div className="num mt-0.5 text-lg font-bold text-slate-900">{latestSurvey.bmi}</div>
            </div>
            <div className="rounded-xl bg-slate-50 p-3 text-center">
              <div className="text-xs font-medium text-slate-500">{t('profile.dailyCalories')}</div>
              <div className="num mt-0.5 text-lg font-bold text-slate-900">{latestSurvey.daily_calories}</div>
            </div>
            <div className="rounded-xl bg-slate-50 p-3 text-center">
              <div className="text-xs font-medium text-slate-500">{t('profile.waterTarget')}</div>
              <div className="num mt-0.5 text-lg font-bold text-slate-900">{latestSurvey.water_target_liters}{'L'}</div>
            </div>
            <div className="rounded-xl bg-slate-50 p-3 text-center">
              <div className="text-xs font-medium text-slate-500">{t('profile.sleepTarget')}</div>
              <div className="num mt-0.5 text-lg font-bold text-slate-900">{latestSurvey.sleep_target_hours}{'h'}</div>
            </div>
          </div>
        )}
        {latestSurvey && (
          <p className="mb-4 text-xs text-slate-400">
            {t('profile.lastUpdated')}: {fmtDate(latestSurvey.created_at)}
          </p>
        )}
        <form onSubmit={handleSaveHealth} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass} htmlFor="gender">{t('profile.gender')}</label>
              <select
                id="gender"
                value={healthForm.gender}
                onChange={(e) => setHealthForm({ ...healthForm, gender: e.target.value })}
                className={selectClass}
              >
                {GENDERS.map((g) => (
                  <option key={g} value={g}>{t(`profile.${g === 'non-binary' ? 'nonBinary' : g}`)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass} htmlFor="age">{t('profile.age')}</label>
              <input
                id="age"
                type="number"
                min="10"
                max="120"
                value={healthForm.age}
                onChange={(e) => setHealthForm({ ...healthForm, age: e.target.value })}
                className={`${inputClass} num`}
                required
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="height">{t('profile.height')}</label>
              <input
                id="height"
                type="number"
                min="100"
                max="250"
                value={healthForm.heightCm}
                onChange={(e) => setHealthForm({ ...healthForm, heightCm: e.target.value })}
                className={`${inputClass} num`}
                required
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="weight">{t('profile.weight')}</label>
              <input
                id="weight"
                type="number"
                step="0.1"
                min="30"
                max="300"
                value={healthForm.weightKg}
                onChange={(e) => setHealthForm({ ...healthForm, weightKg: e.target.value })}
                className={`${inputClass} num`}
                required
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="targetWeight">{t('profile.targetWeight')}</label>
              <input
                id="targetWeight"
                type="number"
                step="0.1"
                min="30"
                max="300"
                value={healthForm.targetWeightKg}
                onChange={(e) => setHealthForm({ ...healthForm, targetWeightKg: e.target.value })}
                className={`${inputClass} num`}
                required
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="targetDays">{t('profile.targetDays')}</label>
              <input
                id="targetDays"
                type="number"
                min="1"
                max="365"
                value={healthForm.targetDays}
                onChange={(e) => setHealthForm({ ...healthForm, targetDays: e.target.value })}
                className={`${inputClass} num`}
                required
              />
            </div>
          </div>
          <div>
            <label className={labelClass} htmlFor="lifestyle">{t('profile.lifestyle')}</label>
            <select
              id="lifestyle"
              value={healthForm.lifestyle}
              onChange={(e) => setHealthForm({ ...healthForm, lifestyle: e.target.value })}
              className={selectClass}
            >
              {LIFESTYLES.map((l) => (
                <option key={l} value={l}>
                  {t(`profile.${l === 'very_active' ? 'veryActive' : l}`)}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={healthSaving}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-6 py-2.5 font-semibold text-white shadow-md shadow-emerald-200 transition hover:bg-emerald-700 disabled:opacity-60"
            >
              {healthSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              {t('profile.saveHealth')}
            </button>
            {healthSuccess && <SuccessBanner message={t('profile.healthSaved')} />}
          </div>
          {healthError && <ErrorBanner message={healthError} />}
        </form>
      </SectionCard>

      {/* ── Dietary Preferences ── */}
      <SectionCard
        icon={<Salad size={22} />}
        title={t('profile.dietaryPrefs')}
        subtitle={t('profile.dietarySubtitle')}
      >
        <form onSubmit={handleSaveDiet} className="space-y-5">
          <div>
            <label className={labelClass} htmlFor="dietType">{t('profile.dietType')}</label>
            <select
              id="dietType"
              value={dietType}
              onChange={(e) => setDietType(e.target.value)}
              className={selectClass}
            >
              {DIET_TYPES.map((d) => (
                <option key={d} value={d}>{t(`profile.${d}`)}</option>
              ))}
            </select>
          </div>
          <div>
            <span className={labelClass}>{t('profile.allergies')}</span>
            <div className="flex flex-wrap gap-2">
              {ALLERGIES.map((a) => {
                const active = allergies.includes(a);
                return (
                  <button
                    key={a}
                    type="button"
                    onClick={() => toggleAllergy(a)}
                    className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                      active
                        ? 'bg-rose-100 text-rose-700 ring-2 ring-rose-300'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                    aria-pressed={active}
                  >
                    {t(`profile.${a}`)}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={dietSaving}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-6 py-2.5 font-semibold text-white shadow-md shadow-emerald-200 transition hover:bg-emerald-700 disabled:opacity-60"
            >
              {dietSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              {t('profile.saveDietary')}
            </button>
            {dietSuccess && <SuccessBanner message={t('profile.dietarySaved')} />}
          </div>
        </form>
      </SectionCard>

      {/* ── Security ── */}
      <SectionCard icon={<Shield size={22} />} title={t('profile.security')}>
        <form onSubmit={handleChangePassword} className="space-y-4">
          <div>
            <label className={labelClass} htmlFor="oldPw">{t('profile.oldPassword')}</label>
            <input
              id="oldPw"
              type="password"
              value={pwForm.old}
              onChange={(e) => setPwForm({ ...pwForm, old: e.target.value })}
              className={inputClass}
              required
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass} htmlFor="newPw">{t('profile.newPassword')}</label>
              <input
                id="newPw"
                type="password"
                value={pwForm.new}
                onChange={(e) => setPwForm({ ...pwForm, new: e.target.value })}
                className={inputClass}
                required
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="confirmPw">{t('profile.confirmNewPassword')}</label>
              <input
                id="confirmPw"
                type="password"
                value={pwForm.confirm}
                onChange={(e) => setPwForm({ ...pwForm, confirm: e.target.value })}
                className={inputClass}
                required
              />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={pwSaving}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-800 px-6 py-2.5 font-semibold text-white transition hover:bg-slate-900 disabled:opacity-60"
            >
              {pwSaving ? <Loader2 size={16} className="animate-spin" /> : <Shield size={16} />}
              {t('profile.changePassword')}
            </button>
            {pwSuccess && <SuccessBanner message={t('profile.passwordChanged')} />}
          </div>
          {pwError && <ErrorBanner message={pwError} />}
        </form>
      </SectionCard>

      {/* ── Danger Zone ── */}
      <div className="rounded-3xl border-2 border-rose-200 bg-rose-50/50 p-6">
        <div className="mb-5 flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-rose-100 text-rose-600">
            <AlertTriangle size={22} />
          </span>
          <div>
            <h2 className="font-semibold text-rose-900">{t('profile.dangerZone')}</h2>
            <p className="text-sm text-rose-600">{t('profile.deleteWarning')}</p>
          </div>
        </div>
        <form onSubmit={handleDeleteAccount} className="space-y-3">
          <div>
            <label className={labelClass} htmlFor="deletePw">{t('profile.confirmDelete')}</label>
            <input
              id="deletePw"
              type="password"
              value={deletePw}
              onChange={(e) => setDeletePw(e.target.value)}
              className={`${inputClass} border-rose-200 bg-white`}
              required
            />
          </div>
          <button
            type="submit"
            disabled={deleteSaving || !deletePw}
            className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-6 py-2.5 font-semibold text-white transition hover:bg-rose-700 disabled:opacity-60"
          >
            {deleteSaving ? <Loader2 size={16} className="animate-spin" /> : <AlertTriangle size={16} />}
            {t('profile.delete')}
          </button>
          {deleteError && <ErrorBanner message={deleteError} />}
        </form>
      </div>
    </div>
  );
};
