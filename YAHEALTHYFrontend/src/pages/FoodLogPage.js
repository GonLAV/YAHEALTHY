import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useEffect } from 'react';
import { foodLogApi } from '@/services/api';
const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'];
export const FoodLogPage = () => {
    const [foodLogs, setFoodLogs] = useState([]);
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
        }
        catch (error) {
            console.error('Failed to load food logs:', error);
        }
        finally {
            setLoading(false);
        }
    };
    const handleSubmit = async (e) => {
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
        }
        catch (error) {
            console.error('Failed to log food:', error);
        }
    };
    const handleDelete = async (id) => {
        try {
            await foodLogApi.delete(id);
            fetchFoodLogs();
        }
        catch (error) {
            console.error('Failed to delete food log:', error);
        }
    };
    if (loading) {
        return _jsx("div", { className: "flex items-center justify-center min-h-screen", children: "Loading..." });
    }
    return (_jsx("div", { className: "min-h-screen bg-gray-50 p-8", children: _jsxs("div", { className: "max-w-4xl mx-auto", children: [_jsxs("div", { className: "flex justify-between items-center mb-8", children: [_jsx("h1", { className: "text-3xl font-bold text-gray-900", children: "Food Log" }), _jsx("button", { onClick: () => setShowForm(!showForm), className: "bg-indigo-600 text-white px-6 py-2 rounded-lg hover:bg-indigo-700", children: showForm ? 'Cancel' : 'Log Food' })] }), showForm && (_jsxs("div", { className: "bg-white rounded-lg shadow p-6 mb-8", children: [_jsx("h2", { className: "text-2xl font-bold text-gray-900 mb-6", children: "Log New Food" }), _jsxs("form", { onSubmit: handleSubmit, className: "space-y-4", children: [_jsxs("div", { children: [_jsx("label", { className: "block text-sm font-medium text-gray-700 mb-2", children: "Food Name" }), _jsx("input", { type: "text", value: formData.name, onChange: (e) => setFormData({ ...formData, name: e.target.value }), className: "w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none", required: true })] }), _jsxs("div", { className: "grid grid-cols-2 md:grid-cols-4 gap-4", children: [_jsxs("div", { children: [_jsx("label", { className: "block text-sm font-medium text-gray-700 mb-2", children: "Calories" }), _jsx("input", { type: "number", value: formData.calories, onChange: (e) => setFormData({ ...formData, calories: parseFloat(e.target.value) }), className: "w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none", required: true })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-sm font-medium text-gray-700 mb-2", children: "Protein (g)" }), _jsx("input", { type: "number", step: "0.1", value: formData.proteinGrams, onChange: (e) => setFormData({ ...formData, proteinGrams: parseFloat(e.target.value) }), className: "w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-sm font-medium text-gray-700 mb-2", children: "Carbs (g)" }), _jsx("input", { type: "number", step: "0.1", value: formData.carbsGrams, onChange: (e) => setFormData({ ...formData, carbsGrams: parseFloat(e.target.value) }), className: "w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-sm font-medium text-gray-700 mb-2", children: "Fat (g)" }), _jsx("input", { type: "number", step: "0.1", value: formData.fatGrams, onChange: (e) => setFormData({ ...formData, fatGrams: parseFloat(e.target.value) }), className: "w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" })] })] }), _jsxs("div", { className: "grid grid-cols-2 md:grid-cols-3 gap-4", children: [_jsxs("div", { children: [_jsx("label", { className: "block text-sm font-medium text-gray-700 mb-2", children: "Meal Type" }), _jsx("select", { value: formData.mealType, onChange: (e) => setFormData({ ...formData, mealType: e.target.value }), className: "w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none", children: MEAL_TYPES.map((type) => (_jsx("option", { value: type, children: type.charAt(0).toUpperCase() + type.slice(1) }, type))) })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-sm font-medium text-gray-700 mb-2", children: "Quantity" }), _jsx("input", { type: "number", step: "0.1", value: formData.quantity, onChange: (e) => setFormData({ ...formData, quantity: parseFloat(e.target.value) }), className: "w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-sm font-medium text-gray-700 mb-2", children: "Unit" }), _jsx("input", { type: "text", value: formData.unit, onChange: (e) => setFormData({ ...formData, unit: e.target.value }), className: "w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" })] })] }), _jsx("button", { type: "submit", className: "w-full bg-indigo-600 text-white py-2 rounded-lg font-semibold hover:bg-indigo-700", children: "Log Food" })] })] })), _jsxs("div", { className: "space-y-4", children: [_jsx("h2", { className: "text-2xl font-bold text-gray-900", children: "Today's Logs" }), foodLogs.length === 0 ? (_jsx("div", { className: "bg-white rounded-lg shadow p-6 text-center", children: _jsx("p", { className: "text-gray-600", children: "No food logs yet. Add your first meal!" }) })) : (_jsx("div", { className: "space-y-4", children: foodLogs.map((log) => (_jsx("div", { className: "bg-white rounded-lg shadow p-6", children: _jsxs("div", { className: "flex justify-between items-start", children: [_jsxs("div", { className: "flex-1", children: [_jsx("h3", { className: "text-lg font-semibold text-gray-900", children: log.name }), _jsx("p", { className: "text-sm text-gray-600 capitalize", children: log.meal_type }), log.quantity && (_jsxs("p", { className: "text-sm text-gray-600", children: [log.quantity, " ", log.unit] })), _jsxs("div", { className: "mt-3 grid grid-cols-4 gap-4 text-sm", children: [_jsxs("div", { children: [_jsx("p", { className: "text-gray-600", children: "Calories" }), _jsx("p", { className: "font-semibold text-gray-900", children: log.calories })] }), _jsxs("div", { children: [_jsx("p", { className: "text-gray-600", children: "Protein" }), _jsxs("p", { className: "font-semibold text-red-600", children: [(log.protein_grams || 0).toFixed(1), "g"] })] }), _jsxs("div", { children: [_jsx("p", { className: "text-gray-600", children: "Carbs" }), _jsxs("p", { className: "font-semibold text-blue-600", children: [(log.carbs_grams || 0).toFixed(1), "g"] })] }), _jsxs("div", { children: [_jsx("p", { className: "text-gray-600", children: "Fat" }), _jsxs("p", { className: "font-semibold text-amber-600", children: [(log.fat_grams || 0).toFixed(1), "g"] })] })] })] }), _jsx("button", { onClick: () => handleDelete(log.id), className: "ml-4 text-red-600 hover:text-red-700 font-semibold", children: "Delete" })] }) }, log.id))) }))] })] }) }));
};
