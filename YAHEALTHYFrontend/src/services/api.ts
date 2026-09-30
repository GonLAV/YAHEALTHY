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

  // Both answer the same way whether or not the address exists; see the
  // comments on the endpoints in YAHEALTHYbackend/index.js.
  requestPasswordReset: (email: string) =>
    api.post<{ message: string }>('/api/auth/request-password-reset', { email }),

  resetPassword: (token: string, newPassword: string) =>
    api.post<{ status: 'ok' }>('/api/auth/reset-password', { token, newPassword }),

  getCurrentUser: () =>
    api.get<{ id: string; email: string; isStaff?: boolean }>('/api/auth/me'),
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

// ── Purchase + booking (public: no account needed) ─────────────────────────

export interface Plan {
  id: string;
  label: string;
  amount: number;
  includes: string[];
  billing: 'monthly';
}

/** Sold once, straight from checkout, with nothing recurring: Yael's menu. */
export interface Product {
  id: 'menu';
  label: string;
  amount: number;
  billing: 'once';
}

export interface Session {
  id: 'supermarket';
  amount: number;
  billing: 'once';
}

export type AppointmentType = 'physical' | 'online' | 'supermarket';

export interface BookingOption {
  type: AppointmentType;
  durationMin: number;
  price: number;
  paid: boolean;
  location: string | null;
}

export interface Slot {
  start: string; // ISO
  end: string;
}

export interface Appointment {
  id: string;
  type: AppointmentType;
  start: string;
  end: string;
  status: 'pending_payment' | 'booked' | 'cancelled';
  meetLink: string | null;
  location: string | null;
  amount: number | null;
}

export interface BookingInput {
  type: AppointmentType;
  start: string;
  name: string;
  phone: string;
  email?: string;
  location?: string;
  notes?: string;
}

export const purchaseApi = {
  plans: () => api.get<{ plans: Plan[]; products: Product[]; sessions: Session[] }>('/api/payments/plans'),

  checkout: (data: { plan: string; name: string; email: string; phone: string }) =>
    api.post<{ paymentPageLink: string }>('/api/payments/checkout', data),
};

/**
 * The demo stand-in for PayPlus (see isDemo in YAHEALTHYbackend/utils/payplus.js).
 * These answer 404 anywhere demo payments are off, which includes production.
 */
export const demoPayApi = {
  get: (ref: string) =>
    api.get<{ amount: number; currency: string; item: string; label: string; email: string }>(`/api/payments/demo/${encodeURIComponent(ref)}`),
  finish: (ref: string, outcome: 'pay' | 'cancel') =>
    api.post<{ redirect: string }>(`/api/payments/demo/${encodeURIComponent(ref)}/${outcome}`),
};

export const bookingApi = {
  options: () =>
    api.get<{ timeZone: string; calendarConnected: boolean; types: BookingOption[] }>('/api/booking/options'),

  slots: (type: AppointmentType) => api.get<{ slots: Slot[] }>('/api/booking/slots', { params: { type } }),

  book: (data: BookingInput) =>
    api.post<{ appointment: Appointment; cancelToken: string; paymentPageLink?: string }>('/api/booking', data),

  get: (id: string) => api.get<{ appointment: Appointment }>(`/api/booking/${id}`),

  cancel: (id: string, token: string) =>
    api.post<{ appointment: Appointment }>(`/api/booking/${id}/cancel`, { token }),

  moveSlots: (id: string, token: string) =>
    api.get<{ slots: Slot[] }>(`/api/booking/${id}/slots`, { params: { t: token } }),

  reschedule: (id: string, token: string, start: string) =>
    api.post<{ appointment: Appointment }>(`/api/booking/${id}/reschedule`, { token, start }),
};

// ── Staff (server-side guarded by requireStaff) ────────────────────────────

export interface StaffAppointment {
  id: string;
  type: AppointmentType;
  start_at: string;
  end_at: string;
  status: Appointment['status'];
  name: string;
  phone: string;
  email: string | null;
  location: string | null;
  notes: string | null;
  amount: number | null;
  meet_link: string | null;
  cancelled_by: 'customer' | 'staff' | 'expired' | null;
  needs_attention: string | null;
}

