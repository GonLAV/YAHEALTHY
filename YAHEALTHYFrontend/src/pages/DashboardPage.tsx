import { useState, useEffect } from 'react';
import { foodLogApi } from '@/services/api';
import { Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

interface FoodLog {
  id: string;
  name: string;
  calories: number;
  protein_grams?: number;
  carbs_grams?: number;
  fat_grams?: number;
  meal_type?: string;
  date: string;
}

export const DashboardPage = () => {
  const [foodLogs, setFoodLogs] = useState<FoodLog[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const today = new Date().toISOString().split('T')[0];
        const [logsRes, statsRes] = await Promise.all([
          foodLogApi.getAll({ date: today }),
          foodLogApi.getStats({ startDate: today, endDate: today }),
        ]);

        setFoodLogs(logsRes.data);
        setStats(statsRes.data);
      } catch (error) {
        console.error('Failed to load dashboard data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  }

  const totalCalories = stats?.total_calories || 0;
  const totalProtein = stats?.total_protein || 0;
  const totalCarbs = stats?.total_carbs || 0;
  const totalFat = stats?.total_fat || 0;

  const macrosData = [
    { name: 'Protein', value: totalProtein, color: '#ef4444' },
    { name: 'Carbs', value: totalCarbs, color: '#3b82f6' },
    { name: 'Fat', value: totalFat, color: '#f59e0b' },
  ];

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">Dashboard</h1>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow p-6">
            <p className="text-gray-600 text-sm font-semibold">CALORIES</p>
            <p className="text-3xl font-bold text-gray-900 mt-2">{totalCalories}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <p className="text-gray-600 text-sm font-semibold">PROTEIN</p>
            <p className="text-3xl font-bold text-red-600 mt-2">{totalProtein.toFixed(1)}g</p>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <p className="text-gray-600 text-sm font-semibold">CARBS</p>
            <p className="text-3xl font-bold text-blue-600 mt-2">{totalCarbs.toFixed(1)}g</p>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <p className="text-gray-600 text-sm font-semibold">FAT</p>
            <p className="text-3xl font-bold text-amber-600 mt-2">{totalFat.toFixed(1)}g</p>
          </div>
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          {/* Macros Pie Chart */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Macro Distribution</h2>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={macrosData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, value }) => `${name}: ${value.toFixed(1)}g`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {macrosData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Recent Food Logs */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Today's Meals</h2>
            <div className="space-y-4">
              {foodLogs.length === 0 ? (
                <p className="text-gray-600">No meals logged today</p>
              ) : (
                foodLogs.map((log) => (
                  <div key={log.id} className="border-b border-gray-200 pb-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-semibold text-gray-900">{log.name}</p>
                        <p className="text-sm text-gray-600 capitalize">{log.meal_type || 'meal'}</p>
                      </div>
                      <p className="font-semibold text-gray-900">{log.calories} cal</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
