import axios from 'axios';

const api = axios.create({
  baseURL: (import.meta.env.VITE_API_URL as string | undefined) ?? '',
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// ===================== Types =====================

export interface AuthToken {
  token?: string;
  access_token?: string;
}

export interface FoodLog {
  id: string;
  date: string;
  name: string;
  meal_type?: string | null;
  calories: number;
  protein_grams?: number | null;
  carbs_grams?: number | null;
  fat_grams?: number | null;
  notes?: string | null;
  created_at?: string;
}

export interface HydrationLog {
  id: string;
  date: string;
  liters_consumed: number;
  time_of_day?: string | null;
  created_at?: string;
}

export interface SleepLog {
  id: string;
  date: string;
  sleep_hours: number;
  sleep_quality?: string | null;
  notes?: string | null;
  created_at?: string;
}

export interface WeightGoal {
  id: string;
  start_weight_kg: number;
  target_weight_kg: number;
  weigh_in_days: string;
  created_at?: string;
}

export interface WeightLog {
  id: string;
  goal_id: string;
  weight_kg: number;
  water_liters?: number | null;
  sleep_hours?: number | null;
  created_at: string;
}

export interface Survey {
  id: string;
  gender: string;
  age: number;
  height_cm: number;
  weight_kg: number;
  target_weight_kg: number | null;
  target_days: number | null;
  lifestyle: string;
  bmi: number;
  body_fat_percent: number;
  bmr: number;
  tdee: number;
  daily_calories: { targetDailyCalories: number } | number | null;
  water_target_liters: number;
  sleep_target_hours: number;
  protein_target_g: number;
  created_at: string;
}

export interface Recipe {
  id: string;
  name: string;
  category: string;
  difficulty: string;
  time_minutes: number;
  calories: number;
  ingredients: string[];
  steps: string[];
}

export interface MealPlan {
  id: string;
  user_id: string;
  recipe_id: string;
  date: string;
  meal_type: string;
  completed: boolean;
}

export interface Targets {
  calories: number | null;
  protein_grams: number | null;
  carbs_grams: number | null;
  fat_grams: number | null;
}

export interface FavoriteFood {
  name: string;
  calories: number;
  proteinGrams?: number | null;
  carbsGrams?: number | null;
  fatGrams?: number | null;
  mealType?: string | null;
}

export interface Preferences {
  macroTargets?: Record<string, number | null>;
  hydrationGoalLiters?: number;
  favorites?: { recipeIds?: string[]; foods?: FavoriteFood[] };
  reminders?: Record<string, boolean>;
  dietary?: {
    preferences?: string[];
    dislikes?: string[];
    allergies?: string[];
    maxCookingMinutes?: number;
    mealsPerDay?: number;
  };
  [key: string]: unknown;
}

// ===================== Auth =====================

export const authApi = {
  signup: (email: string, password: string) => api.post<AuthToken>('/api/auth/signup', { email, password }),
  login: (email: string, password: string) => api.post<AuthToken>('/api/auth/login', { email, password }),
  logout: () => {
    localStorage.removeItem('token');
    return Promise.resolve();
  },
  getCurrentUser: () => api.get<{ id: string; email: string; name?: string }>('/api/auth/me'),
  changePassword: (oldPassword: string, newPassword: string) =>
    api.post('/api/auth/change-password', { oldPassword, newPassword }),
};

// ===================== Food logs =====================

export interface FoodLogInput {
  date: string;
  name: string;
  mealType?: string;
  calories: number;
  proteinGrams?: number | null;
  carbsGrams?: number | null;
  fatGrams?: number | null;
  notes?: string;
}

export const foodLogApi = {
  create: (data: FoodLogInput) => api.post<FoodLog>('/api/food-logs', data),
  getAll: (params?: { date?: string; start?: string; end?: string; limit?: number }) =>
    api.get<FoodLog[]>('/api/food-logs', { params }),
  getById: (id: string) => api.get<FoodLog>(`/api/food-logs/${id}`),
  update: (id: string, patch: Partial<FoodLogInput>) => api.put<FoodLog>(`/api/food-logs/${id}`, patch),
  remove: (id: string) => api.delete(`/api/food-logs/${id}`),
  summaryWeek: (weekStart: string) =>
    api.get<{ weekStart: string; start: string; end: string; totals: Record<string, number>; days: { date: string; count: number; totals: Record<string, number> }[] }>(
      '/api/food-summary/week',
      { params: { weekStart } }
    ),
};

// ===================== Hydration =====================

export const waterApi = {
  list: (date?: string) => api.get<HydrationLog[]>('/api/hydration-logs', { params: date ? { date } : {} }),
  add: (litersConsumed: number, date: string, timeOfDay?: string) =>
    api.post<HydrationLog>('/api/hydration-logs', { litersConsumed, date, timeOfDay }),
};

// ===================== Sleep =====================

export const sleepApi = {
  list: (date?: string) => api.get<SleepLog[]>('/api/sleep-logs', { params: date ? { date } : {} }),
  add: (data: { date: string; sleepHours: number; sleepQuality?: string; notes?: string }) =>
    api.post<SleepLog>('/api/sleep-logs', data),
};

// ===================== Weight =====================

export const weightApi = {
  goals: () => api.get<WeightGoal[]>('/api/weight-goals'),
  createGoal: (startWeightKg: number, targetWeightKg: number) =>
    api.post<WeightGoal>('/api/weight-goals', { startWeightKg, targetWeightKg }),
  logs: () => api.get<WeightLog[]>('/api/weight-logs'),
  addLog: (goalId: string, weightKg: number) => api.post('/api/weight-logs', { goalId, weightKg }),
  updateLog: (id: string, weightKg: number) => api.put<WeightLog>(`/api/weight-logs/${id}`, { weightKg }),
  removeLog: (id: string) => api.delete(`/api/weight-logs/${id}`),
};

// ===================== Survey (body metrics) =====================

export interface SurveyInput {
  gender: string;
  age: number;
  heightCm: number;
  weightKg: number;
  targetWeightKg?: number | null;
  targetDays?: number | null;
  lifestyle: string;
}

export const surveyApi = {
  list: () => api.get<Survey[]>('/api/surveys'),
  create: (data: SurveyInput) => api.post<Survey>('/api/surveys', data),
};

// ===================== Targets / streaks / badges / insights =====================

export const targetApi = {
  get: () => api.get<{ targets: Targets; source: string }>('/api/targets'),
  set: (data: { calories?: number | null; protein_grams?: number | null; carbs_grams?: number | null; fat_grams?: number | null }) =>
    api.put('/api/targets', data),
};

export const streakApi = {
  get: () => api.get<{ currentStreak: number; longestStreak: number; activeDatesCount: number }>('/api/streaks'),
};

export const badgeApi = {
  get: () => api.get<{ badges: { id: string; name: string; description: string; earnedAt: string; icon: string }[]; totalEarned: number }>('/api/badges'),
};

// ===================== Recipes & meal plans =====================

export const recipeApi = {
  all: () => api.get<Recipe[]>('/api/recipes'),
  byId: (id: string) => api.get<Recipe>(`/api/recipes/${id}`),
  share: (id: string) => api.get<{ whatsapp: string; email: string; copy: string }>(`/api/recipes/${id}/share`),
};

export const mealPlanApi = {
  all: () => api.get<MealPlan[]>('/api/meal-plans'),
  create: (recipeId: string, date: string, mealType: string) =>
    api.post<MealPlan>('/api/meal-plans', { recipeId, date, mealType }),
  update: (id: string, patch: Partial<MealPlan>) => api.put<MealPlan>(`/api/meal-plans/${id}`, patch),
  remove: (id: string) => api.delete<MealPlan>(`/api/meal-plans/${id}`),
  generate: (data: { startDate: string; endDate: string; mealTypes: string[]; overwrite: boolean }) =>
    api.post('/api/meal-plans/generate', data),
};

// ===================== Preferences =====================

export const prefApi = {
  get: async (): Promise<Preferences> => {
    const res = await api.get<{ preferences: Preferences }>('/api/users/me/preferences');
    return res.data.preferences ?? {};
  },
  save: async (prefs: Preferences): Promise<Preferences> => {
    const res = await api.put<{ preferences: Preferences }>('/api/users/me/preferences', { preferences: prefs });
    return res.data.preferences ?? {};
  },
  /** Read-modify-write so independent features don't clobber each other. */
  merge: async (patch: Partial<Preferences>): Promise<Preferences> => {
    const current = await prefApi.get();
    return prefApi.save({ ...current, ...patch });
  },
};

/** Human-friendly error text for any API failure */
export function apiError(err: unknown): string {
  const e = err as { response?: { data?: { error?: string; details?: unknown } }; message?: string };
  return (
    e?.response?.data?.error ||
    (typeof e?.response?.data?.details === 'string' ? e.response.data.details : undefined) ||
    e?.message ||
    'Something went wrong'
  );
}

export default api;
