import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, Target, Droplets, Bell, ShieldCheck, LogOut, Check } from 'lucide-react';
import { Card, Button, Field, inputCls, ErrorState, Toggle, SkeletonCard, Chip } from '@/components/ui';
import { authApi, targetApi, prefApi, surveyApi, apiError, Targets } from '@/services/api';
import { useAsync } from '@/hooks/useAsync';
import { useToast } from '@/hooks/useToast';
import { useAuth } from '@/hooks/useAuth';

const REMINDERS = [
  { key: 'water', label: 'Drink water', detail: 'Every 2 hours, 09:00–21:00' },
  { key: 'breakfast', label: 'Log breakfast', detail: 'Daily at 09:00' },
  { key: 'lunch', label: 'Log lunch', detail: 'Daily at 12:30' },
  { key: 'dinner', label: 'Log dinner', detail: 'Daily at 19:00' },
  { key: 'weight', label: 'Weekly weigh-in', detail: 'Mondays at 08:00' },
  { key: 'sleep', label: 'Wind down', detail: 'Daily at 22:30' },
];

export const SettingsPage = () => {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { push } = useToast();

  const [targetForm, setTargetForm] = useState({ calories: '', protein: '', carbs: '', fat: '' });
  const [savingTargets, setSavingTargets] = useState(false);
  const [waterGoal, setWaterGoal] = useState('');
  const [savingWater, setSavingWater] = useState(false);
  const [reminders, setReminders] = useState<Record<string, boolean>>({});
  const [notifState, setNotifState] = useState<'unsupported' | 'default' | 'granted' | 'denied'>('unsupported');
  const [pwForm, setPwForm] = useState({ old: '', new_: '', confirm: '' });
  const [savingPw, setSavingPw] = useState(false);

  const load = useCallback(async () => {
    const [targets, prefs, surveys] = await Promise.all([
      targetApi.get().then((r) => r.data.targets as Targets),
      prefApi.get().catch(() => ({})),
      surveyApi.list().then((r) => r.data || []),
    ]);
    return { targets, prefs, survey: surveys[0] ?? null };
  }, []);
  const { data, loading, error, reload } = useAsync(load, []);

  useEffect(() => {
    if (!data) return;
    setTargetForm({
      calories: data.targets.calories?.toString() ?? '',
      protein: data.targets.protein_grams?.toString() ?? '',
      carbs: data.targets.carbs_grams?.toString() ?? '',
      fat: data.targets.fat_grams?.toString() ?? '',
    });
    setReminders((data.prefs as { reminders?: Record<string, boolean> }).reminders || {});
    setWaterGoal(
      String(
        (data.prefs as { hydrationGoalLiters?: number }).hydrationGoalLiters ??
          data.survey?.water_target_liters ??
          2.5
      )
    );
  }, [data]);

  useEffect(() => {
    if (typeof Notification === 'undefined') return;
    setNotifState(Notification.permission as 'default' | 'granted' | 'denied');
  }, []);

  const saveTargets = async () => {
    const num = (v: string) => (v.trim() === '' ? undefined : Number(v));
    const calories = num(targetForm.calories);
    if (calories != null && (calories < 1000 || calories > 5000)) {
      push('Calories must be between 1000 and 5000', 'error');
      return;
    }
    setSavingTargets(true);
    try {
      await targetApi.set({
        calories,
        protein_grams: num(targetForm.protein),
        carbs_grams: num(targetForm.carbs),
        fat_grams: num(targetForm.fat),
      });
      push('Targets updated');
      reload();
    } catch (err) {
      push(apiError(err), 'error');
    } finally {
      setSavingTargets(false);
    }
  };

  const saveWaterGoal = async () => {
    const v = Number(waterGoal);
    if (!Number.isFinite(v) || v < 0.5 || v > 10) {
      push('Water goal must be between 0.5 and 10 liters', 'error');
      return;
    }
    setSavingWater(true);
    try {
      await prefApi.merge({ hydrationGoalLiters: Math.round(v * 10) / 10 });
      push('Water goal updated');
      reload();
    } catch (err) {
      push(apiError(err), 'error');
    } finally {
      setSavingWater(false);
    }
  };

  const toggleReminder = async (key: string, value: boolean) => {
    setReminders((r) => ({ ...r, [key]: value }));
    try {
      await prefApi.merge({ reminders: { ...reminders, [key]: value } });
    } catch (err) {
      setReminders((r) => ({ ...r, [key]: !value }));
      push(apiError(err), 'error');
    }
  };

  const requestNotifications = async () => {
    if (typeof Notification === 'undefined') {
      push('This browser does not support notifications', 'error');
      return;
    }
    const result = await Notification.requestPermission();
    setNotifState(result as 'granted' | 'denied');
    if (result === 'granted') {
      new Notification('Reminders enabled 🎉', { body: 'You will get nudges while the app is open.' });
    }
  };

  const testReminder = () => {
    if (notifState === 'granted') {
      new Notification('💧 Time to hydrate', { body: 'This is what a reminder looks like.' });
    } else {
      push('💧 Time to hydrate — this is what a reminder looks like');
    }
  };

  const changePassword = async () => {
    if (pwForm.new_.length < 6) {
      push('New password must be at least 6 characters', 'error');
      return;
    }
    if (pwForm.new_ !== pwForm.confirm) {
      push('Passwords do not match', 'error');
      return;
    }
    setSavingPw(true);
    try {
      await authApi.changePassword(pwForm.old, pwForm.new_);
      push('Password changed');
      setPwForm({ old: '', new_: '', confirm: '' });
    } catch (err) {
      push(apiError(err), 'error');
    } finally {
      setSavingPw(false);
    }
  };

  if (loading && !data) return <SkeletonCard />;
  if (error) return <ErrorState message={error} onRetry={reload} />;

  return (
    <div className="animate-fade-up space-y-5 max-w-2xl">
      <div>
        <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight">Settings</h1>
        <p className="text-sm text-slate-500 mt-0.5">Tune your goals, reminders and account</p>
      </div>

      {/* Profile */}
      <Card title={<span className="flex items-center gap-2"><User className="w-4 h-4 text-teal-600" /> Profile</span>}>
        <div className="flex items-center gap-3 rounded-xl bg-slate-50 px-4 py-3 mb-4">
          <span className="w-11 h-11 rounded-full bg-gradient-to-br from-teal-400 to-emerald-500 text-white font-extrabold flex items-center justify-center text-lg uppercase">
            {(user?.email || '?').slice(0, 1)}
          </span>
          <div>
            <p className="text-sm font-bold text-slate-800">{user?.email}</p>
            <p className="text-xs text-slate-400">Signed in</p>
          </div>
        </div>
        <details>
          <summary className="text-sm font-semibold text-teal-700 cursor-pointer select-none">Change password</summary>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
            <Field label="Current">
              <input type="password" value={pwForm.old} onChange={(e) => setPwForm((f) => ({ ...f, old: e.target.value }))} className={inputCls} />
            </Field>
            <Field label="New">
              <input type="password" value={pwForm.new_} onChange={(e) => setPwForm((f) => ({ ...f, new_: e.target.value }))} className={inputCls} />
            </Field>
            <Field label="Confirm new">
              <input type="password" value={pwForm.confirm} onChange={(e) => setPwForm((f) => ({ ...f, confirm: e.target.value }))} className={inputCls} />
            </Field>
          </div>
          <Button size="sm" className="mt-3" loading={savingPw} onClick={changePassword}>
            Update password
          </Button>
        </details>
      </Card>

      {/* Goals */}
      <Card
        title={<span className="flex items-center gap-2"><Target className="w-4 h-4 text-teal-600" /> Goals & nutrition targets</span>}
        subtitle={data?.survey ? 'Your body-metrics survey is active — custom values below override it' : 'Tip: complete Body Metrics for auto-calculated targets'}
        action={
          <Button variant="ghost" size="sm" onClick={() => navigate('/profile')}>
            Body metrics
          </Button>
        }
      >
        <div className="grid grid-cols-2 gap-3">
          <Field label="Daily calories">
            <input type="number" min="1000" max="5000" inputMode="numeric" value={targetForm.calories} onChange={(e) => setTargetForm((f) => ({ ...f, calories: e.target.value }))} className={inputCls} />
          </Field>
          <Field label="Protein (g)">
            <input type="number" min="0" inputMode="numeric" value={targetForm.protein} onChange={(e) => setTargetForm((f) => ({ ...f, protein: e.target.value }))} className={inputCls} />
          </Field>
          <Field label="Carbs (g)">
            <input type="number" min="0" inputMode="numeric" value={targetForm.carbs} onChange={(e) => setTargetForm((f) => ({ ...f, carbs: e.target.value }))} className={inputCls} />
          </Field>
          <Field label="Fat (g)">
            <input type="number" min="0" inputMode="numeric" value={targetForm.fat} onChange={(e) => setTargetForm((f) => ({ ...f, fat: e.target.value }))} className={inputCls} />
          </Field>
        </div>
        <Button className="mt-4" loading={savingTargets} onClick={saveTargets}>
          <Check className="w-4 h-4" /> Save targets
        </Button>
      </Card>

      {/* Hydration goal */}
      <Card title={<span className="flex items-center gap-2"><Droplets className="w-4 h-4 text-sky-500" /> Hydration goal</span>}>
        <div className="flex items-end gap-3">
          <Field label="Daily water goal (liters)">
            <input
              type="number"
              min="0.5"
              max="10"
              step="0.1"
              inputMode="decimal"
              value={waterGoal}
              onChange={(e) => setWaterGoal(e.target.value)}
              className={`${inputCls} max-w-36 text-center text-xl font-bold`}
            />
          </Field>
          <Button loading={savingWater} onClick={saveWaterGoal}>Save</Button>
        </div>
      </Card>

      {/* Reminders */}
      <Card
        title={<span className="flex items-center gap-2"><Bell className="w-4 h-4 text-amber-500" /> Reminders</span>}
        subtitle="Reminders fire while the app is open"
        action={
          notifState === 'granted' ? (
            <Chip color="emerald">Notifications on</Chip>
          ) : notifState === 'denied' ? (
            <Chip color="rose">Blocked in browser</Chip>
          ) : notifState === 'unsupported' ? (
            <Chip color="slate">Not supported</Chip>
          ) : (
            <Button size="sm" variant="secondary" onClick={requestNotifications}>
              Enable
            </Button>
          )
        }
      >
        <div className="space-y-1">
          {REMINDERS.map((r) => (
            <div key={r.key} className="flex items-center justify-between py-2.5 border-b border-slate-50 last:border-0">
              <div>
                <p className="text-sm font-semibold text-slate-700">{r.label}</p>
                <p className="text-xs text-slate-400">{r.detail}</p>
              </div>
              <Toggle checked={!!reminders[r.key]} onChange={(v) => toggleReminder(r.key, v)} label={r.label} />
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between mt-3">
          <p className="text-xs text-slate-400">
            {notifState === 'granted'
              ? 'Browser notifications are enabled.'
              : notifState === 'denied'
              ? 'Reminders will appear in-app while it is open.'
              : 'Enable browser notifications, or reminders appear in-app.'}
          </p>
          <Button variant="ghost" size="sm" onClick={testReminder}>
            Test
          </Button>
        </div>
      </Card>

      {/* Meal preferences pointer */}
      <Card title="Meal preferences">
        <p className="text-sm text-slate-500">
          Dietary preferences, disliked foods and allergies for the meal planner live on the{' '}
          <button onClick={() => navigate('/meal-plan')} className="font-semibold text-teal-600 hover:underline">
            Meal Planner
          </button>{' '}
          page.
        </p>
      </Card>

      {/* Privacy */}
      <Card title={<span className="flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-emerald-600" /> Privacy & data</span>}>
        <ul className="space-y-2 text-sm text-slate-500">
          <li>• Your logs live on your own account and are only visible to you.</li>
          <li>• The coach uses only your logged data — no data is sent to third parties.</li>
          <li>• Coach conversation history is stored locally on this device and can be cleared from the Coach page.</li>
        </ul>
      </Card>

      {/* Account */}
      <Card title={<span className="flex items-center gap-2"><LogOut className="w-4 h-4 text-rose-500" /> Account</span>}>
        <Button
          variant="danger"
          onClick={() => {
            logout();
            navigate('/login');
          }}
        >
          Log out
        </Button>
      </Card>
    </div>
  );
};
