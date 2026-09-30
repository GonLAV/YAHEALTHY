import api from './api';

/** One timed fast. `ended_at` is null while it is running. */
export interface Fast {
  id: string;
  user_id: string;
  started_at: string; // ISO
  ended_at: string | null; // ISO
  target_hours: number;
  duration_hours: number | null;
  completed: boolean;
  created_at: string;
}

export interface FastingStats {
  totalCompleted: number;
  currentStreakDays: number;
  longestHours: number;
  averageHours: number | null; // last 30 days; null when there is nothing to average
}

export const fastingApi = {
  /** targetHours 8–72. startedAt defaults to now on the server. 409 if one is already running. */
  start: (targetHours: number, startedAt?: string) =>
    api.post<Fast>('/api/fasts/start', startedAt ? { targetHours, startedAt } : { targetHours }),

  /** 409 if already ended, 404 if not yours. */
  end: (id: string, endedAt?: string) =>
    api.post<Fast>(`/api/fasts/${id}/end`, endedAt ? { endedAt } : {}),

  getActive: () => api.get<Fast | null>('/api/fasts/active'),

  getAll: (limit = 30) => api.get<Fast[]>('/api/fasts', { params: { limit } }),

  /** Streak days are bucketed in the browser's time zone. */
  getStats: () =>
    api.get<FastingStats>('/api/fasts/stats', {
      params: { tzOffsetMinutes: new Date().getTimezoneOffset() },
    }),

  remove: (id: string) => api.delete<{ message: string; id: string }>(`/api/fasts/${id}`),
};

export default fastingApi;
