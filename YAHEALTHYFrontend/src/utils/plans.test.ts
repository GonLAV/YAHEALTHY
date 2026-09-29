import { describe, expect, it } from 'vitest';
import {
  entitlementLabelKey,
  formatEndDate,
  formatPlanPrice,
  orderPlans,
  periodKey,
  planCta,
  planName,
  resolvePlanId,
  type MarketingPlan,
} from './plans';
import { translations } from '@/i18n/translations';

const plan = (over: Partial<MarketingPlan> = {}): MarketingPlan => ({
  id: 'app_m',
  label: 'מנוי אפליקציה — חודשי',
  name: { he: 'מנוי אפליקציה — חודשי', en: 'App subscription — monthly' },
  period: 'month',
  months: 1,
  amount: null,
  currency: 'ILS',
  includes: ['premium'],
  ...over,
});

describe('plan display helpers', () => {
  it('never invents a price: null, zero and negative are "price on request"', () => {
    expect(formatPlanPrice(plan(), 'he')).toBeNull();
    expect(formatPlanPrice(plan({ amount: 0 }), 'en')).toBeNull();
    expect(formatPlanPrice(plan({ amount: -5 }), 'en')).toBeNull();
    expect(formatPlanPrice(undefined, 'en')).toBeNull();
  });

  it('formats a configured price in shekels', () => {
    expect(formatPlanPrice(plan({ amount: 49 }), 'en')).toBe('₪49');
    expect(formatPlanPrice(plan({ amount: 49 }), 'he')).toContain('49');
    expect(formatPlanPrice(plan({ amount: 399.9 }), 'en')).toBe('₪399.90');
  });

  it('shows Pay only when checkout is open AND the plan has a price', () => {
    expect(planCta(plan({ amount: 49 }), true)).toBe('pay');
    expect(planCta(plan({ amount: 49 }), false)).toBe('contact');
    expect(planCta(plan({ amount: null }), true)).toBe('contact');
  });

  it('names a plan in the page language, falling back to the Hebrew label', () => {
    expect(planName(plan(), 'en')).toBe('App subscription — monthly');
    expect(planName(plan({ name: undefined }), 'en')).toBe('מנוי אפליקציה — חודשי');
  });

  it('maps legacy ids and puts a requested plan first', () => {
    expect(resolvePlanId('yoni')).toBe('combo_3m');
    expect(resolvePlanId('base')).toBe('coaching_3m');
    const list = [plan(), plan({ id: 'combo_3m' })];
    expect(orderPlans(list, 'yoni')[0].id).toBe('combo_3m');
    expect(orderPlans(list, 'nope')).toBe(list);
  });

  it('every period and entitlement label exists in both languages', () => {
    for (const period of ['month', 'year', '3_months', 'once']) {
      const key = periodKey(plan({ period }))!;
      expect(translations.he[key as keyof typeof translations.he]).toBeTruthy();
      expect(translations.en[key as keyof typeof translations.en]).toBeTruthy();
    }
    for (const k of ['premium', 'coach_insights', 'meal_planner', 'chef_whatsapp', 'human_coaching']) {
      expect(translations.he[entitlementLabelKey(k) as keyof typeof translations.he]).toBeTruthy();
      expect(translations.en[entitlementLabelKey(k) as keyof typeof translations.en]).toBeTruthy();
    }
    expect(periodKey(plan({ period: 'weird' }))).toBeNull();
  });

  it('formats an end date, and nothing for no end', () => {
    expect(formatEndDate(null, 'en')).toBeNull();
    expect(formatEndDate('garbage', 'en')).toBeNull();
    expect(formatEndDate('2026-11-01T10:00:00Z', 'en')).toBe('1 Nov 2026');
  });
});
