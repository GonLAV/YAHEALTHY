import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL ?? '';

export interface AuthToken {
  access_token?: string;
  token?: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
}

interface FoodLogInput {
  date: string; // YYYY-MM-DD
  name: string;
  calories: number;
  mealType?: string;
  proteinGrams?: number;
  carbsGrams?: number;
  fatGrams?: number;
  quantity?: number;
  unit?: string;
  notes?: string;
}

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
  signup: (email: string, password: string) =>
    api.post<AuthToken>('/api/auth/signup', { email, password }),
  
  login: (email: string, password: string) =>
    api.post<AuthToken>('/api/auth/login', { email, password }),
  
  logout: () => {
    localStorage.removeItem('token');
    return Promise.resolve();
  },

  getCurrentUser: () =>
    api.get<{ id: string; email: string }>('/api/auth/me'),
};

export const foodLogApi = {
  create: (data: FoodLogInput) =>
    api.post('/api/food-logs', data),
  
  getAll: (filters?: { date?: string; mealType?: string }) =>
    api.get('/api/food-logs', { params: filters }),
  
  getById: (id: string) =>
    api.get(`/api/food-logs/${id}`),
  
  update: (id: string, data: Partial<FoodLogInput>) =>
    api.put(`/api/food-logs/${id}`, data),
  
  delete: (id: string) =>
    api.delete(`/api/food-logs/${id}`),
  
  search: (query: string) =>
    api.get('/api/food-logs/search', { params: { q: query } }),
  
  getStats: (params?: { startDate?: string; endDate?: string }) =>
    api.get('/api/food-logs/stats', { params }),
  
  getMacrosDistribution: (params?: { date?: string }) =>
    api.get('/api/food-logs/macros-distribution', { params }),
};

export const crmApi = {
  getInsights: (userId: string) => api.get(`/api/crm/users/${userId}/insights`),
  askCoach: (userId: string, message: string) =>
    api.post(`/api/crm/users/${userId}/ask`, { message }),
};

export const analyticsApi = {
  getInsights: () =>
    api.get('/api/insights/daily'),
  
  getBadges: () =>
    api.get('/api/badges'),
  
  getProgress: (params?: { metric?: string; startDate?: string; endDate?: string }) =>
    api.get('/api/progress/overview', { params }),
  
  getTargets: () =>
    api.get('/api/users/me/preferences'),
};

export const settingsApi = {
  getProfile: () =>
    api.get('/api/auth/me'),
  
  updateProfile: (data: any) =>
    api.put('/api/auth/me', data),
  
  getNutritionTargets: () =>
    api.get('/api/users/me/preferences'),
  
  updateNutritionTargets: (data: any) =>
    api.put('/api/users/me/preferences', data),
  
  getPreferences: () =>
    api.get('/api/users/me/preferences'),
  
  updatePreferences: (data: any) =>
    api.put('/api/users/me/preferences', data),
};

export default api;
