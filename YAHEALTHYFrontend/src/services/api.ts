import axios from 'axios';
import type { Attribution } from '@/utils/attribution';
import { browserTimeZone, todayISO } from '@/utils/date';

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

export interface SignupExtras {
  referralCode?: string;
  attribution?: Attribution;
  // Lifecycle messaging: which language and time zone to write in, and
  // whether the person ticked the (optional, unticked by default) marketing box.
  lang?: 'he' | 'en';
  timezone?: string;
  marketingConsent?: boolean;
}

export const authApi = {
  signup: (email: string, password: string, extras: SignupExtras = {}) =>
    api.post<AuthToken & { referralApplied?: boolean }>('/api/auth/signup', {
      email,
      password,
      ...extras,
    }),

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
    api.get<{ id: string; email: string; name?: string; isStaff?: boolean }>('/api/auth/me'),
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
    // tz lets the server pick the user's local "today" if date is omitted.
    api.post<HydrationLog>('/api/hydration-logs', { tz: browserTimeZone(), ...data }),

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
    api.post<SleepLog>('/api/sleep-logs', { tz: browserTimeZone(), ...data }),

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

// ── Engagement (streaks, Health Score, achievements) ─────────────────────
export type HabitKey = 'food' | 'hydration' | 'sleep' | 'anyLog';
export type ScoreComponentKey = 'nutrition' | 'hydration' | 'sleep' | 'consistency';

export interface HabitStreak {
  current: number;
  best: number;
  bestEndedOn: string | null;
  todayDone: boolean;
  atRisk: boolean;
  lastDate: string | null;
}

export interface ScoreComponent {
  key: ScoreComponentKey;
  weight: number;
  score: number; // 0–100
  points: number; // contribution to the headline score
  value: number;
  target: number | null;
  unit: string;
}

export interface Achievement {
  id: string;
  icon: string;
  title: string;
  description: string;
  available: boolean;
  unlocked: boolean;
  unlockedAt: string | null;
  progress: { current: number; target: number };
}

export interface NextMilestone {
  id: string | null;
  icon?: string;
  title?: string;
  description?: string;
  current?: number;
  target?: number;
  remaining?: number;
  message: string;
}

export interface EngagementSummary {
  today: string;
  tz: string;
  lang: 'he' | 'en';
  goals: { calorieTarget: number | null; waterTargetLiters: number; sleepTargetHours: number };
  healthScore: {
    today: number;
    components: ScoreComponent[];
    trend7d: { date: string; score: number }[];
    weights: Record<ScoreComponentKey, number>;
  };
  streaks: Record<HabitKey, HabitStreak>;
  achievements: Achievement[];
  unlockedCount: number;
  nextMilestone: NextMilestone;
}

export const engagementApi = {
  getSummary: (lang: string) =>
    api.get<EngagementSummary>('/api/engagement/summary', {
      params: { lang, tz: browserTimeZone() },
    }),
};

export const crmApi = {
  getInsights: (userId: string, lang: string) =>
    api.get(`/api/crm/users/${userId}/insights`, { params: { lang, date: todayISO(), tz: browserTimeZone() } }),
  askCoach: (userId: string, message: string, lang: string) =>
    api.post(`/api/crm/users/${userId}/ask`, { message }, { params: { lang, date: todayISO(), tz: browserTimeZone() } }),
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

// Referrals
export interface ReferralSummary {
  code: string;
  shareUrl: string;
  invitedCount: number;
  convertedCount: number;
  rewards: {
    type: string;
    perReferral: number;
    maxRewardedReferrals: number;
    earnedCount: number;
    earnedPremiumDays: number;
  };
}

export interface ReferralValidation {
  valid: boolean;
  referrerFirstName?: string;
}

export const referralApi = {
  getMe: () => api.get<ReferralSummary>('/api/referrals/me'),

  validate: (code: string) =>
    api.get<ReferralValidation>(`/api/referrals/validate/${encodeURIComponent(code)}`),
};

// "Share my week" — weekly card + public share links (routes/share.js)
export interface ShareSnapshot {
  v: number;
  lang: 'he' | 'en';
  week: { start: string; end: string };
  firstName: string | null;
  avgScore: number;
  trend: { date: string; score: number }[];
  daysLogged: number;
  waterHits: number;
  sleepHits: number;
  streak: number;
  bestStreak: number;
  badges: { id: string; icon?: string; title: string }[];
  weightChangeKg?: number;
}

export interface ShareOptions {
  showName: boolean;
  includeWeight: boolean;
}

export interface WeeklyCardPreview {
  card: ShareSnapshot & { weightChangeKg: number | null; unlockedCount: number };
  snapshot: ShareSnapshot;
  svg: string;
  width: number;
  height: number;
}

export interface ShareLink {
  token: string;
  url: string;
  imageUrl: string;
  expiresAt: string;
  snapshot: ShareSnapshot;
}

export const shareApi = {
  getWeeklyCard: (lang: string, opts: ShareOptions) =>
    api.get<WeeklyCardPreview>('/api/share/weekly-card', {
      params: {
        lang,
        tz: browserTimeZone(),
        showName: opts.showName ? 1 : 0,
        includeWeight: opts.includeWeight ? 1 : 0,
      },
    }),

  createLink: (lang: string, opts: ShareOptions) =>
    api.post<ShareLink>('/api/share/weekly-card/link', { lang, tz: browserTimeZone(), ...opts }),

  uploadImage: (token: string, png: Blob) =>
    api.put(`/api/share/c/${encodeURIComponent(token)}/image`, png, {
      headers: { 'Content-Type': 'image/png' },
    }),

  revoke: (token: string) => api.delete(`/api/share/c/${encodeURIComponent(token)}`),
};

// Web Push + reminders
export interface ReminderSettings {
  enabled: boolean;
  tz: string | null;
  lang: 'he' | 'en' | null;
  quietHours: { start: string; end: string };
  water: { enabled: boolean; intervalMinutes: number; start: string; end: string };
  meal: { enabled: boolean; time: string };
  streak: { enabled: boolean; time: string };
  /** Browsers subscribed for this account. */
  devices: number;
  /** False when the server has no VAPID keys (push switched off). */
  pushEnabled: boolean;
}

export type ReminderSettingsInput = Omit<ReminderSettings, 'devices' | 'pushEnabled' | 'tz' | 'lang'> & {
  tz?: string;
  lang?: 'he' | 'en';
};

export const pushApi = {
  getPublicKey: () => api.get<{ publicKey: string }>('/api/push/vapid-public-key'),

  subscribe: (subscription: PushSubscriptionJSON, extras: { tz?: string; lang?: 'he' | 'en' } = {}) =>
    api.post<{ subscribed: boolean; devices: number }>('/api/push/subscribe', { subscription, ...extras }),

  unsubscribe: (endpoint: string) =>
    api.delete<{ removed: boolean }>('/api/push/subscribe', { data: { endpoint } }),

  getReminders: () => api.get<ReminderSettings>('/api/push/reminders'),

  saveReminders: (settings: ReminderSettingsInput) =>
    api.put<ReminderSettings>('/api/push/reminders', settings),

  sendTest: (lang: 'he' | 'en') =>
    api.post<{ sent: number; removed: number; failed: number }>('/api/push/test', { lang }),
};

export const analyticsApi = {
  getInsights: () =>
    api.get('/api/insights/daily'),
};

// ── Marketing (public, no login) ─────────────────────────────────────────────

/** A plan checkout actually sells. `amount` is null when no price is configured. */
export interface MarketingPlan {
  id: string;
  label: string;
  amount: number | null;
  currency: string;
  includes: string[];
}

export interface LeadInput {
  email: string;
  name?: string;
  consent: boolean;
  lang?: 'he' | 'en';
  source?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_term?: string;
  utm_content?: string;
  /** Honeypot: hidden from people, left empty by them. */
  website?: string;
}

export const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'] as const;

export const marketingApi = {
  getPlans: () => api.get<{ plans: MarketingPlan[] }>('/api/marketing/plans'),
  submitLead: (lead: LeadInput) => api.post<{ ok: boolean }>('/api/marketing/leads', lead),
};

// Onboarding wizard. Status + completion + a targets preview computed by the
// backend calculators; everything else the wizard saves goes through the
// endpoints that already own that data (preferences, weight goals, hydration).
export type OnboardingGoal =
  | 'lose_weight'
  | 'maintain_weight'
  | 'gain_weight'
  | 'eat_healthier'
  | 'sleep_better'
  | 'more_energy';

export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active';

export interface OnboardingStatus {
  completed: boolean;
  completedAt: string | null;
  source: 'wizard' | 'existing' | null;
}

export interface TargetsPreviewInput {
  goal: OnboardingGoal;
  sex: 'male' | 'female';
  age?: number;
  birthYear?: number;
  heightCm: number;
  weightKg: number;
  targetWeightKg?: number | null;
  activityLevel: ActivityLevel;
}

export interface TargetRange {
  low: number;
  high: number;
  center: number;
}

export type SafetyFlag =
  | 'minor'
  | 'below-safe-floor'
  | 'bmi-low'
  | 'bmi-high'
  | 'target-bmi-low'
  | 'lose-while-underweight';

export interface TargetsPreview {
  inputs: TargetsPreviewInput & { age: number; calcGoal: 'lose' | 'maintain' | 'gain' };
  bmi: number;
  targetBmi: number | null;
  tdee: number | null;
  calories: TargetRange | null;
  macros: { proteinG: TargetRange; fatG: TargetRange; carbsG: TargetRange } | null;
  waterLiters: number;
  sleepHours: number;
  safety: { safeCalorieFloor: number; needsProfessional: boolean; flags: SafetyFlag[] };
}

export const onboardingApi = {
  getStatus: () => api.get<OnboardingStatus>('/api/onboarding'),

  complete: (skipped = false) =>
    api.post<OnboardingStatus & { skipped: boolean }>('/api/onboarding', skipped ? { skipped: true } : {}),

  previewTargets: (input: TargetsPreviewInput) =>
    api.post<TargetsPreview>('/api/onboarding/targets-preview', input),
};

export const preferencesApi = {
  get: () => api.get<{ preferences: Record<string, unknown> }>('/api/users/me/preferences'),

  // The server stores the object as given (it replaces, not merges), so
  // callers pass the full, merged preferences.
  put: (preferences: Record<string, unknown>) =>
    api.put<{ preferences: Record<string, unknown> }>('/api/users/me/preferences', { preferences }),
};

export default api;
