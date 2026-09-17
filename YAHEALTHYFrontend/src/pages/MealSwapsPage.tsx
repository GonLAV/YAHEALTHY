import { useEffect, useState } from 'react';
import { mealSwapApi } from '@/services/api';
import type { MealSwapParsed, MealSwapRaw } from '@/services/api';

type LoadState = 'loading' | 'error' | 'ready';

const parseSwap = (row: MealSwapRaw): MealSwapParsed => {
  const safeParse = <T,>(value: string, fallback: T): T => {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  };
  return {
    id: row.id,
    ingredients: safeParse<string[]>(row.ingredients, []),
    allergies: safeParse<string[]>(row.allergies, []),
    swaps: safeParse<Record<string, string[]>>(row.swaps, {}),
    created_at: row.created_at,
  };
};

export const MealSwapsPage = () => {
  const [state, setState] = useState<LoadState>('loading');
  const [history, setHistory] = useState<MealSwapParsed[]>([]);
  const [ingredientsInput, setIngredientsInput] = useState('');
  const [allergiesInput, setAllergiesInput] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [latestSwaps, setLatestSwaps] = useState<Record<string, string[]> | null>(null);

  const load = async () => {
    setState('loading');
    try {
      const res = await mealSwapApi.getAll();
      setHistory(res.data.map(parseSwap));
      setState('ready');
    } catch (err) {
      console.error('Failed to load meal swaps:', err);
      setState('error');
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleCreate = async () => {
    const ingredients = ingredientsInput
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (ingredients.length === 0) {
      setCreateError('Enter at least one ingredient');
      return;
    }
    const allergies = allergiesInput
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    setCreating(true);
    setCreateError('');
    try {
      const res = await mealSwapApi.create(ingredients, allergies);
      setLatestSwaps(res.data.swaps);
      setIngredientsInput('');
      setAllergiesInput('');
      await load();
    } catch (err: any) {
      setCreateError(err.response?.data?.error || 'Failed to get swap suggestions');
    } finally {
      setCreating(false);
    }
  };

  if (state === 'loading') {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-3xl font-bold text-gray-900 mb-8">Meal Swaps</h1>
          <p className="text-gray-600">Loading…</p>
        </div>
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-3xl font-bold text-gray-900 mb-8">Meal Swaps</h1>
          <div className="bg-red-50 border border-red-200 rounded-lg p-6">
            <p className="text-red-800">Couldn't load your meal swaps.</p>
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
        <h1 className="text-3xl font-bold text-gray-900">Meal Swaps</h1>

        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Find a Swap</h2>
          <label className="block text-sm font-medium text-gray-700 mb-1">Ingredients (comma-separated)</label>
          <input
            type="text"
            value={ingredientsInput}
            onChange={(e) => setIngredientsInput(e.target.value)}
            placeholder="chicken, rice, milk"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg mb-3 focus:ring-2 focus:ring-indigo-500 outline-none"
          />
          <label className="block text-sm font-medium text-gray-700 mb-1">Allergies (optional, comma-separated)</label>
          <input
            type="text"
            value={allergiesInput}
            onChange={(e) => setAllergiesInput(e.target.value)}
            placeholder="soy, nuts"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg mb-3 focus:ring-2 focus:ring-indigo-500 outline-none"
          />
          {createError && <p className="text-red-600 text-sm mb-3">{createError}</p>}
          <button
            onClick={handleCreate}
            disabled={creating}
            className="px-6 py-2 bg-indigo-600 text-white rounded-lg disabled:opacity-50 hover:bg-indigo-700"
          >
            {creating ? 'Finding swaps…' : 'Get Swaps'}
          </button>

          {latestSwaps && (
            <div className="mt-4 space-y-2">
              {Object.entries(latestSwaps).map(([ingredient, options]) => (
                <div key={ingredient} className="p-3 bg-green-50 rounded-lg border border-green-200">
                  <p className="font-semibold text-green-900">{ingredient}</p>
                  <p className="text-sm text-gray-700">{options.join(', ')}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">History</h2>
          {history.length === 0 ? (
            <p className="text-gray-600">No swap searches yet — try one above.</p>
          ) : (
            <div className="space-y-3">
              {history.map((h) => (
                <div key={h.id} className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                  <p className="text-sm text-gray-700">
                    <span className="font-semibold">Ingredients:</span> {h.ingredients.join(', ') || '—'}
                  </p>
                  {h.allergies.length > 0 && (
                    <p className="text-sm text-gray-700">
                      <span className="font-semibold">Allergies:</span> {h.allergies.join(', ')}
                    </p>
                  )}
                  <p className="text-xs text-gray-500 mt-2">{new Date(h.created_at).toLocaleString()}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
