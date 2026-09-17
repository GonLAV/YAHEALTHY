import axios from 'axios';
const api = axios.create({
    baseURL: import.meta.env.VITE_API_URL ?? '',
    headers: { 'Content-Type': 'application/json' },
});
api.interceptors.request.use((config) => {
    const token = localStorage.getItem('token');
    if (token)
        config.headers.Authorization = `Bearer ${token}`;
    return config;
});
// ===================== Auth =====================
export const authApi = {
    signup: (email, password) => api.post('/api/auth/signup', { email, password }),
    login: (email, password) => api.post('/api/auth/login', { email, password }),
    logout: () => {
        localStorage.removeItem('token');
        return Promise.resolve();
    },
    getCurrentUser: () => api.get('/api/auth/me'),
    changePassword: (oldPassword, newPassword) => api.post('/api/auth/change-password', { oldPassword, newPassword }),
};
export const foodLogApi = {
    create: (data) => api.post('/api/food-logs', data),
    getAll: (params) => api.get('/api/food-logs', { params }),
    getById: (id) => api.get(`/api/food-logs/${id}`),
    update: (id, patch) => api.put(`/api/food-logs/${id}`, patch),
    remove: (id) => api.delete(`/api/food-logs/${id}`),
    summaryWeek: (weekStart) => api.get('/api/food-summary/week', { params: { weekStart } }),
};
// ===================== Hydration =====================
export const waterApi = {
    list: (date) => api.get('/api/hydration-logs', { params: date ? { date } : {} }),
    add: (litersConsumed, date, timeOfDay) => api.post('/api/hydration-logs', { litersConsumed, date, timeOfDay }),
};
// ===================== Sleep =====================
export const sleepApi = {
    list: (date) => api.get('/api/sleep-logs', { params: date ? { date } : {} }),
    add: (data) => api.post('/api/sleep-logs', data),
};
// ===================== Weight =====================
export const weightApi = {
    goals: () => api.get('/api/weight-goals'),
    createGoal: (startWeightKg, targetWeightKg) => api.post('/api/weight-goals', { startWeightKg, targetWeightKg }),
    logs: () => api.get('/api/weight-logs'),
    addLog: (goalId, weightKg) => api.post('/api/weight-logs', { goalId, weightKg }),
    updateLog: (id, weightKg) => api.put(`/api/weight-logs/${id}`, { weightKg }),
    removeLog: (id) => api.delete(`/api/weight-logs/${id}`),
};
export const surveyApi = {
    list: () => api.get('/api/surveys'),
    create: (data) => api.post('/api/surveys', data),
};
// ===================== Targets / streaks / badges / insights =====================
export const targetApi = {
    get: () => api.get('/api/targets'),
    set: (data) => api.put('/api/targets', data),
};
export const streakApi = {
    get: () => api.get('/api/streaks'),
};
export const badgeApi = {
    get: () => api.get('/api/badges'),
};
// ===================== Recipes & meal plans =====================
export const recipeApi = {
    all: () => api.get('/api/recipes'),
    byId: (id) => api.get(`/api/recipes/${id}`),
    share: (id) => api.get(`/api/recipes/${id}/share`),
};
export const mealPlanApi = {
    all: () => api.get('/api/meal-plans'),
    create: (recipeId, date, mealType) => api.post('/api/meal-plans', { recipeId, date, mealType }),
    update: (id, patch) => api.put(`/api/meal-plans/${id}`, patch),
    remove: (id) => api.delete(`/api/meal-plans/${id}`),
    generate: (data) => api.post('/api/meal-plans/generate', data),
};
// ===================== Preferences =====================
export const prefApi = {
    get: async () => {
        const res = await api.get('/api/users/me/preferences');
        return res.data.preferences ?? {};
    },
    save: async (prefs) => {
        const res = await api.put('/api/users/me/preferences', { preferences: prefs });
        return res.data.preferences ?? {};
    },
    /** Read-modify-write so independent features don't clobber each other. */
    merge: async (patch) => {
        const current = await prefApi.get();
        return prefApi.save({ ...current, ...patch });
    },
};
/** Human-friendly error text for any API failure */
export function apiError(err) {
    const e = err;
    return (e?.response?.data?.error ||
        (typeof e?.response?.data?.details === 'string' ? e.response.data.details : undefined) ||
        e?.message ||
        'Something went wrong');
}
export default api;
