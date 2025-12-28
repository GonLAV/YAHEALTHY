import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useEffect } from 'react';
import { foodLogApi } from '@/services/api';
import { Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
export const DashboardPage = () => {
    const [foodLogs, setFoodLogs] = useState([]);
    const [stats, setStats] = useState(null);
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
            }
            catch (error) {
                console.error('Failed to load dashboard data:', error);
            }
            finally {
                setLoading(false);
            }
        };
        fetchData();
    }, []);
    if (loading) {
        return _jsx("div", { className: "flex items-center justify-center min-h-screen", children: "Loading..." });
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
    return (_jsx("div", { className: "min-h-screen bg-gray-50 p-8", children: _jsxs("div", { className: "max-w-6xl mx-auto", children: [_jsx("h1", { className: "text-3xl font-bold text-gray-900 mb-8", children: "Dashboard" }), _jsxs("div", { className: "grid grid-cols-1 md:grid-cols-4 gap-6 mb-8", children: [_jsxs("div", { className: "bg-white rounded-lg shadow p-6", children: [_jsx("p", { className: "text-gray-600 text-sm font-semibold", children: "CALORIES" }), _jsx("p", { className: "text-3xl font-bold text-gray-900 mt-2", children: totalCalories })] }), _jsxs("div", { className: "bg-white rounded-lg shadow p-6", children: [_jsx("p", { className: "text-gray-600 text-sm font-semibold", children: "PROTEIN" }), _jsxs("p", { className: "text-3xl font-bold text-red-600 mt-2", children: [totalProtein.toFixed(1), "g"] })] }), _jsxs("div", { className: "bg-white rounded-lg shadow p-6", children: [_jsx("p", { className: "text-gray-600 text-sm font-semibold", children: "CARBS" }), _jsxs("p", { className: "text-3xl font-bold text-blue-600 mt-2", children: [totalCarbs.toFixed(1), "g"] })] }), _jsxs("div", { className: "bg-white rounded-lg shadow p-6", children: [_jsx("p", { className: "text-gray-600 text-sm font-semibold", children: "FAT" }), _jsxs("p", { className: "text-3xl font-bold text-amber-600 mt-2", children: [totalFat.toFixed(1), "g"] })] })] }), _jsxs("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-6 mb-8", children: [_jsxs("div", { className: "bg-white rounded-lg shadow p-6", children: [_jsx("h2", { className: "text-xl font-bold text-gray-900 mb-4", children: "Macro Distribution" }), _jsx(ResponsiveContainer, { width: "100%", height: 300, children: _jsxs(PieChart, { children: [_jsx(Pie, { data: macrosData, cx: "50%", cy: "50%", labelLine: false, label: ({ name, value }) => `${name}: ${value.toFixed(1)}g`, outerRadius: 80, fill: "#8884d8", dataKey: "value", children: macrosData.map((entry, index) => (_jsx(Cell, { fill: entry.color }, `cell-${index}`))) }), _jsx(Tooltip, {})] }) })] }), _jsxs("div", { className: "bg-white rounded-lg shadow p-6", children: [_jsx("h2", { className: "text-xl font-bold text-gray-900 mb-4", children: "Today's Meals" }), _jsx("div", { className: "space-y-4", children: foodLogs.length === 0 ? (_jsx("p", { className: "text-gray-600", children: "No meals logged today" })) : (foodLogs.map((log) => (_jsx("div", { className: "border-b border-gray-200 pb-3", children: _jsxs("div", { className: "flex justify-between items-start", children: [_jsxs("div", { children: [_jsx("p", { className: "font-semibold text-gray-900", children: log.name }), _jsx("p", { className: "text-sm text-gray-600 capitalize", children: log.meal_type || 'meal' })] }), _jsxs("p", { className: "font-semibold text-gray-900", children: [log.calories, " cal"] })] }) }, log.id)))) })] })] })] }) }));
};