export interface Escalation {
  id: string;
  phone: string;
  name: string | null;
  body: string;
  receivedAt: string | null;
}

export type StaffScope = 'upcoming' | 'attention' | 'recent';

export interface Order {
  id: string;
  product: 'menu';
  email: string | null;
  phone: string | null;
  amount: number | null;
  status: 'paid' | 'in_progress' | 'delivered' | 'cancelled';
  created_at: string;
}

export interface FlaggedPayment {
  uid: string;
  email: string | null;
  plan: string | null;
  status: string;
  amount: number | null;
  currency: string | null;
  needsAttention: string;
  receivedAt: string | null;
}

export const staffApi = {
  appointments: (scope: StaffScope) =>
    api.get<{ appointments: StaffAppointment[] }>('/api/staff/appointments', { params: { scope } }),
  cancel: (id: string) => api.post(`/api/staff/appointments/${id}/cancel`),
  resolve: (id: string) => api.post(`/api/staff/appointments/${id}/resolve`),
  escalations: () => api.get<{ messages: Escalation[] }>('/api/staff/escalations'),
  handled: (id: string) => api.post(`/api/staff/escalations/${encodeURIComponent(id)}/handled`),
  /** A false flag: marks it handled and clears the person's kept health flag. */
  notHealth: (id: string) => api.post(`/api/staff/escalations/${encodeURIComponent(id)}/not-health`),
  payments: () => api.get<{ payments: FlaggedPayment[] }>('/api/staff/payments'),
  orders: (scope: 'open' | 'all' = 'open') => api.get<{ orders: Order[] }>('/api/staff/orders', { params: { scope } }),
  setOrderStatus: (id: string, status: Order['status']) => api.post(`/api/staff/orders/${id}/status`, { status }),
  resolvePayment: (uid: string) => api.post(`/api/staff/payments/${encodeURIComponent(uid)}/resolve`),
};

// ── Meal plans + shopping list ──────────────────────────────────────────────

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export interface MealPlan {
  id: string;
  recipe_id: string;
  date: string; // YYYY-MM-DD
  meal_type: MealType;
}

export interface GroceryItem {
  item: string;
  category: string | null;
  count: number;
  amounts: string[];
}

export const mealPlanApi = {
  list: (start: string, end: string) => api.get<MealPlan[]>('/api/meal-plans', { params: { start, end } }),
  add: (recipeId: string, date: string, mealType: MealType) =>
    api.post<MealPlan>('/api/meal-plans', { recipeId, date, mealType }),
  remove: (id: string) => api.delete(`/api/meal-plans/${id}`),
};

export const groceryApi = {
  list: (start: string, end: string) =>
    api.get<{ items: GroceryItem[]; mealPlansCount: number }>('/api/grocery-list', { params: { start, end } }),
};

// ── Reminders (YAHEALTHYbackend/utils/nudges.js) ────────────────────────────

export type NudgeKind = 'water' | 'breakfast' | 'menu' | 'praise';

export interface NudgeItem {
  id: string;
  kind: NudgeKind | 'test';
  channel: 'whatsapp' | 'app';
  body: string;
  readAt: string | null;
  createdAt: string;
}

export interface NudgeSettings {
  settings: { enabled: boolean } & Record<NudgeKind, boolean>;
  schedule: { hour: number; kind: NudgeKind }[];
  hasPhone: boolean;
  whatsapp: boolean;
  pausedForHealth: boolean;
}

export const notificationsApi = {
  list: () => api.get<{ items: NudgeItem[]; unread: number }>('/api/notifications'),
  markRead: () => api.post('/api/notifications/read'),
  settings: () => api.get<NudgeSettings>('/api/notifications/settings'),
  save: (settings: NudgeSettings['settings']) => api.put<NudgeSettings>('/api/notifications/settings', settings),
  test: (kind: NudgeKind) => api.post<{ channel: 'whatsapp' | 'app'; body: string }>('/api/notifications/test', { kind }),
};

export const analyticsApi = {
  getInsights: () =>
    api.get('/api/insights/daily'),
};

export default api;
