import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL ?? '';

export interface AuthToken {
  access_token?: string;
  token?: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
}

export interface FoodLogInput {
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

export interface FoodLog {
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
    api.get<FoodLog[]>('/api/food-logs', { params: filters }),

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

export interface HydrationLog {
  id: string;
  date: string;
  liters_consumed: number;
  time_of_day?: string;
  source?: string;
  created_at?: string;
}

export const hydrationApi = {
  add: (data: { date?: string; litersConsumed: number; timeOfDay?: string }) =>
    api.post<HydrationLog>('/api/hydration-logs', data),

  getAll: (params?: { date?: string }) =>
    api.get<HydrationLog[]>('/api/hydration-logs', { params }),
};

export interface SleepLog {
  id: string;
  date: string;
  sleep_hours: number;
  sleep_quality?: string;
  notes?: string;
  created_at?: string;
}

export const sleepApi = {
  add: (data: { date?: string; sleepHours: number; sleepQuality?: string; notes?: string }) =>
    api.post<SleepLog>('/api/sleep-logs', data),

  getAll: (params?: { date?: string }) =>
    api.get<SleepLog[]>('/api/sleep-logs', { params }),
};

export interface WeightGoal {
  id: string;
  start_weight_kg: number;
  target_weight_kg: number;
  weigh_in_days?: string;
  created_at?: string;
}

export interface WeightLog {
  id: string;
  goal_id: string;
  date?: string;
  weight_kg: number;
  water_liters?: number;
  sleep_hours?: number;
  celebration?: { message: string; remaining: string } | null;
  created_at?: string;
}

export const weightApi = {
  createGoal: (data: { startWeightKg: number; targetWeightKg: number; weighInDays?: string[] }) =>
    api.post<WeightGoal>('/api/weight-goals', data),

  getGoals: () =>
    api.get<WeightGoal[]>('/api/weight-goals'),

  log: (data: { goalId: string; weightKg: number; waterLiters?: number; sleepHours?: number }) =>
    api.post<WeightLog & { celebration?: { message: string; remaining: string } | null }>('/api/weight-logs', data),

  getLogs: (params?: { goalId?: string }) =>
    api.get<WeightLog[]>('/api/weight-logs', { params }),
};

export interface NutritionTargets {
  calories: number | null;
  protein_grams: number | null;
  carbs_grams: number | null;
  fat_grams: number | null;
}

export const targetsApi = {
  get: () =>
    api.get<{ targets: NutritionTargets; source: string }>('/api/targets'),
};

export interface StreakInfo {
  currentStreak: number;
  longestStreak: number;
  activeOnAsOfDate: boolean;
  activeDatesCount: number;
}

export const streakApi = {
  get: () => api.get<StreakInfo>('/api/streaks'),
};

export interface Badge {
  id: string;
  name: string;
  description: string;
  earnedAt: string;
  icon: string;
}

export const badgesApi = {
  get: () => api.get<{ badges: Badge[]; totalEarned: number }>('/api/badges'),
};

export const crmApi = {
  getInsights: (userId: string, lang: string) =>
    api.get(`/api/crm/users/${userId}/insights`, { params: { lang } }),
  askCoach: (userId: string, message: string, lang: string) =>
    api.post(`/api/crm/users/${userId}/ask?lang=${lang}`, { message }),
};

export const analyticsApi = {
  getInsights: () =>
    api.get('/api/insights/daily'),
};

export default api;
