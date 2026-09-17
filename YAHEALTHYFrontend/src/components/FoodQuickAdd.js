import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Star, ScanLine, Pencil, History } from 'lucide-react';
import { Modal, Button, Field, inputCls, Segmented, Skeleton } from '@/components/ui';
import { BarcodeScanner, fetchProductByBarcode } from '@/components/BarcodeScanner';
import { foodLogApi, prefApi, apiError } from '@/services/api';
import { todayStr } from '@/lib/date';
import { useToast } from '@/hooks/useToast';
const MEAL_TYPES = [
    { value: 'breakfast', label: 'Breakfast' },
    { value: 'lunch', label: 'Lunch' },
    { value: 'snack', label: 'Snack' },
    { value: 'dinner', label: 'Dinner' },
];
/**
 * The "log food in seconds" flow: recent items, favorites, custom entry and
 * barcode lookup, with a portion multiplier and meal-type picker.
 */
export const FoodQuickAdd = ({ open, onClose, onSaved, prefillName, defaultMealType, }) => {
    const [tab, setTab] = useState('recent');
    const [recent, setRecent] = useState(null);
    const [favorites, setFavorites] = useState([]);
    const [selected, setSelected] = useState(null);
    const [quantity, setQuantity] = useState(1);
    const [mealType, setMealType] = useState(defaultMealType || 'breakfast');
    const [date, setDate] = useState(todayStr());
    const [saving, setSaving] = useState(false);
    const [custom, setCustom] = useState({ name: '', calories: '', protein: '', carbs: '', fat: '' });
    const [scanState, setScanState] = useState({
        loading: false,
        product: null,
        grams: '100',
        error: null,
    });
    const { push } = useToast();
    const loadRecent = useCallback(() => {
        foodLogApi
            .getAll({ limit: 100 })
            .then((res) => setRecent(res.data || []))
            .catch(() => setRecent([]));
        prefApi
            .get()
            .then((p) => setFavorites(p.favorites?.foods || []))
            .catch(() => setFavorites([]));
    }, []);
    useEffect(() => {
        if (open) {
            loadRecent();
            if (prefillName) {
                setTab('custom');
                setCustom((c) => ({ ...c, name: prefillName }));
            }
        }
        else {
            setSelected(null);
            setQuantity(1);
            setScanState({ loading: false, product: null, grams: '100', error: null });
        }
    }, [open, prefillName, loadRecent]);
    const distinctRecent = useMemo(() => {
        const seen = new Set();
        return (recent || []).filter((f) => {
            if (seen.has(f.name))
                return false;
            seen.add(f.name);
            return true;
        }).slice(0, 30);
    }, [recent]);
    const selectFood = (f) => {
        setSelected(f);
        setQuantity(1);
    };
    const save = async (food) => {
        if (saving)
            return; // prevent duplicate submissions
        setSaving(true);
        try {
            const payload = {
                date,
                name: food.name,
                mealType,
                calories: Math.round(food.calories * quantity * 10) / 10,
                proteinGrams: food.protein ? Math.round(food.protein * quantity * 10) / 10 : undefined,
                carbsGrams: food.carbs ? Math.round(food.carbs * quantity * 10) / 10 : undefined,
                fatGrams: food.fat ? Math.round(food.fat * quantity * 10) / 10 : undefined,
            };
            const res = await foodLogApi.create(payload);
            push(`${food.name} logged to ${mealType}`);
            onSaved?.(res.data);
            onClose();
        }
        catch (err) {
            push(apiError(err), 'error');
        }
        finally {
            setSaving(false);
        }
    };
    const saveCustom = async () => {
        const name = custom.name.trim();
        const calories = Number(custom.calories);
        if (!name || !Number.isFinite(calories) || calories < 0) {
            push('Enter a food name and calories', 'error');
            return;
        }
        await save({
            name,
            calories,
            protein: Number(custom.protein) || 0,
            carbs: Number(custom.carbs) || 0,
            fat: Number(custom.fat) || 0,
        });
    };
    const toggleFavorite = async (f) => {
        try {
            const exists = favorites.some((x) => x.name === f.name);
            const foods = exists ? favorites.filter((x) => x.name !== f.name) : [...favorites, { ...f, mealType }];
            setFavorites(foods);
            await prefApi.merge({ favorites: { recipeIds: undefined, foods } });
            push(exists ? 'Removed from favorites' : 'Saved to favorites');
        }
        catch {
            push('Could not update favorites', 'error');
        }
    };
    const lookupBarcode = async (code) => {
        setScanState({ loading: true, product: null, grams: '100', error: null });
        try {
            const product = await fetchProductByBarcode(code);
            setScanState({
                loading: false,
                product,
                grams: String(product.servingGrams || 100),
                error: null,
            });
        }
        catch (err) {
            setScanState({ loading: false, product: null, grams: '100', error: err.message });
        }
    };
    const scannedTotals = useMemo(() => {
        const p = scanState.product;
        if (!p)
            return null;
        const grams = Number(scanState.grams) || 0;
        const factor = grams / 100;
        return {
            grams,
            name: p.name,
            calories: Math.round(p.calories * factor),
            protein: Math.round(p.protein * factor * 10) / 10,
            carbs: Math.round(p.carbs * factor * 10) / 10,
            fat: Math.round(p.fat * factor * 10) / 10,
            image: p.imageUrl,
        };
    }, [scanState]);
    return (_jsxs(Modal, { open: open, onClose: onClose, title: "Log food", children: [_jsx(Segmented, { className: "mb-4", value: tab, onChange: (v) => setTab(v), options: [
                    { value: 'recent', label: 'Recent' },
                    { value: 'custom', label: 'Custom' },
                    { value: 'scan', label: 'Scan' },
                ] }), _jsxs("div", { className: "grid grid-cols-2 gap-3 mb-4", children: [_jsx(Field, { label: "Meal", children: _jsx("select", { value: mealType, onChange: (e) => setMealType(e.target.value), className: inputCls, children: MEAL_TYPES.map((m) => (_jsx("option", { value: m.value, children: m.label }, m.value))) }) }), _jsx(Field, { label: "Date", children: _jsx("input", { type: "date", value: date, max: todayStr(), onChange: (e) => setDate(e.target.value), className: inputCls }) })] }), tab === 'recent' && (_jsxs("div", { children: [favorites.length > 0 && (_jsxs(_Fragment, { children: [_jsx("p", { className: "text-xs font-bold uppercase tracking-wide text-slate-400 mb-1.5", children: "Favorites" }), _jsx("div", { className: "flex gap-2 overflow-x-auto no-scrollbar pb-2", children: favorites.map((f) => (_jsxs("button", { onClick: () => selectFood({ name: f.name, calories: f.calories, protein: f.proteinGrams || 0, carbs: f.carbsGrams || 0, fat: f.fatGrams || 0 }), className: "shrink-0 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-left hover:bg-amber-100", children: [_jsx("span", { className: "block text-sm font-semibold text-slate-800 max-w-[140px] truncate", children: f.name }), _jsxs("span", { className: "block text-xs text-slate-500", children: [f.calories, " kcal"] })] }, f.name))) })] })), _jsxs("p", { className: "text-xs font-bold uppercase tracking-wide text-slate-400 mb-1.5 mt-3", children: [_jsx(History, { className: "w-3.5 h-3.5 inline mr-1 -mt-0.5" }), " Recent"] }), !recent && _jsx(Skeleton, { className: "h-20 w-full" }), recent && distinctRecent.length === 0 && (_jsx("p", { className: "text-sm text-slate-400 py-4 text-center", children: "Nothing logged yet \u2014 your recent foods will appear here." })), recent && (_jsx("div", { className: "grid grid-cols-2 gap-2", children: distinctRecent.slice(0, 12).map((f) => (_jsxs("button", { onClick: () => selectFood({ name: f.name, calories: f.calories, protein: f.protein_grams || 0, carbs: f.carbs_grams || 0, fat: f.fat_grams || 0 }), className: "rounded-xl border border-slate-200 bg-white px-3 py-2 text-left hover:border-teal-300 hover:bg-teal-50/40 transition", children: [_jsx("span", { className: "block text-sm font-semibold text-slate-800 truncate", children: f.name }), _jsxs("span", { className: "block text-xs text-slate-400", children: [f.calories, " kcal"] })] }, f.id))) })), selected && (_jsx(PortionForm, { food: selected, quantity: quantity, setQuantity: setQuantity, saving: saving, onSave: () => save(selected), onFavorite: () => toggleFavorite(selected), isFavorite: favorites.some((x) => x.name === selected.name) }, selected.name))] })), tab === 'custom' && (_jsxs("div", { className: "space-y-3", children: [_jsx(Field, { label: "Food name", children: _jsx("input", { value: custom.name, onChange: (e) => setCustom({ ...custom, name: e.target.value }), placeholder: "e.g. Greek yogurt with granola", className: inputCls }) }), _jsxs("div", { className: "grid grid-cols-2 gap-3", children: [_jsx(Field, { label: "Calories", children: _jsx("input", { type: "number", min: "0", inputMode: "numeric", value: custom.calories, onChange: (e) => setCustom({ ...custom, calories: e.target.value }), className: inputCls }) }), _jsx(Field, { label: "Protein (g)", children: _jsx("input", { type: "number", min: "0", step: "0.1", inputMode: "decimal", value: custom.protein, onChange: (e) => setCustom({ ...custom, protein: e.target.value }), className: inputCls }) }), _jsx(Field, { label: "Carbs (g)", children: _jsx("input", { type: "number", min: "0", step: "0.1", inputMode: "decimal", value: custom.carbs, onChange: (e) => setCustom({ ...custom, carbs: e.target.value }), className: inputCls }) }), _jsx(Field, { label: "Fat (g)", children: _jsx("input", { type: "number", min: "0", step: "0.1", inputMode: "decimal", value: custom.fat, onChange: (e) => setCustom({ ...custom, fat: e.target.value }), className: inputCls }) })] }), _jsxs(Button, { className: "w-full", loading: saving, onClick: saveCustom, children: [_jsx(Pencil, { className: "w-4 h-4" }), " Log food"] })] })), tab === 'scan' && (_jsxs("div", { className: "space-y-4", children: [_jsx(BarcodeScanner, { onDetected: lookupBarcode }), scanState.loading && _jsx(Skeleton, { className: "h-24 w-full" }), scanState.error && (_jsx("p", { className: "text-sm text-rose-600 bg-rose-50 rounded-xl px-4 py-3", children: scanState.error })), scannedTotals && (_jsxs("div", { className: "rounded-2xl border border-slate-200 p-4 space-y-3", children: [_jsxs("div", { className: "flex items-center gap-3", children: [scannedTotals.image && (_jsx("img", { src: scannedTotals.image, alt: "", className: "w-12 h-12 rounded-xl object-cover" })), _jsxs("div", { className: "min-w-0", children: [_jsx("p", { className: "font-bold text-slate-900 truncate", children: scannedTotals.name }), _jsxs("p", { className: "text-xs text-slate-400", children: ["per 100g: ", scanState.product?.calories, " kcal"] })] })] }), _jsx(Field, { label: "Portion (g)", children: _jsx("input", { type: "number", min: "1", inputMode: "numeric", value: scanState.grams, onChange: (e) => setScanState((s) => ({ ...s, grams: e.target.value })), className: inputCls }) }), _jsxs("div", { className: "grid grid-cols-4 gap-2 text-center text-sm", children: [_jsxs("div", { className: "rounded-xl bg-slate-50 py-2", children: [_jsx("p", { className: "text-xs text-slate-400", children: "kcal" }), _jsx("p", { className: "font-bold text-slate-800 tabular", children: scannedTotals.calories })] }), _jsxs("div", { className: "rounded-xl bg-teal-50 py-2", children: [_jsx("p", { className: "text-xs text-teal-600/70", children: "Prot" }), _jsxs("p", { className: "font-bold text-teal-700 tabular", children: [scannedTotals.protein, "g"] })] }), _jsxs("div", { className: "rounded-xl bg-amber-50 py-2", children: [_jsx("p", { className: "text-xs text-amber-600/70", children: "Carbs" }), _jsxs("p", { className: "font-bold text-amber-700 tabular", children: [scannedTotals.carbs, "g"] })] }), _jsxs("div", { className: "rounded-xl bg-purple-50 py-2", children: [_jsx("p", { className: "text-xs text-purple-600/70", children: "Fat" }), _jsxs("p", { className: "font-bold text-purple-700 tabular", children: [scannedTotals.fat, "g"] })] })] }), _jsxs(Button, { className: "w-full", loading: saving, onClick: () => save({
                                    name: scannedTotals.name,
                                    calories: scannedTotals.calories,
                                    protein: scannedTotals.protein,
                                    carbs: scannedTotals.carbs,
                                    fat: scannedTotals.fat,
                                }), children: [_jsx(ScanLine, { className: "w-4 h-4" }), " Add to ", mealType] })] }))] }))] }));
};
function PortionForm({ food, quantity, setQuantity, saving, onSave, onFavorite, isFavorite, }) {
    return (_jsxs("div", { className: "mt-4 rounded-2xl border border-slate-200 p-4 space-y-3", children: [_jsxs("div", { className: "flex items-center justify-between gap-2", children: [_jsx("p", { className: "font-bold text-slate-900 truncate", children: food.name }), _jsx("button", { onClick: onFavorite, "aria-label": "Toggle favorite", className: `w-9 h-9 rounded-full flex items-center justify-center ${isFavorite ? 'text-amber-500 bg-amber-50' : 'text-slate-300 hover:bg-slate-100'}`, children: _jsx(Star, { className: `w-5 h-5 ${isFavorite ? 'fill-amber-400' : ''}` }) })] }), _jsxs("div", { children: [_jsx("p", { className: "text-sm font-semibold text-slate-700 mb-1.5", children: "Portion" }), _jsx("div", { className: "flex gap-2", children: [0.5, 1, 1.5, 2].map((q) => (_jsxs("button", { type: "button", onClick: () => setQuantity(q), className: `px-3 py-1.5 rounded-lg text-sm font-semibold border transition ${quantity === q
                                ? 'bg-teal-600 text-white border-teal-600'
                                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`, children: [q, "\u00D7"] }, q))) })] }), _jsxs("div", { className: "grid grid-cols-4 gap-2 text-center text-sm", children: [_jsxs("div", { className: "rounded-xl bg-slate-50 py-2", children: [_jsx("p", { className: "text-xs text-slate-400", children: "kcal" }), _jsx("p", { className: "font-bold text-slate-800 tabular", children: Math.round(food.calories * quantity) })] }), _jsxs("div", { className: "rounded-xl bg-teal-50 py-2", children: [_jsx("p", { className: "text-xs text-teal-600/70", children: "Prot" }), _jsxs("p", { className: "font-bold text-teal-700 tabular", children: [Math.round(food.protein * quantity), "g"] })] }), _jsxs("div", { className: "rounded-xl bg-amber-50 py-2", children: [_jsx("p", { className: "text-xs text-amber-600/70", children: "Carbs" }), _jsxs("p", { className: "font-bold text-amber-700 tabular", children: [Math.round(food.carbs * quantity), "g"] })] }), _jsxs("div", { className: "rounded-xl bg-purple-50 py-2", children: [_jsx("p", { className: "text-xs text-purple-600/70", children: "Fat" }), _jsxs("p", { className: "font-bold text-purple-700 tabular", children: [Math.round(food.fat * quantity), "g"] })] })] }), _jsxs(Button, { className: "w-full", loading: saving, onClick: onSave, children: ["Log ", Math.round(food.calories * quantity), " kcal"] })] }));
}
