import { useState } from 'react';
import { Modal, Button, Field, inputCls } from '@/components/ui';
import { waterApi, sleepApi, weightApi, apiError, WeightGoal } from '@/services/api';
import { sleepDuration, todayStr, fmtDateLong } from '@/lib/date';
import { useToast } from '@/hooks/useToast';

// ---------- Water ----------

const QUICK_WATER = [
  { ml: 250, label: '250ml' },
  { ml: 500, label: '500ml' },
  { ml: 750, label: '750ml' },
  { ml: 1000, label: '1L' },
];

export const WaterModal = ({
  open,
  onClose,
  onSaved,
  date,
}: {
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
  date?: string;
}) => {
  const [saving, setSaving] = useState(false);
  const [customMl, setCustomMl] = useState('');
  const { push } = useToast();

  const add = async (ml: number) => {
    if (saving || ml <= 0) return;
    setSaving(true);
    try {
      await waterApi.add(Math.round(ml / 1000) / 10, date || todayStr());
      push(`Added ${ml >= 1000 ? `${ml / 1000}L` : `${ml}ml`} of water`);
      onSaved?.();
      onClose();
    } catch (err) {
      push(apiError(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Add water">
      <div className="grid grid-cols-2 gap-3">
        {QUICK_WATER.map((w) => (
          <button
            key={w.ml}
            disabled={saving}
            onClick={() => add(w.ml)}
            className="rounded-2xl bg-sky-50 border border-sky-100 text-sky-700 py-5 text-lg font-extrabold hover:bg-sky-100 disabled:opacity-50 transition"
          >
            💧 {w.label}
          </button>
        ))}
      </div>
      <div className="mt-4 flex gap-2">
        <input
          type="number"
          min="1"
          inputMode="numeric"
          placeholder="Custom amount (ml)"
          value={customMl}
          onChange={(e) => setCustomMl(e.target.value)}
          className={inputCls}
        />
        <Button variant="secondary" loading={saving} onClick={() => add(Number(customMl))} disabled={!customMl}>
          Add
        </Button>
      </div>
    </Modal>
  );
};

// ---------- Sleep ----------

export const SleepModal = ({
  open,
  onClose,
  onSaved,
  date,
}: {
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
  date?: string;
}) => {
  const [bedtime, setBedtime] = useState('23:00');
  const [wake, setWake] = useState('07:00');
  const [quality, setQuality] = useState('good');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const { push } = useToast();

  const hours = sleepDuration(bedtime, wake);

  const save = async () => {
    if (saving) return;
    if (hours <= 0 || hours > 16) {
      push('Sleep duration looks off — check the times', 'error');
      return;
    }
    setSaving(true);
    try {
      await sleepApi.add({
        date: date || todayStr(),
        sleepHours: hours,
        sleepQuality: quality,
        notes: notes.trim() || undefined,
      });
      push(`Logged ${hours}h of sleep`);
      onSaved?.();
      onClose();
    } catch (err) {
      push(apiError(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={`Log sleep — ${fmtDateLong(date || todayStr())}`}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Bedtime">
          <input type="time" value={bedtime} onChange={(e) => setBedtime(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Wake time">
          <input type="time" value={wake} onChange={(e) => setWake(e.target.value)} className={inputCls} />
        </Field>
      </div>
      <div className="my-4 rounded-2xl bg-indigo-50 border border-indigo-100 text-center py-4">
        <p className="text-sm text-indigo-500 font-semibold">Total sleep</p>
        <p className="text-4xl font-extrabold text-indigo-700 tabular">{hours}h</p>
      </div>
      <Field label="Quality">
        <div className="grid grid-cols-3 gap-2">
          {[
            { v: 'poor', l: '😴 Poor' },
            { v: 'good', l: '🙂 Good' },
            { v: 'great', l: '😄 Great' },
          ].map((q) => (
            <button
              key={q.v}
              type="button"
              onClick={() => setQuality(q.v)}
              className={`py-2.5 rounded-xl text-sm font-semibold border transition ${
                quality === q.v
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
            >
              {q.l}
            </button>
          ))}
        </div>
      </Field>
      <div className="mt-3">
        <Field label="Notes (optional)">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Woke up once, felt rested…"
            className={inputCls}
          />
        </Field>
      </div>
      <Button className="w-full mt-4" loading={saving} onClick={save}>
        Save sleep log
      </Button>
    </Modal>
  );
};

// ---------- Weight ----------

export const WeightModal = ({
  open,
  onClose,
  onSaved,
  goal,
}: {
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
  goal: WeightGoal | null;
}) => {
  const [weight, setWeight] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { push } = useToast();

  const save = async () => {
    const w = Number(weight);
    if (!Number.isFinite(w) || w < 30 || w > 300) {
      setError('Enter a weight between 30 and 300 kg');
      return;
    }
    if (!goal) {
      setError('Create a weight goal first (Progress page)');
      return;
    }
    if (saving) return;
    setError(null);
    setSaving(true);
    try {
      const res = await weightApi.addLog(goal.id, Math.round(w * 10) / 10);
      const celebration = (res.data as { celebration?: { message?: string } | string | null })?.celebration;
      if (typeof celebration === 'object' && celebration?.message) {
        push(celebration.message);
      } else {
        push('Weigh-in logged');
      }
      onSaved?.();
      onClose();
      setWeight('');
    } catch (err) {
      push(apiError(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Log weigh-in">
      {!goal ? (
        <p className="text-sm text-slate-500 mb-4">
          You need a weight goal before logging weigh-ins — create one on the Progress page.
        </p>
      ) : (
        <p className="text-sm text-slate-500 mb-4">
          Goal: {goal.start_weight_kg}kg → <span className="font-semibold text-emerald-700">{goal.target_weight_kg}kg</span>
        </p>
      )}
      <Field label="Weight (kg)" error={error || undefined}>
        <input
          type="number"
          step="0.1"
          min="30"
          max="300"
          inputMode="decimal"
          value={weight}
          onChange={(e) => setWeight(e.target.value)}
          placeholder="e.g. 72.4"
          className={`${inputCls} text-2xl font-bold text-center`}
        />
      </Field>
      <Button className="w-full mt-4" loading={saving} onClick={save} disabled={!goal}>
        Save weigh-in
      </Button>
    </Modal>
  );
};
