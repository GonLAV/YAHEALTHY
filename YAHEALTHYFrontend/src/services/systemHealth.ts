// Staff-only system health (GET /api/admin/health). Non-staff get a 404 from
// the server; the page that shows this is behind StaffRoute as well.
import api from '@/services/api';

export interface JobHealth {
  name: string;
  schedule: string | null;
  enabled: boolean;
  disabledReason: string | null;
  running: boolean;
  runs: number;
  failures: number;
  lastStartedAt: string | null;
  lastFinishedAt: string | null;
  lastDurationMs: number | null;
  lastStatus: 'ok' | 'error' | null;
  lastCounts: { sent: number; failed: number; skipped: number } | null;
  lastError: { message: string; at: string } | null;
  lastSuccessAt: string | null;
}

export interface RouteErrors {
  route: string;
  count: number;
  lastStatus: number;
  lastAt: string;
}

export interface SystemHealth {
  status: 'ok' | 'degraded';
  generatedAt: string;
  startedAt: string;
  uptimeSeconds: number;
  version: { app: string; commit: string | null; node: string; environment: string; platform: string };
  db: { mode: 'memory' | 'supabase'; ok: boolean; latencyMs: number | null; error?: string };
  config: { production: boolean; requiredMissing: number; disabledFeatures: string[] };
  errorTracking: { enabled: boolean };
  jobs: JobHealth[];
  errors: { windowMinutes: number; serverErrors: number; clientErrors: number; routes: RouteErrors[]; droppedRoutes: number };
}

export const getSystemHealth = () => api.get<SystemHealth>('/api/admin/health');
