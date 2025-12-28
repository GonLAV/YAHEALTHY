import axios from 'axios';
const API_BASE_URL = import.meta.env.VITE_API_URL ?? '';
const api = axios.create({
    baseURL: API_BASE_URL,
    headers: {
        'Content-Type': 'application/json',
    },
});
// Add token to requests
api.interceptors.request.use((config) => {
    const token = localStorage.getItem('token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});
export const authApi = {
    signup: (email, password) => api.post('/api/auth/signup', { email, password }),
    login: (email, password) => api.post('/api/auth/login', { email, password }),
    logout: () => {
        localStorage.removeItem('token');
        return Promise.resolve();
    },
    getCurrentUser: () => api.get('/api/auth/me'),
};
export const foodLogApi = {
    create: (data) => api.post('/api/food-logs', data),
    getAll: (filters) => api.get('/api/food-logs', { params: filters }),
    getById: (id) => api.get(`/api/food-logs/${id}`),
    update: (id, data) => api.put(`/api/food-logs/${id}`, data),
    delete: (id) => api.delete(`/api/food-logs/${id}`),
    search: (query) => api.get('/api/food-logs/search', { params: { q: query } }),
    getStats: (params) => api.get('/api/food-logs/stats', { params }),
    getMacrosDistribution: (params) => api.get('/api/food-logs/macros-distribution', { params }),
};
export const crmApi = {
    getInsights: (userId) => api.get(`/api/crm/users/${userId}/insights`),
    askCoach: (userId, message) => api.post(`/api/crm/users/${userId}/ask`, { message }),
};
export const analyticsApi = {
    getInsights: () => api.get('/api/insights/daily'),
    getBadges: () => api.get('/api/badges'),
    getProgress: (params) => api.get('/api/progress/overview', { params }),
    getTargets: () => api.get('/api/users/me/preferences'),
};
export const settingsApi = {
    getProfile: () => api.get('/api/auth/me'),
    updateProfile: (data) => api.put('/api/auth/me', data),
    getNutritionTargets: () => api.get('/api/users/me/preferences'),
    updateNutritionTargets: (data) => api.put('/api/users/me/preferences', data),
    getPreferences: () => api.get('/api/users/me/preferences'),
    updatePreferences: (data) => api.put('/api/users/me/preferences', data),
};
export default api;
