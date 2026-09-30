import api from './api';

/** Meal slots shown in the planner. The backend accepts any string; these match food-log meal types. */
export const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'] as const;
export type MealType = (typeof MEAL_TYPES)[number];

/** What auto-generate fills. Snacks are left to the user (generation picks from all recipes). */
export const GENERATED_MEAL_TYPES: MealType[] = ['breakfast', 'lunch', 'dinner'];

/** A row of `meal_plans` as returned by the backend. */
export interface MealPlan {
  id: string;
  user_id: string;
  recipe_id: string;
  date: string; // YYYY-MM-DD
  meal_type: string;
  completed: boolean;
  created_at?: string;
}

export interface GenerateMealPlansInput {
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD, at most 31 days after startDate
  mealTypes?: string[];
  overwrite?: boolean;
}

export interface GenerateMealPlansResult {
  startDate: string;
  endDate: string;
  mealTypes: string[];
  overwrite: boolean;
  deleted: number;
  createdCount: number;
  skippedCount: number;
  plans: MealPlan[];
}

export interface GroceryItem {
  item: string;
  /** Hebrew category from recipe data (e.g. "ירקות"), or null for legacy string ingredients. */
  category: string | null;
  /** Number of planned meals that use this item. */
  count: number;
  /** Free-text amounts, one per distinct recipe requirement. */
  amounts: string[];
}

export interface GroceryList {
  start: string | null;
  end: string | null;
  mealPlansCount: number;
  recipeIds: string[];
  totalUniqueItems: number;
  items: GroceryItem[];
}

export const mealPlanApi = {
  list: (params: { start?: string; end?: string }) =>
    api.get<MealPlan[]>('/api/meal-plans', { params }),

  /** 409 when the (date, mealType) slot is already planned. */
  create: (data: { recipeId: string; date: string; mealType: string }) =>
    api.post<MealPlan>('/api/meal-plans', data),

  generate: (data: GenerateMealPlansInput) =>
    api.post<GenerateMealPlansResult>('/api/meal-plans/generate', data),

  update: (id: string, data: { completed?: boolean; recipeId?: string }) =>
    api.put<MealPlan>(`/api/meal-plans/${id}`, data),

  remove: (id: string) => api.delete<MealPlan>(`/api/meal-plans/${id}`),

  groceryList: (params: { start?: string; end?: string }) =>
    api.get<GroceryList>('/api/grocery-list', { params }),
};

export default mealPlanApi;
