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

  /**
   * A day's totals, which is what a dashboard actually wants.
   *
   * The dashboard used to build this from getStats. That endpoint returns
   * `totalCalories` in camelCase and computes no macros at all, while the
   * dashboard read `total_calories`, `total_protein`, `total_carbs` and
   * `total_fat` — so the calorie ring and all three macro bars read zero for
   * every user on every day. It also took `start`/`end`, not the
   * `startDate`/`endDate` sent above, so its date filter never applied.
   *
   * /api/food-summary returns exactly the four totals, for one date, and is
   * validated server-side.
   */
  getDaySummary: (date: string) =>
    api.get<FoodDaySummary>('/api/food-summary', { params: { date } }),

  /**
   * Per-day totals across a range, aggregated server-side.
   *
   * One request for a whole week instead of seven, and it fills gaps: a day
   * with nothing logged comes back with zero totals rather than being absent,
   * which is what a chart needs to show a break in the habit rather than
   * silently closing the gap.
   */
  getRangeSummary: (start: string, end: string) =>
    api.get<FoodRangeSummary>('/api/food-summary/range', { params: { start, end } }),

  /**
   * Which dates have at least one log. The lightest payload in the API —
   * dates and nothing else — which is what a consistency calendar needs.
   */
  getLoggedDays: (start: string, end: string) =>
    api.get<{ start: string; end: string; daysCount: number; days: string[] }>(
      '/api/food-days',
      { params: { start, end } },
    ),

  /** Saved meals, for logging a repeat without retyping it. */
  getTemplates: (limit = 6) =>
    api.get<FoodLogTemplate[]>('/api/food-logs/templates', { params: { limit } }),

  saveTemplate: (data: Omit<FoodLogInput, 'date'>) =>
    api.post<FoodLogTemplate>('/api/food-logs/template', data),

  deleteTemplate: (id: string) =>
    api.delete(`/api/food-logs/templates/${id}`),
};

export interface FoodLogTemplate {
  id: string;
  name: string;
  calories: number;
  meal_type?: string | null;
  protein_grams?: number | null;
  carbs_grams?: number | null;
  fat_grams?: number | null;
  notes?: string | null;
}

export interface FoodRangeSummary {
  start: string;
  end: string;
  days: Array<{
    date: string;
    count: number;
    totals: { calories: number; protein_grams: number; carbs_grams: number; fat_grams: number };
  }>;
  totals: { calories: number; protein_grams: number; carbs_grams: number; fat_grams: number };
}

export interface FoodDaySummary {
  date: string;
  count: number;
  totals: {
    calories: number;
    protein_grams: number;
    carbs_grams: number;
    fat_grams: number;
  };
}

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

/**
 * What the server decided about a weigh-in — a code, never a sentence.
 *
 * It used to hand back { message: "Great job! Lost 1.2kg" }, built on the
 * server, in English, and rendered as-is inside the Hebrew UI. The rules behind
 * it now live in utils/weight-progress.js; the wording lives here, where the
 * reader's language is known.
 */
export interface WeighInVerdict {
  code: 'goal_reached' | 'progress';
  deltaKg: number | null;
  remainingKg: number | null;
}

export interface WeightLog {
  id: string;
  goal_id: string;
  date?: string;
  weight_kg: number;
  water_liters?: number;
  sleep_hours?: number;
  celebration?: WeighInVerdict | null;
  created_at?: string;
}

export const weightApi = {
  createGoal: (data: { startWeightKg: number; targetWeightKg: number; weighInDays?: string[] }) =>
    api.post<WeightGoal>('/api/weight-goals', data),

  getGoals: () =>
    api.get<WeightGoal[]>('/api/weight-goals'),

  log: (data: { goalId: string; weightKg: number; waterLiters?: number; sleepHours?: number }) =>
    api.post<WeightLog & { celebration?: WeighInVerdict | null }>('/api/weight-logs', data),

  /** Newest first — the server orders by created_at descending. */
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
    api.get<{
      targets: NutritionTargets;
      /** 'user' when they set it themselves, 'survey' when we derived it, 'none' when there isn't one. */
      source: 'user' | 'survey' | 'none';
      /**
       * True when a target exists but is being withheld because the formula
       * that produces it has no clinical approval recorded. "Your dietitian
       * hasn't approved this yet" and "you haven't set targets" are different
       * sentences, and the screen should not use the second for the first.
       */
      withheldPendingApproval?: boolean;
    }>('/api/targets'),

  /** The person's own number, which needs no clinical approval to show back to them. */
  set: (targets: Partial<NutritionTargets>) =>
    api.put<{ targets: NutritionTargets; source: 'user' }>('/api/targets', targets),
};

export interface ActivePlan {
  plan: string;
  status: string;
  startedAt: string | null;
  /** null means open-ended, which is the normal case for a live subscription. */
  endsAt: string | null;
}

/**
 * What the signed-in person is entitled to.
 *
 * Worth surfacing for its own sake, and worth surfacing because of what the
 * server used to do here: getActiveSubscriptions tested status and never read
 * ends_at, so a plan that ended months ago still granted access — and once that
 * was fixed, a renewal after expiry silently granted nothing at all. A person
 * who can see their own plan and its end date can notice both.
 */
export const paymentsApi = {
  getMyPlans: () => api.get<{ plans: ActivePlan[] }>('/api/payments/my-plans'),
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
};

export default api;
