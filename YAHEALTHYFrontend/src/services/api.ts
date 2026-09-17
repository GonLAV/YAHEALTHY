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

export interface DailyInsights {
  date: string;
  logCount: number;
  totalCalories: number;
  totalProtein: number;
  mealCounts: Record<string, number>;
  meetsProteinTarget: boolean | null;
  calorieStatus: 'under' | 'over' | 'perfect' | null;
}

export interface Badge {
  id: string;
  name: string;
  description: string;
  earnedAt: string;
  icon: string;
}

export interface BadgesResponse {
  badges: Badge[];
  totalEarned: number;
}

export interface ProgressOverview {
  today: {
    date: string;
    caloriesLogged: number;
    proteinLogged: number;
    logsCount: number;
  };
  stats: {
    totalDaysLogged: number;
    totalLogsCount: number;
    averageLogsPerDay: number;
    latestWeight: number | null;
  };
}

export interface ResolvedTargets {
  targets: {
    calories: number | null;
    protein_grams: number | null;
    carbs_grams: number | null;
    fat_grams: number | null;
  };
  source: string;
  surveyId: string | null;
  lastUpdated: string | null;
}

export interface Streaks {
  asOf: string;
  streakType: string;
  activeOnAsOfDate: boolean;
  lastActiveDate: string | null;
  activeDatesCount: number;
  currentStreak: number;
  longestStreak: number;
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

// There is no `/api/crm/*` backend -- crm-routes.js was dead code, never
// mounted in index.js, and was deleted outright (see
// Plugin/DEV-TEAM/skills/dev-team/references/decisions.md, ADR-002). A
// coaching chat that generates free-text nutrition advice is a health-
// boundary decision (needs explicit review of the advice logic, not a
// routing fix) -- CoachingPage now shows real computed data instead.

export const analyticsApi = {
  getInsights: (date?: string) =>
    api.get<DailyInsights>('/api/insights/daily', { params: date ? { date } : undefined }),

  getBadges: () =>
    api.get<BadgesResponse>('/api/badges'),

  getProgress: () =>
    api.get<ProgressOverview>('/api/progress/overview'),

  getTargets: () =>
    api.get<ResolvedTargets>('/api/targets'),

  getStreaks: (asOf?: string) =>
    api.get<Streaks>('/api/streaks', { params: asOf ? { asOf } : undefined }),
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
