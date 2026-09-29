/**
 * Plan display helpers, shared by the landing page and /upgrade.
 *
 * The catalog itself lives on the server (YAHEALTHYbackend/utils/plans.js,
 * served by GET /api/marketing/plans). Prices come from the server's
 * environment and are null until the owner sets them — this module never
 * invents a number. No imports: the landing page is public and must stay light.
 */
import type { Lang } from '@/i18n/translations';

export type EntitlementKey = 'premium' | 'coach_insights' | 'meal_planner' | 'chef_whatsapp' | 'human_coaching';

export const ENTITLEMENT_KEYS: readonly EntitlementKey[] = [
  'premium',
  'coach_insights',
  'meal_planner',
  'chef_whatsapp',
  'human_coaching',
];

export type PlanPeriod = 'month' | 'year' | '3_months' | 'once';

export interface MarketingPlan {
  id: string;
  /** Hebrew name, kept for older clients. */
  label: string;
  name?: { he: string; en: string };
  period?: PlanPeriod | string;
  months?: number | null;
  kind?: string;
  featured?: boolean;
  amount: number | null;
  currency: string;
  includes: string[];
}

export interface PlansResponse {
  plans: MarketingPlan[];
  checkout?: { enabled: boolean; cancellationPolicyUrl: string | null };
}

/** Legacy ids from the first checkout, and what they became. */
export const LEGACY_PLAN_ALIASES: Readonly<Record<string, string>> = { base: 'coaching_3m', yoni: 'combo_3m' };

export const resolvePlanId = (id: string): string => LEGACY_PLAN_ALIASES[id] ?? id;

export function planName(plan: MarketingPlan, lang: Lang): string {
  return plan.name?.[lang] || plan.label || plan.id;
}

/** i18n key for the "per …" suffix, or null when there is no price to qualify. */
export function periodKey(plan: MarketingPlan): string | null {
  switch (plan.period) {
    case 'month':
      return 'plans.period.month';
    case 'year':
      return 'plans.period.year';
    case '3_months':
      return 'plans.period.3_months';
    case 'once':
      return 'plans.period.once';
    default:
      return null;
  }
}

/** "₪49" in the page's language, or null when the server has no price ("price on request"). */
export function formatPlanPrice(plan: Pick<MarketingPlan, 'amount' | 'currency'> | undefined, lang: Lang): string | null {
  if (!plan || plan.amount === null || !(plan.amount > 0)) return null;
  return new Intl.NumberFormat(lang === 'he' ? 'he-IL' : 'en-US', {
    style: 'currency',
    currency: plan.currency || 'ILS',
    maximumFractionDigits: Number.isInteger(plan.amount) ? 0 : 2,
  }).format(plan.amount);
}

/**
 * What the plan's button does:
 *   'pay'     — checkout is open and the plan has a price
 *   'contact' — "Talk to us" (lead form / WhatsApp): checkout is off, or no price
 */
export type PlanCta = 'pay' | 'contact';

export function planCta(plan: Pick<MarketingPlan, 'amount'>, checkoutEnabled: boolean): PlanCta {
  return checkoutEnabled && plan.amount !== null && plan.amount > 0 ? 'pay' : 'contact';
}

/** i18n key naming one entitlement, for "what's included" lists. */
export const entitlementLabelKey = (key: string): string => `plans.includes.${key}`;

/** The catalog in display order, with a legacy id in `preferred` mapped across. */
export function orderPlans(plans: MarketingPlan[], preferred?: string | null): MarketingPlan[] {
  const want = preferred ? resolvePlanId(preferred) : null;
  if (!want) return plans;
  const hit = plans.find((p) => p.id === want);
  return hit ? [hit, ...plans.filter((p) => p !== hit)] : plans;
}

/** "until 1 Nov 2026" date text, or null for no end. */
export function formatEndDate(iso: string | null | undefined, lang: Lang): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat(lang === 'he' ? 'he-IL' : 'en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Jerusalem',
  }).format(d);
}
