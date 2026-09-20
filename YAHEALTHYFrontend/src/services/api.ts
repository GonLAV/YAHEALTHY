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
  
  // Dropping the token from this browser is not a sign-out: the token stays
  // valid for the rest of its life and still works for anyone holding a copy.
  // The server call is what actually ends the session, so it goes first. The
  // local clear runs either way — leaving the user staring at a logged-in UI
  // because the network blipped helps nobody.
  logout: async () => {
    try {
      await api.post('/api/auth/logout');
    } finally {
      localStorage.removeItem('token');
    }
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

export interface RecipeIngredient {
  item: string;
  amount: string;
  category?: string;
}

export interface RecipeStep {
  step: number;
  text: string;
  temp_c?: number;
  heat?: string;
  minutes?: number;
  cue?: string;
}

export interface Recipe {
  id: string;
  name: string;
  name_en?: string;
  category: string;
  difficulty: string;
  time_minutes: number;
  calories: number;
  servings?: number;
  vessel?: string;
  ingredients: RecipeIngredient[];
  steps: RecipeStep[];
  tips?: string[];
  chef_note?: string;
  /** Present only where an internal temperature is a food-safety requirement. */
  safety?: string;
}

export const recipeApi = {
  getAll: () => api.get<Recipe[]>('/api/recipes'),

  getById: (id: string) => api.get<Recipe>(`/api/recipes/${id}`),

  shuffle: (count = 2) =>
    api.get<Recipe[]>('/api/recipes/shuffle', { params: { count } }),
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
