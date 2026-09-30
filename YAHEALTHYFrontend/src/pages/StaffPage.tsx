import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, ClipboardList, Inbox, Mail, MapPin, MessageCircle, Phone, Video } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { Num } from '@/components/ui/Num';
import { useLanguage } from '@/i18n/LanguageContext';
import { Escalation, FlaggedPayment, Order, StaffAppointment, StaffScope, staffApi } from '@/services/api';

type Tab = StaffScope | 'escalations' | 'payments' | 'orders';
// Orders first after the calendar: a paid menu is work someone is waiting on.
const TABS: Tab[] = ['upcoming', 'orders', 'attention', 'payments', 'escalations', 'recent'];
const TZ = 'Asia/Jerusalem';

// Stored canonical as 972501234567; shown the way people read a number here.
const displayPhone = (p: string) => (p.startsWith('972') ? `0${p.slice(3, 5)}-${p.slice(5)}` : p);
const waLink = (p: string) => `https://wa.me/${p.replace(/\D/g, '')}`;

const AppointmentCard = ({ a, onChanged }: { a: StaffAppointment; onChanged: () => void }) => {
  const { t, lang } = useLanguage();
  const [busy, setBusy] = useState(false);
  const locale = lang === 'he' ? 'he-IL' : 'en-GB';
  const start = new Date(a.start_at);
  const day = new Intl.DateTimeFormat(locale, { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'numeric' }).format(start);
  const time = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(start);
  const reasons = (a.needs_attention || '').split(',').filter(Boolean);

  const act = async (fn: () => Promise<unknown>, confirmText?: string) => {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(true);
    try {
      await fn();
      onChanged();
    } catch {
      window.alert(t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  const statusColor =
    a.status === 'booked' ? 'bg-emerald-50 text-emerald-700' : a.status === 'pending_payment' ? 'bg-amber-50 text-amber-800' : 'bg-slate-100 text-slate-500';

  return (
    <article className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-bold text-slate-900">{a.name}</p>
          <p className="text-sm text-slate-600">
            {t(`booking.type.${a.type}.name`)} · {day} · <Num>{time}</Num>
          </p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusColor}`}>
          {t(`staff.status.${a.status}`)}
          {a.status === 'cancelled' && a.cancelled_by ? ` ${t(`staff.cancelledBy.${a.cancelled_by}`)}` : ''}
        </span>
      </div>

      {reasons.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {reasons.map((r) => (
            <li key={r} className="flex items-start gap-2 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-800">
              <AlertTriangle size={15} className="mt-0.5 shrink-0" /> {t(`staff.reason.${r}`)}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-sm text-slate-700">
        <a href={`tel:+${a.phone}`} className="inline-flex items-center gap-1.5 hover:text-emerald-800">
          <Phone size={14} /> <Num>{displayPhone(a.phone)}</Num>
        </a>
        <a href={waLink(a.phone)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 hover:text-emerald-800">
          <MessageCircle size={14} /> {t('staff.openWhatsapp')}
        </a>
        {a.email && (
          <a href={`mailto:${a.email}`} className="inline-flex items-center gap-1.5 hover:text-emerald-800">
            <Mail size={14} /> <span dir="ltr">{a.email}</span>
          </a>
        )}
        {a.location && (
          <span className="inline-flex items-center gap-1.5"><MapPin size={14} /> {a.location}</span>
        )}
        {a.meet_link && (
          <a href={a.meet_link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 hover:text-emerald-800">
            <Video size={14} /> Meet
          </a>
        )}
        {a.amount ? <span>{t('staff.paid')}: <Num>₪{a.amount}</Num></span> : null}
      </div>

      {a.notes && (
        <p className="mt-3 whitespace-pre-wrap rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-700">
          <span className="font-semibold">{t('staff.notes')}: </span>{a.notes}
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {reasons.length > 0 && (
          <button disabled={busy} onClick={() => act(() => staffApi.resolve(a.id))} className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-60">
            {t('staff.resolve')}
          </button>
        )}
        {a.status !== 'cancelled' && (
          <button disabled={busy} onClick={() => act(() => staffApi.cancel(a.id), t('staff.confirmCancel'))} className="rounded-xl px-4 py-2 text-sm font-semibold text-rose-600 ring-1 ring-rose-200 hover:bg-rose-50 disabled:opacity-60">
            {t('staff.cancel')}
          </button>
        )}
      </div>
    </article>
  );
};

const EscalationCard = ({ m, onChanged }: { m: Escalation; onChanged: () => void }) => {
  const { t, lang } = useLanguage();
  const [busy, setBusy] = useState(false);
  const when = m.receivedAt
    ? new Intl.DateTimeFormat(lang === 'he' ? 'he-IL' : 'en-GB', { timeZone: TZ, dateStyle: 'short', timeStyle: 'short' }).format(new Date(m.receivedAt))
    : null;
  const phone = m.phone.replace(/@.*$/, '');

  return (
    <article className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-bold text-slate-900">{m.name || <Num>{displayPhone(phone)}</Num>}</p>
        {when && <span className="text-xs text-slate-500"><Num>{when}</Num></span>}
      </div>
      <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{m.body}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <a href={waLink(phone)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-100">
          <MessageCircle size={15} /> {t('staff.openWhatsapp')}
        </a>
        <button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await staffApi.handled(m.id);
              onChanged();
            } catch {
              window.alert(t('common.error'));
            } finally {
              setBusy(false);
            }
          }}
          className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-60"
        >
          {t('staff.resolve')}
        </button>
      </div>
    </article>
  );
};

const PaymentCard = ({ p, onChanged }: { p: FlaggedPayment; onChanged: () => void }) => {
  const { t, lang } = useLanguage();
  const [busy, setBusy] = useState(false);
  const when = p.receivedAt
    ? new Intl.DateTimeFormat(lang === 'he' ? 'he-IL' : 'en-GB', { timeZone: TZ, dateStyle: 'short', timeStyle: 'short' }).format(new Date(p.receivedAt))
    : null;
  const reasons = p.needsAttention.split(',').filter(Boolean);

  return (
    <article className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-bold text-slate-900">
          {p.amount != null ? <Num>₪{p.amount}</Num> : '—'} · {p.plan ? t(`staff.plan.${p.plan}`) : '—'}
        </p>
        {when && <span className="text-xs text-slate-500"><Num>{when}</Num></span>}
      </div>
      <ul className="mt-3 space-y-1.5">
        {reasons.map((r) => (
          <li key={r} className="flex items-start gap-2 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-800">
            <AlertTriangle size={15} className="mt-0.5 shrink-0" /> {t(`staff.payReason.${r}`)}
          </li>
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
        {p.email && (
          <a href={`mailto:${p.email}`} className="inline-flex items-center gap-1.5 hover:text-emerald-800">
            <Mail size={14} /> <span dir="ltr">{p.email}</span>
          </a>
        )}
        <span>PayPlus: <span dir="ltr" className="font-mono text-xs">{p.uid}</span></span>
      </div>
      <div className="mt-4">
        <button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await staffApi.resolvePayment(p.uid);
              onChanged();
            } catch {
              window.alert(t('common.error'));
            } finally {
              setBusy(false);
            }
          }}
          className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-60"
        >
          {t('staff.resolve')}
        </button>
      </div>
    </article>
  );
};

/** A paid personal menu: who, when, and moving it from paid to delivered. */
const OrderCard = ({ o, onChanged }: { o: Order; onChanged: () => void }) => {
  const { t, lang } = useLanguage();
  const [busy, setBusy] = useState(false);
  const when = new Intl.DateTimeFormat(lang === 'he' ? 'he-IL' : 'en-GB', { timeZone: TZ, dateStyle: 'short', timeStyle: 'short' }).format(new Date(o.created_at));
  const move = async (status: Order['status']) => {
    setBusy(true);
    try {
      await staffApi.setOrderStatus(o.id, status);
      onChanged();
    } catch {
      window.alert(t('common.error'));
    } finally {
      setBusy(false);
    }
  };
  const statusColor = o.status === 'paid' ? 'bg-amber-50 text-amber-800' : o.status === 'in_progress' ? 'bg-sky-50 text-sky-800' : 'bg-slate-100 text-slate-600';

  return (
    <article className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-50 text-violet-700"><ClipboardList size={18} aria-hidden="true" /></span>
          <div>
            <p className="font-bold text-slate-900">{t(`pricing.product.${o.product}.name`)}</p>
            <p className="text-xs text-slate-500"><Num>{when}</Num>{o.amount ? <> · <Num>₪{o.amount}</Num></> : null}</p>
          </div>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusColor}`}>{t(`staff.order.${o.status}`)}</span>
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-sm text-slate-700">
        {o.phone && (
          <>
            <a href={`tel:+${o.phone}`} className="inline-flex items-center gap-1.5 hover:text-emerald-800"><Phone size={14} aria-hidden="true" /> <Num>{displayPhone(o.phone)}</Num></a>
            <a href={waLink(o.phone)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 hover:text-emerald-800"><MessageCircle size={14} aria-hidden="true" /> {t('staff.openWhatsapp')}</a>
          </>
        )}
        {o.email && <a href={`mailto:${o.email}`} className="inline-flex items-center gap-1.5 hover:text-emerald-800"><Mail size={14} aria-hidden="true" /> <span dir="ltr">{o.email}</span></a>}
      </div>
      {(o.status === 'paid' || o.status === 'in_progress') && (
        <div className="mt-4 flex flex-wrap gap-2">
          {o.status === 'paid' && (
            <button disabled={busy} onClick={() => move('in_progress')} className="rounded-xl bg-sky-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-800 disabled:opacity-60">{t('staff.order.start')}</button>
          )}
          <button disabled={busy} onClick={() => move('delivered')} className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-60">{t('staff.order.deliver')}</button>
          <button disabled={busy} onClick={() => window.confirm(t('staff.order.confirmCancel')) && move('cancelled')} className="rounded-xl px-4 py-2 text-sm font-semibold text-rose-700 ring-1 ring-rose-200 hover:bg-rose-50 disabled:opacity-60">{t('staff.order.cancel')}</button>
        </div>
      )}
    </article>
  );
};

export const StaffPage = () => {
  const { t } = useLanguage();
  const [tab, setTab] = useState<Tab>('upcoming');
  const [appointments, setAppointments] = useState<StaffAppointment[] | null>(null);
  const [escalations, setEscalations] = useState<Escalation[] | null>(null);
  const [payments, setPayments] = useState<FlaggedPayment[] | null>(null);
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(() => {
    setFailed(false);
    if (tab === 'orders') {
      setOrders(null);
      staffApi.orders('open').then(({ data }) => setOrders(data.orders)).catch(() => setFailed(true));
    } else if (tab === 'payments') {
      setPayments(null);
      staffApi.payments().then(({ data }) => setPayments(data.payments)).catch(() => setFailed(true));
    } else if (tab === 'escalations') {
      setEscalations(null);
      staffApi.escalations().then(({ data }) => setEscalations(data.messages)).catch(() => setFailed(true));
    } else {
      setAppointments(null);
      staffApi.appointments(tab).then(({ data }) => setAppointments(data.appointments)).catch(() => setFailed(true));
    }
  }, [tab]);

  useEffect(load, [load]);

  const list = tab === 'escalations' ? escalations : tab === 'payments' ? payments : tab === 'orders' ? orders : appointments;

  return (
    <div className="mx-auto max-w-4xl p-4 md:p-8">
      <PageHeader title={t('staff.title')} subtitle={t('staff.subtitle')} />

      <div className="-mx-4 mb-6 flex gap-2 overflow-x-auto px-4 pb-1" role="tablist">
        {TABS.map((id) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition ${
              tab === id ? 'bg-emerald-700 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50'
            }`}
          >
            {t(`staff.tab.${id}`)}
          </button>
        ))}
      </div>

      {tab === 'escalations' && <p className="mb-4 text-sm text-slate-500">{t('staff.escalationHint')}</p>}
      {failed && <p className="text-rose-600">{t('common.error')}</p>}
      {!list && !failed && <p className="text-slate-500">{t('common.loading')}</p>}
      {list && list.length === 0 && <EmptyState icon={<Inbox size={28} />} text={t('staff.empty')} />}

      <div className="space-y-3">
        {tab === 'escalations'
          ? escalations?.map((m) => <EscalationCard key={m.id} m={m} onChanged={load} />)
          : tab === 'payments'
            ? payments?.map((p) => <PaymentCard key={p.uid} p={p} onChanged={load} />)
            : tab === 'orders'
              ? orders?.map((o) => <OrderCard key={o.id} o={o} onChanged={load} />)
              : appointments?.map((a) => <AppointmentCard key={a.id} a={a} onChanged={load} />)}
      </div>
    </div>
  );
};
