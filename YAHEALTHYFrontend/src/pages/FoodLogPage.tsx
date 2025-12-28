import { useState, useEffect } from 'react';
import { foodLogApi } from '@/services/api';

interface FoodLog {
  id: string;
  name: string;
  calories: number;
  protein_grams?: number;
  carbs_grams?: number;
  fat_grams?: number;
  meal_type?: string;
  date: string;
  quantity?: number;
  unit?: string;
}

const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'];

export const FoodLogPage = () => {
  const [foodLogs, setFoodLogs] = useState<FoodLog[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState({
    name: '',
    calories: 0,
    proteinGrams: 0,
    carbsGrams: 0,
    fatGrams: 0,
    mealType: 'breakfast',
    quantity: 1,
    unit: 'g',
  });

  useEffect(() => {
    fetchFoodLogs();
  }, []);

  const fetchFoodLogs = async () => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const response = await foodLogApi.getAll({ date: today });
      setFoodLogs(response.data);
    } catch (error) {
      console.error('Failed to load food logs:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await foodLogApi.create({
        ...formData,
        date: new Date().toISOString().split('T')[0],
      });
      setFormData({
        name: '',
        calories: 0,
        proteinGrams: 0,
        carbsGrams: 0,
        fatGrams: 0,
        mealType: 'breakfast',
        quantity: 1,
        unit: 'g',
      });
      setShowForm(false);
      fetchFoodLogs();
    } catch (error) {
      console.error('Failed to log food:', error);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await foodLogApi.delete(id);
      fetchFoodLogs();
    } catch (error) {
      console.error('Failed to delete food log:', error);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Food Log</h1>
          <button
            onClick={() => setShowForm(!showForm)}
            className="bg-indigo-600 text-white px-6 py-2 rounded-lg hover:bg-indigo-700"
          >
            {showForm ? 'Cancel' : 'Log Food'}
          </button>
        </div>

        {/* Add Food Form */}
        {showForm && (
          <div className="bg-white rounded-lg shadow p-6 mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Log New Food</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Food Name
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                  required
                />
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Calories
                  </label>
                  <input
                    type="number"
                    value={formData.calories}
                    onChange={(e) => setFormData({ ...formData, calories: parseFloat(e.target.value) })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Protein (g)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={formData.proteinGrams}
                    onChange={(e) => setFormData({ ...formData, proteinGrams: parseFloat(e.target.value) })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Carbs (g)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={formData.carbsGrams}
                    onChange={(e) => setFormData({ ...formData, carbsGrams: parseFloat(e.target.value) })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Fat (g)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={formData.fatGrams}
                    onChange={(e) => setFormData({ ...formData, fatGrams: parseFloat(e.target.value) })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Meal Type
                  </label>
                  <select
                    value={formData.mealType}
                    onChange={(e) => setFormData({ ...formData, mealType: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                  >
                    {MEAL_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {type.charAt(0).toUpperCase() + type.slice(1)}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Quantity
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={formData.quantity}
                    onChange={(e) => setFormData({ ...formData, quantity: parseFloat(e.target.value) })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Unit
                  </label>
                  <input
                    type="text"
                    value={formData.unit}
                    onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full bg-indigo-600 text-white py-2 rounded-lg font-semibold hover:bg-indigo-700"
              >
                Log Food
              </button>
            </form>
          </div>
        )}

        {/* Food Logs List */}
        <div className="space-y-4">
          <h2 className="text-2xl font-bold text-gray-900">Today's Logs</h2>
          {foodLogs.length === 0 ? (
            <div className="bg-white rounded-lg shadow p-6 text-center">
              <p className="text-gray-600">No food logs yet. Add your first meal!</p>
            </div>
          ) : (
            <div className="space-y-4">
              {foodLogs.map((log) => (
                <div key={log.id} className="bg-white rounded-lg shadow p-6">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-gray-900">{log.name}</h3>
                      <p className="text-sm text-gray-600 capitalize">{log.meal_type}</p>
                      {log.quantity && (
                        <p className="text-sm text-gray-600">
                          {log.quantity} {log.unit}
                        </p>
                      )}
                      <div className="mt-3 grid grid-cols-4 gap-4 text-sm">
                        <div>
                          <p className="text-gray-600">Calories</p>
                          <p className="font-semibold text-gray-900">{log.calories}</p>
                        </div>
                        <div>
                          <p className="text-gray-600">Protein</p>
                          <p className="font-semibold text-red-600">{(log.protein_grams || 0).toFixed(1)}g</p>
                        </div>
                        <div>
                          <p className="text-gray-600">Carbs</p>
                          <p className="font-semibold text-blue-600">{(log.carbs_grams || 0).toFixed(1)}g</p>
                        </div>
                        <div>
                          <p className="text-gray-600">Fat</p>
                          <p className="font-semibold text-amber-600">{(log.fat_grams || 0).toFixed(1)}g</p>
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => handleDelete(log.id)}
                      className="ml-4 text-red-600 hover:text-red-700 font-semibold"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
