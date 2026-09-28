import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ArrowDown, ArrowUp, ArrowUpDown, Download, Inbox, Megaphone, UserCheck, UserPlus, Wallet, Zap } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatCard } from '@/components/ui/StatCard';
import { useLanguage } from '@/i18n/LanguageContext';
import '@/i18n/strings/staff'; // this page's analytics.* strings (kept off the public pages)
import {
  marketingAnalyticsApi,
  type AcquisitionResponse,
  type AcquisitionRow,
  type CampaignStatsResponse,
  type CampaignStepStats,
  type DateRangeQuery,
  type FunnelResponse,
  type LeadsSummaryResponse,
  type ReferralsResponse,
  type RetentionResponse,
} from '@/services/marketingAnalytics';

// ─── dates (UTC days, matching the server) ──────────────────────────────────
const DAY_MS = 86400000;
const MAX_RANGE_DAYS = 366;
const PRESETS = [7, 30, 90] as const;
type Preset = (typeof PRESETS)[number] | 'custom';

const utcDay = (d: Date) => d.toISOString().slice(0, 10);
const todayUtc = () => utcDay(new Date());
const shiftDay = (day: string, n: number) => utcDay(new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS));
const presetRange = (days: number): DateRangeQuery => {
  const to = todayUtc();
  return { from: shiftDay(to, -(days - 1)), to };
};
const spanDays = (r: DateRangeQuery) => Math.round((Date.parse(r.to) - Date.parse(r.from)) / DAY_MS) + 1;

// ─── section state ──────────────────────────────────────────────────────────
type Loadable<T> = { status: 'loading' } | { status: 'error' } | { status: 'ready'; data: T };

interface Sections {
  funnel: Loadable<FunnelResponse>;
  acquisition: Loadable<AcquisitionResponse>;
  referrals: Loadable<ReferralsResponse>;
  retention: Loadable<RetentionResponse>;
  leads: Loadable<LeadsSummaryResponse>;
}

const LOADING: Sections = {
  funnel: { status: 'loading' },
  acquisition: { status: 'loading' },
  referrals: { status: 'loading' },
  retention: { status: 'loading' },
  leads: { status: 'loading' },
};

const settle = <T,>(r: PromiseSettledResult<{ data: T }>): Loadable<T> =>
  r.status === 'fulfilled' ? { status: 'ready', data: r.value.data } : { status: 'error' };

// Sequential single-hue scale (emerald) for the cohort heatmap; the value is
// always printed in the cell, so colour is never the only carrier.
const HEAT_STEPS = [
  { min: 0.6, bg: 'bg-emerald-600', text: 'text-white' },
  { min: 0.4, bg: 'bg-emerald-500', text: 'text-white' },
  { min: 0.25, bg: 'bg-emerald-300', text: 'text-emerald-950' },
  { min: 0.1, bg: 'bg-emerald-200', text: 'text-emerald-950' },
  { min: 0, bg: 'bg-emerald-50', text: 'text-emerald-900' },
];
const heat = (rate: number) => HEAT_STEPS.find((s) => rate >= s.min) ?? HEAT_STEPS[HEAT_STEPS.length - 1];

// Send order of each lifecycle campaign's steps (utils/lifecycle.js CAMPAIGNS);
// a step the server knows and this list does not is shown after these.
const CAMPAIGN_STEP_ORDER: Record<string, string[]> = {
  lead_nurture: ['welcome', 'day2', 'day5'],
  onboarding: ['day0', 'day1', 'day3', 'day7'],
  streak_risk: ['evening'],
  win_back: ['d7', 'd21'],
};
const orderedSteps = (campaign: string, byStep: Record<string, CampaignStepStats>) => {
  const known = CAMPAIGN_STEP_ORDER[campaign] ?? [];
  return [...known.filter((s) => s in byStep), ...Object.keys(byStep).filter((s) => !known.includes(s))];
};

