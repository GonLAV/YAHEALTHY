// Staff-only marketing analytics (/api/analytics/*). Every endpoint answers a
// non-staff caller with 404, so the page must never be the only guard — it is
// hidden for non-staff, and the server refuses them regardless.
import api from '@/services/api';

export interface DateRangeQuery {
  from: string; // YYYY-MM-DD, inclusive (UTC day)
  to: string;
}

interface Envelope {
  range: { from: string; to: string; days: number };
  generatedAt: string;
}

export type FunnelStageKey = 'leads' | 'signups' | 'activated' | 'engaged' | 'paying';

export interface FunnelResponse extends Envelope {
  stages: { key: FunnelStageKey; count: number; rateFromPrevious: number | null; rateFromSignups: number | null }[];
  pending: { activation: number; engagement: number };
  /** Paying signups per catalog plan (legacy base/yoni folded in). */
  payingByPlan?: Record<string, number>;
  definitions: { activationWindowDays: number; engagementWindowDays: number; engagementMinActiveDays: number };
}

export type Channel = 'referral' | 'campaign' | 'organic';

export interface AcquisitionTally {
  signups: number;
  activated: number;
  engaged: number;
  paying: number;
  activationRate: number | null;
  engagementRate: number | null;
  payingRate: number | null;
}

export interface AcquisitionRow extends AcquisitionTally {
  channel: Channel;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
}

export interface AcquisitionResponse extends Envelope {
  rows: AcquisitionRow[];
  byChannel: (AcquisitionTally & { channel: Channel })[];
  total: AcquisitionTally;
}

export interface ReferrerRow {
  rank: number;
  firstName: string | null;
  maskedEmail: string;
  invites: number;
  activated: number;
  conversions: number;
  conversionRate: number | null;
  rewardsEarned: number;
  rewardCount: number;
}

export interface ReferralsResponse extends Envelope {
  leaderboard: ReferrerRow[];
  totals: {
    referrers: number;
    invites: number;
    activated: number;
    conversions: number;
    rewardsEarned: number;
    conversionRate: number | null;
  };
}

export interface RetentionCell {
  week: number;
  eligible: number;
  active: number;
  rate: number | null;
}

export interface RetentionResponse extends Envelope {
  weeks: number;
  cohorts: { cohortStart: string; size: number; cells: RetentionCell[] }[];
  overall: RetentionCell[];
}

export interface LeadsSummaryResponse extends Envelope {
  total: number;
  signups: number;
  leadToSignupRate: number | null;
  perDay: { date: string; count: number }[];
  perSource: { source: string; leads: number; signups: number; rate: number | null }[];
}

export interface CampaignStepStats {
  sent: number;
  failed: number;
  pending: number;
  converted: number;
}

/** One lifecycle campaign's counts from the send log (utils/lifecycle.js summarizeStats). */
export interface CampaignStats extends CampaignStepStats {
  campaign: string;
  marketing: boolean;
  /** Always null: plain-text email carries no open tracking. Never displayed. */
  opened: number | null;
  conversionRate: number | null;
  byStep: Record<string, CampaignStepStats>;
  byChannel: Record<string, number>;
}

export interface CampaignStatsResponse {
  campaigns: Record<string, CampaignStats>;
  notes?: Record<string, string>;
}

export const marketingAnalyticsApi = {
  /** Lifecycle email/WhatsApp campaigns, all time (not range-bound). */
  campaignStats: () => api.get<CampaignStatsResponse>('/api/marketing/campaigns/stats'),
  funnel: (range: DateRangeQuery) => api.get<FunnelResponse>('/api/analytics/funnel', { params: range }),
  acquisition: (range: DateRangeQuery) =>
    api.get<AcquisitionResponse>('/api/analytics/acquisition', { params: range }),
  referrals: (range: DateRangeQuery) => api.get<ReferralsResponse>('/api/analytics/referrals', { params: range }),
  retention: (range: DateRangeQuery) => api.get<RetentionResponse>('/api/analytics/retention', { params: range }),
  leadsSummary: (range: DateRangeQuery) =>
    api.get<LeadsSummaryResponse>('/api/analytics/leads/summary', { params: range }),
  /** The existing staff-only leads export (routes/marketing.js), as a file. */
  leadsCsv: () => api.get<Blob>('/api/marketing/leads', { params: { format: 'csv' }, responseType: 'blob' }),
};
