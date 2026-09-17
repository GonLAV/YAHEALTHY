import { useEffect, useState } from 'react';
import { fastingApi } from '@/services/api';
import type { FastingWindow } from '@/services/api';

type LoadState = 'loading' | 'error' | 'ready';

const PRESETS = [16, 18, 20, 23];

export const FastingWindowsPage = () => {
  const [state, setState] = useState<LoadState>('loading');
  const [windows, setWindows] = useState<FastingWindow[]>([]);
  const [hours, setHours] = useState(16);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  const load = async () => {
    setState('loading');
    try {
      const res = await fastingApi.getAll();
      setWindows(res.data);
      setState('ready');
    } catch (err) {
      console.error('Failed to load fasting windows:', err);
      setState('error');
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleCreate = async () => {
    setCreating(true);
    setCreateError('');
    try {
      await fastingApi.create(hours);
      await load();
    } catch (err: any) {
      setCreateError(err.response?.data?.error || 'Failed to start fasting window');
    } finally {
      setCreating(false);
    }
  };

  if (state === 'loading') {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-3xl font-bold text-gray-900 mb-8">Fasting</h1>
          <p className="text-gray-600">Loading…</p>
        </div>
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-3xl font-bold text-gray-900 mb-8">Fasting</h1>
          <div className="bg-red-50 border border-red-200 rounded-lg p-6">
            <p className="text-red-800">Couldn't load your fasting windows.</p>
            <button onClick={load} className="mt-3 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700">
              Try again
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-2xl mx-auto space-y-8">
        <h1 className="text-3xl font-bold text-gray-900">Fasting</h1>

        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Start a Fasting Window</h2>
          <div className="flex flex-wrap gap-2 mb-4">
            {PRESETS.map((h) => (
              <button
                key={h}
                onClick={() => setHours(h)}
                className={`px-4 py-2 rounded-lg border ${
                  hours === h
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-white text-gray-700 border-gray-300 hover:border-indigo-400'
                }`}
              >
                {h}h
              </button>
            ))}
            <input
              type="number"
              min={8}
              max={23}
              value={hours}
              onChange={(e) => setHours(Number(e.target.value))}
              className="w-20 px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>
          {createError && <p className="text-red-600 text-sm mb-3">{createError}</p>}
          <button
            onClick={handleCreate}
            disabled={creating || hours < 8 || hours > 23}
            className="px-6 py-2 bg-indigo-600 text-white rounded-lg disabled:opacity-50 hover:bg-indigo-700"
          >
            {creating ? 'Starting…' : 'Start Window'}
          </button>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">History</h2>
          {windows.length === 0 ? (
            <p className="text-gray-600">No fasting windows yet — start one above.</p>
          ) : (
            <div className="space-y-3">
              {windows.map((w) => (
                <div key={w.id} className="p-4 bg-indigo-50 rounded-lg border border-indigo-200">
                  <p className="font-semibold text-indigo-900">{w.protocol}</p>
                  <p className="text-sm text-gray-700 mt-1">{w.tips}</p>
                  <p className="text-xs text-gray-500 mt-2">{new Date(w.created_at).toLocaleString()}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