// ─── small building blocks ──────────────────────────────────────────────────
const Card = ({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) => (
  <section aria-label={title} className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
      <h2 className="text-base font-semibold text-slate-900">{title}</h2>
      {action}
    </div>
    {children}
  </section>
);

const SectionStatus = ({ state, children }: { state: Loadable<unknown>; children: ReactNode }) => {
  const { t } = useLanguage();
  if (state.status === 'loading') {
    return (
      <p role="status" aria-live="polite" className="py-6 text-center text-sm text-slate-500">
        {t('analytics.loading')}
      </p>
    );
  }
  if (state.status === 'error') {
    return (
      <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
        {t('analytics.error')}
      </p>
    );
  }
  return <>{children}</>;
};

type SortKey = keyof Pick<
  AcquisitionRow,
  'channel' | 'utm_source' | 'utm_medium' | 'utm_campaign' | 'signups' | 'activated' | 'activationRate' | 'paying' | 'payingRate'
>;

const ACQ_COLUMNS: { key: SortKey; label: string; numeric: boolean }[] = [
  { key: 'channel', label: 'analytics.acq.channel', numeric: false },
  { key: 'utm_source', label: 'analytics.acq.source', numeric: false },
  { key: 'utm_medium', label: 'analytics.acq.medium', numeric: false },
  { key: 'utm_campaign', label: 'analytics.acq.campaign', numeric: false },
  { key: 'signups', label: 'analytics.acq.signups', numeric: true },
  { key: 'activated', label: 'analytics.acq.activated', numeric: true },
  { key: 'activationRate', label: 'analytics.acq.activationRate', numeric: true },
  { key: 'paying', label: 'analytics.acq.paying', numeric: true },
  { key: 'payingRate', label: 'analytics.acq.payingRate', numeric: true },
];

const csvCell = (value: unknown) => {
  if (value === null || value === undefined) return '';
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  if (/[",\r\n]/.test(text)) text = `"${text.replace(/"/g, '""')}"`;
  return text;
};

const saveBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

// ─── page ───────────────────────────────────────────────────────────────────
export const MarketingDashboardPage = () => {
  const { t, lang } = useLanguage();
  const [preset, setPreset] = useState<Preset>(30);
  const [range, setRange] = useState<DateRangeQuery>(() => presetRange(30));
  const [draft, setDraft] = useState<DateRangeQuery>(() => presetRange(30));
  const [rangeError, setRangeError] = useState(false);
  const [sections, setSections] = useState<Sections>(LOADING);
  const [exportError, setExportError] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'signups', dir: 'desc' });
  const [campaigns, setCampaigns] = useState<Loadable<CampaignStatsResponse>>({ status: 'loading' });

  const locale = lang === 'he' ? 'he-IL' : 'en-US';
  const pct = useMemo(() => new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 1 }), [locale]);
  const num = useMemo(() => new Intl.NumberFormat(locale), [locale]);
  const fmtRate = (r: number | null | undefined) => (r === null || r === undefined ? t('analytics.none') : pct.format(r));
  const fmtDay = (day: string) =>
    new Date(`${day}T00:00:00Z`).toLocaleDateString(locale, { day: 'numeric', month: 'short', timeZone: 'UTC' });

  const load = useCallback(async (r: DateRangeQuery) => {
    setSections(LOADING);
    const [funnel, acquisition, referrals, retention, leads] = await Promise.allSettled([
      marketingAnalyticsApi.funnel(r),
      marketingAnalyticsApi.acquisition(r),
      marketingAnalyticsApi.referrals(r),
      marketingAnalyticsApi.retention(r),
      marketingAnalyticsApi.leadsSummary(r),
    ]);
    setSections({
      funnel: settle(funnel),
      acquisition: settle(acquisition),
      referrals: settle(referrals),
      retention: settle(retention),
      leads: settle(leads),
    });
  }, []);

  useEffect(() => {
    load(range);
  }, [load, range]);

  // Lifecycle campaign counts are all-time, so they do not follow the range.
  useEffect(() => {
    marketingAnalyticsApi
      .campaignStats()
      .then((res) => setCampaigns({ status: 'ready', data: res.data }))
      .catch(() => setCampaigns({ status: 'error' }));
  }, []);

  const choosePreset = (p: Preset) => {
    setPreset(p);
    setRangeError(false);
    if (p !== 'custom') {
      const next = presetRange(p);
      setRange(next);
      setDraft(next);
    }
  };

  const applyCustom = (e: FormEvent) => {
    e.preventDefault();
    const valid =
      /^\d{4}-\d{2}-\d{2}$/.test(draft.from) &&
      /^\d{4}-\d{2}-\d{2}$/.test(draft.to) &&
      draft.from <= draft.to &&
      spanDays(draft) <= MAX_RANGE_DAYS;
    setRangeError(!valid);
    if (valid) setRange({ ...draft });
  };

  const exportLeads = async () => {
    setExportError(false);
    try {
      const res = await marketingAnalyticsApi.leadsCsv();
      saveBlob(res.data, `leads-${todayUtc()}.csv`);
    } catch {
      setExportError(true);
    }
  };

  const channelLabel = (c: string) => t(`analytics.channel.${c}`);

  const sortedRows = useMemo(() => {
    if (sections.acquisition.status !== 'ready') return [];
    const rows = [...sections.acquisition.data.rows];
    const { key, dir } = sort;
    const factor = dir === 'asc' ? 1 : -1;
    rows.sort((a, b) => {
      const av = key === 'channel' ? channelLabel(a.channel) : a[key];
      const bv = key === 'channel' ? channelLabel(b.channel) : b[key];
      if (av === bv) return 0;
      if (av === null || av === undefined) return 1; // blanks last either way
      if (bv === null || bv === undefined) return -1;
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * factor;
      return String(av).localeCompare(String(bv), locale) * factor;
    });
    return rows;
    // channelLabel depends on lang only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sections.acquisition, sort, locale]);

  const toggleSort = (key: SortKey, numeric: boolean) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: numeric ? 'desc' : 'asc' }));

  const exportAcquisition = () => {
    const header = ACQ_COLUMNS.map((c) => csvCell(t(c.label)));
    const lines = [header.join(',')];
    for (const row of sortedRows) {
      lines.push(
        ACQ_COLUMNS.map((c) => csvCell(c.key === 'channel' ? channelLabel(row.channel) : row[c.key])).join(','),
      );
    }
    // BOM so Excel opens Hebrew as UTF-8.
    saveBlob(new Blob(['﻿' + lines.join('\r\n') + '\r\n'], { type: 'text/csv;charset=utf-8' }), `acquisition-${range.from}-${range.to}.csv`);
  };

  // ── derived views ──
  const funnel = sections.funnel.status === 'ready' ? sections.funnel.data : null;
  const leads = sections.leads.status === 'ready' ? sections.leads.data : null;
  const stageCount = (key: string) => funnel?.stages.find((s) => s.key === key);

  const funnelData = (funnel?.stages ?? []).map((s) => ({
    key: s.key,
    name: t(`analytics.funnel.stage.${s.key}`),
    count: s.count,
  }));
  const funnelSummary = (funnel?.stages ?? [])
    .map((s) =>
      s.rateFromPrevious === null
        ? `${t(`analytics.funnel.stage.${s.key}`)}: ${num.format(s.count)}`
        : `${t(`analytics.funnel.stage.${s.key}`)}: ${num.format(s.count)} (${t('analytics.funnel.stepRate', { rate: fmtRate(s.rateFromPrevious) })})`,
    )
    .join('; ');

  const leadsPeak = leads?.perDay.reduce((best, d) => (d.count > best.count ? d : best), { date: '', count: 0 });
  const leadsChartSummary =
    leads && leads.total > 0 && leadsPeak
      ? t('analytics.leads.chartSummary', {
          total: num.format(leads.total),
          days: leads.perDay.length,
          date: fmtDay(leadsPeak.date),
          peak: num.format(leadsPeak.count),
        })
      : t('analytics.leads.chartEmpty');
  const leadsChartData = (leads?.perDay ?? []).map((d) => ({ ...d, label: fmtDay(d.date) }));

  const presetBtn = (active: boolean) =>
    `rounded-full px-3 py-1.5 text-sm font-semibold transition ${
      active ? 'bg-emerald-600 text-white shadow-sm' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
    }`;

  const thNum = 'px-3 py-2 text-end font-semibold';
  const thText = 'px-3 py-2 text-start font-semibold';
  const tdNum = 'num px-3 py-2 text-end tabular-nums';
  const tdText = 'px-3 py-2 text-start';

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-8">
      <PageHeader title={t('analytics.title')} subtitle={t('analytics.subtitle')} icon={<Megaphone size={24} />} />

      {/* Controls */}
      <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:flex-row lg:items-end lg:justify-between">
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-slate-700">{t('analytics.range.label')}</legend>
          <div className="flex flex-wrap items-center gap-2">
            {PRESETS.map((p) => (
              <button key={p} type="button" aria-pressed={preset === p} onClick={() => choosePreset(p)} className={presetBtn(preset === p)}>
                {t('analytics.range.days', { n: p })}
              </button>
            ))}
            <button type="button" aria-pressed={preset === 'custom'} onClick={() => choosePreset('custom')} className={presetBtn(preset === 'custom')}>
              {t('analytics.range.custom')}
            </button>
          </div>
          {preset === 'custom' && (
            <form onSubmit={applyCustom} className="mt-3 flex flex-wrap items-end gap-3" noValidate>
              <div>
                <label htmlFor="analytics-from" className="block text-xs font-medium text-slate-600">
                  {t('analytics.range.from')}
                </label>
                <input
                  id="analytics-from"
                  type="date"
                  dir="ltr"
                  value={draft.from}
                  max={draft.to || todayUtc()}
                  onChange={(e) => setDraft((d) => ({ ...d, from: e.target.value }))}
                  aria-invalid={rangeError}
                  aria-describedby={rangeError ? 'analytics-range-error' : undefined}
                  className="mt-1 rounded-xl border border-slate-300 px-3 py-1.5 text-sm"
                />
              </div>
              <div>
                <label htmlFor="analytics-to" className="block text-xs font-medium text-slate-600">
                  {t('analytics.range.to')}
                </label>
                <input
                  id="analytics-to"
                  type="date"
                  dir="ltr"
                  value={draft.to}
                  min={draft.from}
                  max={todayUtc()}
                  onChange={(e) => setDraft((d) => ({ ...d, to: e.target.value }))}
                  aria-invalid={rangeError}
                  aria-describedby={rangeError ? 'analytics-range-error' : undefined}
                  className="mt-1 rounded-xl border border-slate-300 px-3 py-1.5 text-sm"
                />
              </div>
              <button type="submit" className="rounded-full bg-emerald-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700">
                {t('analytics.range.apply')}
              </button>
              {rangeError && (
                <p id="analytics-range-error" role="alert" className="w-full text-sm text-rose-700">
                  {t('analytics.range.invalid')}
                </p>
              )}
            </form>
          )}
          <p className="mt-2 text-xs text-slate-500">
            {t('analytics.range.showing', { from: range.from, to: range.to })}
          </p>
        </fieldset>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={exportLeads}
            className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            <Download size={16} aria-hidden="true" />
            {t('analytics.export.leads')}
          </button>
          <button
            type="button"
            onClick={exportAcquisition}
            disabled={sections.acquisition.status !== 'ready'}
            className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <Download size={16} aria-hidden="true" />
            {t('analytics.export.acquisition')}
          </button>
          {exportError && (
            <p role="alert" className="w-full text-sm text-rose-700">
              {t('analytics.export.error')}
            </p>
          )}
        </div>
      </div>

      {/* KPI tiles */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard
          label={t('analytics.kpi.leads')}
          value={stageCount('leads') ? num.format(stageCount('leads')!.count) : t('analytics.none')}
          icon={<Inbox size={18} aria-hidden="true" />}
          color="sky"
        />
        <StatCard
          label={t('analytics.kpi.signups')}
          value={stageCount('signups') ? num.format(stageCount('signups')!.count) : t('analytics.none')}
          icon={<UserPlus size={18} aria-hidden="true" />}
        />
        <StatCard
          label={t('analytics.kpi.activation')}
          value={fmtRate(stageCount('activated')?.rateFromSignups)}
          icon={<Zap size={18} aria-hidden="true" />}
          color="amber"
        />
        <StatCard
          label={t('analytics.kpi.paying')}
          value={stageCount('paying') ? num.format(stageCount('paying')!.count) : t('analytics.none')}
          unit={stageCount('paying') ? fmtRate(stageCount('paying')!.rateFromSignups) : undefined}
          icon={<Wallet size={18} aria-hidden="true" />}
          color="violet"
        />
        <StatCard
          label={t('analytics.kpi.leadToSignup')}
          value={fmtRate(leads?.leadToSignupRate)}
          icon={<UserCheck size={18} aria-hidden="true" />}
          color="rose"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Funnel */}
        <Card title={t('analytics.funnel.title')}>
          <SectionStatus state={sections.funnel}>
            {funnel && (
              <>
                <figure>
                  <div className="h-64" aria-hidden="true">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={funnelData} layout="vertical" margin={{ left: 8, right: 24 }}>
                        <CartesianGrid horizontal={false} stroke="#e2e8f0" />
                        <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} />
                        <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 12 }} />
                        <Tooltip formatter={(v: number) => [num.format(v), t('analytics.funnel.count')]} />
                        <Bar dataKey="count" fill="#059669" radius={[0, 4, 4, 0]} barSize={22} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <figcaption className="sr-only">{funnelSummary}</figcaption>
                </figure>
                <ol className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-600 sm:grid-cols-4">
                  {funnel.stages.slice(1).map((s) => (
                    <li key={s.key} className="rounded-xl bg-slate-50 px-3 py-2">
                      <span className="block font-semibold text-slate-800">{t(`analytics.funnel.stage.${s.key}`)}</span>
                      <span className="num">{t('analytics.funnel.stepRate', { rate: fmtRate(s.rateFromPrevious) })}</span>
                    </li>
                  ))}
                </ol>
                <p className="mt-3 text-xs text-slate-500">
                  {t('analytics.funnel.definitions', {
                    a: funnel.definitions.activationWindowDays,
                    m: funnel.definitions.engagementMinActiveDays,
                    e: funnel.definitions.engagementWindowDays,
                  })}
                </p>
                {funnel.pending.activation > 0 && (
                  <p className="mt-1 text-xs text-amber-700">
                    {t('analytics.funnel.pending', { n: num.format(funnel.pending.activation) })}
                  </p>
                )}
              </>
            )}
          </SectionStatus>
        </Card>

        {/* Leads */}
        <Card title={t('analytics.leads.title')}>
          <SectionStatus state={sections.leads}>
            {leads && (
              <>
                <figure>
                  <h3 className="mb-2 text-sm font-medium text-slate-700">{t('analytics.leads.perDay')}</h3>
                  <div className="h-48" aria-hidden="true">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={leadsChartData} margin={{ left: 0, right: 8 }}>
                        <CartesianGrid vertical={false} stroke="#e2e8f0" />
                        <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" minTickGap={16} />
                        <YAxis allowDecimals={false} width={32} tick={{ fontSize: 11 }} />
                        <Tooltip formatter={(v: number) => [num.format(v), t('analytics.leads.leads')]} />
                        <Bar dataKey="count" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <figcaption className="sr-only">{leadsChartSummary}</figcaption>
                </figure>
                {leads.perSource.length > 0 ? (
                  <div className="mt-4 overflow-x-auto">
                    <table className="w-full text-sm">
                      <caption className="mb-2 text-start text-sm font-medium text-slate-700">
                        {t('analytics.leads.perSource')}
                      </caption>
                      <thead className="bg-slate-50 text-xs text-slate-600">
                        <tr>
                          <th scope="col" className={thText}>{t('analytics.leads.source')}</th>
                          <th scope="col" className={thNum}>{t('analytics.leads.leads')}</th>
                          <th scope="col" className={thNum}>{t('analytics.leads.signups')}</th>
                          <th scope="col" className={thNum}>{t('analytics.leads.rate')}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {leads.perSource.map((s) => (
                          <tr key={s.source}>
                            <th scope="row" className={`${tdText} font-medium`} dir="auto">{s.source}</th>
                            <td className={tdNum}>{num.format(s.leads)}</td>
                            <td className={tdNum}>{num.format(s.signups)}</td>
                            <td className={tdNum}>{fmtRate(s.rate)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="mt-4 text-sm text-slate-500">{t('analytics.leads.chartEmpty')}</p>
                )}
              </>
            )}
          </SectionStatus>
        </Card>
      </div>

      {/* Acquisition */}
      <Card title={t('analytics.acq.title')}>
        <SectionStatus state={sections.acquisition}>
          {sortedRows.length === 0 ? (
            <p className="text-sm text-slate-500">{t('analytics.empty')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <caption className="mb-2 text-start text-xs text-slate-500">{t('analytics.acq.caption')}</caption>
                <thead className="bg-slate-50 text-xs text-slate-600">
                  <tr>
                    {ACQ_COLUMNS.map((c) => {
                      const active = sort.key === c.key;
                      const SortIcon = !active ? ArrowUpDown : sort.dir === 'asc' ? ArrowUp : ArrowDown;
                      return (
                        <th
                          key={c.key}
                          scope="col"
                          aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                          className={c.numeric ? thNum : thText}
                        >
                          <button
                            type="button"
                            onClick={() => toggleSort(c.key, c.numeric)}
                            className="inline-flex items-center gap-1 rounded hover:text-slate-900"
                          >
                            {t(c.label)}
                            <SortIcon size={12} aria-hidden="true" className={active ? 'text-emerald-600' : 'text-slate-400'} />
                          </button>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {sortedRows.map((r) => (
                    <tr key={`${r.channel}|${r.utm_source}|${r.utm_medium}|${r.utm_campaign}`}>
                      <th scope="row" className={`${tdText} font-medium text-slate-800`}>{channelLabel(r.channel)}</th>
                      <td className={tdText} dir="auto">{r.utm_source ?? t('analytics.none')}</td>
                      <td className={tdText} dir="auto">{r.utm_medium ?? t('analytics.none')}</td>
                      <td className={tdText} dir="auto">{r.utm_campaign ?? t('analytics.none')}</td>
                      <td className={tdNum}>{num.format(r.signups)}</td>
                      <td className={tdNum}>{num.format(r.activated)}</td>
                      <td className={tdNum}>{fmtRate(r.activationRate)}</td>
                      <td className={tdNum}>{num.format(r.paying)}</td>
                      <td className={tdNum}>{fmtRate(r.payingRate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionStatus>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        {/* Referrals */}
        <Card title={t('analytics.ref.title')}>
          <SectionStatus state={sections.referrals}>
            {sections.referrals.status === 'ready' &&
              (sections.referrals.data.leaderboard.length === 0 ? (
                <p className="text-sm text-slate-500">{t('analytics.ref.empty')}</p>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[560px] text-sm">
                      <caption className="mb-2 text-start text-xs text-slate-500">{t('analytics.ref.caption')}</caption>
                      <thead className="bg-slate-50 text-xs text-slate-600">
                        <tr>
                          <th scope="col" className={thNum}>{t('analytics.ref.rank')}</th>
                          <th scope="col" className={thText}>{t('analytics.ref.name')}</th>
                          <th scope="col" className={thText}>{t('analytics.ref.email')}</th>
                          <th scope="col" className={thNum}>{t('analytics.ref.invites')}</th>
                          <th scope="col" className={thNum}>{t('analytics.ref.activated')}</th>
                          <th scope="col" className={thNum}>{t('analytics.ref.conversions')}</th>
                          <th scope="col" className={thNum}>{t('analytics.ref.rewards')}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {sections.referrals.data.leaderboard.map((r) => (
                          <tr key={r.rank}>
                            <td className={tdNum}>{r.rank}</td>
                            <th scope="row" className={`${tdText} font-medium text-slate-800`} dir="auto">
                              {r.firstName ?? <span className="font-normal italic text-slate-400">{t('analytics.ref.noName')}</span>}
                            </th>
                            <td className={`${tdText} num`} dir="ltr">{r.maskedEmail}</td>
                            <td className={tdNum}>{num.format(r.invites)}</td>
                            <td className={tdNum}>{num.format(r.activated)}</td>
                            <td className={tdNum}>{num.format(r.conversions)}</td>
                            <td className={tdNum}>{num.format(r.rewardsEarned)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="mt-3 text-xs text-slate-500">
                    {t('analytics.ref.totals', {
                      invites: num.format(sections.referrals.data.totals.invites),
                      referrers: num.format(sections.referrals.data.totals.referrers),
                      conversions: num.format(sections.referrals.data.totals.conversions),
                      rate: fmtRate(sections.referrals.data.totals.conversionRate),
                      rewards: num.format(sections.referrals.data.totals.rewardsEarned),
                    })}
                  </p>
                </>
              ))}
          </SectionStatus>
        </Card>

        {/* Retention heatmap */}
        <Card title={t('analytics.ret.title')}>
          <SectionStatus state={sections.retention}>
            {sections.retention.status === 'ready' &&
              (sections.retention.data.cohorts.length === 0 ? (
                <p className="text-sm text-slate-500">{t('analytics.empty')}</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[560px] border-separate border-spacing-0.5 text-xs">
                    <caption className="mb-2 text-start text-xs text-slate-500">{t('analytics.ret.caption')}</caption>
                    <thead className="text-slate-600">
                      <tr>
                        <th scope="col" className="px-2 py-1 text-start font-semibold">{t('analytics.ret.cohort')}</th>
                        <th scope="col" className="px-2 py-1 text-end font-semibold">{t('analytics.ret.size')}</th>
                        {Array.from({ length: sections.retention.data.weeks }, (_, n) => (
                          <th key={n} scope="col" className="px-2 py-1 text-center font-semibold">
                            {t('analytics.ret.week', { n })}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        ...sections.retention.data.cohorts.map((c) => ({
                          key: c.cohortStart,
                          label: fmtDay(c.cohortStart),
                          size: c.size,
                          cells: c.cells,
                        })),
                        {
                          key: 'overall',
                          label: t('analytics.ret.overall'),
                          size: sections.retention.data.cohorts.reduce((s, c) => s + c.size, 0),
                          cells: sections.retention.data.overall,
                        },
                      ].map((row) => (
                        <tr key={row.key} className={row.key === 'overall' ? 'font-semibold' : undefined}>
                          <th scope="row" className="whitespace-nowrap px-2 py-1.5 text-start font-medium text-slate-700">
                            {row.label}
                          </th>
                          <td className="num px-2 py-1.5 text-end text-slate-600">{num.format(row.size)}</td>
                          {row.cells.map((cell) =>
                            cell.rate === null ? (
                              <td key={cell.week} className="rounded bg-slate-50 px-2 py-1.5 text-center text-slate-300">
                                <span aria-hidden="true">·</span>
                                <span className="sr-only">{t('analytics.ret.notYet')}</span>
                              </td>
                            ) : (
                              <td
                                key={cell.week}
                                className={`num rounded px-2 py-1.5 text-center ${heat(cell.rate).bg} ${heat(cell.rate).text}`}
                                title={`${num.format(cell.active)} / ${num.format(cell.eligible)}`}
                              >
                                {pct.format(cell.rate)}
                              </td>
                            ),
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
          </SectionStatus>
        </Card>
      </div>

      {/* Lifecycle campaigns */}
      <Card title={t('analytics.camp.title')}>
        <SectionStatus state={campaigns}>
          {campaigns.status === 'ready' && (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <caption className="mb-2 text-start text-xs text-slate-500">{t('analytics.camp.caption')}</caption>
                  <thead className="bg-slate-50 text-xs text-slate-600">
                    <tr>
                      <th scope="col" className={thText}>{t('analytics.camp.campaign')}</th>
                      <th scope="col" className={thNum}>{t('analytics.camp.sent')}</th>
                      <th scope="col" className={thNum}>{t('analytics.camp.failed')}</th>
                      <th scope="col" className={thNum}>{t('analytics.camp.pending')}</th>
                      <th scope="col" className={thNum}>{t('analytics.camp.converted')}</th>
                      <th scope="col" className={thNum}>{t('analytics.camp.rate')}</th>
                    </tr>
                  </thead>
                  {Object.values(campaigns.data.campaigns).map((c) => {
                    const name = t(`analytics.camp.name.${c.campaign}`);
                    return (
                      <tbody key={c.campaign} className="border-t border-slate-200">
                        <tr className="bg-white font-semibold text-slate-800">
                          <th scope="row" className={`${tdText} font-semibold`}>
                            {name}
                            {c.marketing && (
                              <span className="ms-2 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                                {t('analytics.camp.marketing')}
                              </span>
                            )}
                            <span className="sr-only"> — {t('analytics.camp.total')}</span>
                          </th>
                          <td className={tdNum}>{num.format(c.sent)}</td>
                          <td className={tdNum}>{num.format(c.failed)}</td>
                          <td className={tdNum}>{num.format(c.pending)}</td>
                          <td className={tdNum}>{num.format(c.converted)}</td>
                          <td className={tdNum}>{fmtRate(c.conversionRate)}</td>
                        </tr>
                        {orderedSteps(c.campaign, c.byStep).map((step) => {
                          const s = c.byStep[step];
                          return (
                            <tr key={step} className="text-slate-600">
                              <th scope="row" className={`${tdText} ps-8 font-normal`}>
                                <span className="sr-only">{name} — </span>
                                {t('analytics.camp.step')} <span className="num font-mono text-xs" dir="ltr">{step}</span>
                              </th>
                              <td className={tdNum}>{num.format(s.sent ?? 0)}</td>
                              <td className={tdNum}>{num.format(s.failed ?? 0)}</td>
                              <td className={tdNum}>{num.format(s.pending ?? 0)}</td>
                              <td className={tdNum}>{num.format(s.converted ?? 0)}</td>
                              <td className={tdNum}>{fmtRate(s.sent ? s.converted / s.sent : null)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    );
                  })}
                </table>
              </div>
              <p className="mt-3 text-xs text-slate-500">{t('analytics.camp.notes')}</p>
            </>
          )}
        </SectionStatus>
      </Card>
    </div>
  );
};

export default MarketingDashboardPage;
