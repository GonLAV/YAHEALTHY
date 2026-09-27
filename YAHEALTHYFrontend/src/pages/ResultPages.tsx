import { ReactNode, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CalendarCheck, CheckCircle2, Clock, Loader2, MapPin, Video, XCircle } from 'lucide-react';
import { PublicLayout } from '@/components/layout/PublicLayout';
import { Num } from '@/components/ui/Num';
import { useLanguage } from '@/i18n/LanguageContext';
import { Appointment, Slot, bookingApi } from '@/services/api';
import { SlotPicker } from '@/components/SlotPicker';

/**
 * The pages people land on after leaving the app: the booking confirmation,
 * and the two addresses PayPlus sends a buyer back to (routes/payments.js and
 * routes/booking.js name them as successUrl / failureUrl).
 */

const Card = ({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) => (
  <div className="mx-auto max-w-lg rounded-3xl bg-white p-8 text-center shadow-xl ring-1 ring-slate-100">
    <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">{icon}</div>
    <h1 className="text-2xl font-extrabold text-slate-900">{title}</h1>
    <div className="mt-4 space-y-3 text-slate-600">{children}</div>
  </div>
);

const primary = 'inline-block rounded-xl bg-emerald-600 px-6 py-3 font-semibold text-white shadow-md shadow-emerald-200 transition hover:bg-emerald-700';
const secondary = 'inline-block rounded-xl bg-emerald-50 px-6 py-3 font-semibold text-emerald-700 transition hover:bg-emerald-100';

/**
 * Shown only to whoever holds the link with the token — the customer, from
 * this page or from their calendar invite. The server is what checks it.
 */
const CancelBox = ({ appointment, token, onCancelled }: { appointment: Appointment; token: string; onCancelled: (a: Appointment) => void }) => {
  const { t } = useLanguage();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (Date.parse(appointment.start) <= Date.now()) return null;

  const cancel = async () => {
    if (!window.confirm(t('confirm.confirmCancel'))) return;
    setBusy(true);
    setError('');
    try {
      const { data } = await bookingApi.cancel(appointment.id, token);
      onCancelled(data.appointment);
    } catch (err: any) {
      setError(err.response?.status === 409 ? t('confirm.tooLate') : t('common.error'));
      setBusy(false);
    }
  };

  return (
    <div className="border-t border-slate-100 pt-4">
      {appointment.amount ? <p className="mb-2 text-xs text-slate-500">{t('confirm.cancelPaidNote')}</p> : null}
      <button onClick={cancel} disabled={busy} className="text-sm font-semibold text-rose-600 hover:text-rose-700 disabled:opacity-60">
        {t('confirm.cancel')}
      </button>
      {error && <p role="alert" className="mt-2 text-sm text-rose-600">{error}</p>}
    </div>
  );
};

/**
 * Change the time, with the same token that allows cancelling. Only for a
 * booked meeting: a supermarket session still waiting for payment has no time
 * of its own yet worth moving.
 */
const RescheduleBox = ({ appointment, token, onMoved }: { appointment: Appointment; token: string; onMoved: (a: Appointment) => void }) => {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [selected, setSelected] = useState<Slot | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (appointment.status !== 'booked' || Date.parse(appointment.start) <= Date.now()) return null;

  const load = () => {
    setSlots(null);
    setSelected(null);
    bookingApi
      .moveSlots(appointment.id, token)
      .then(({ data }) => setSlots(data.slots))
      .catch(() => setError(t('booking.slotsError')));
  };

  const move = async () => {
    if (!selected) return;
    setBusy(true);
    setError('');
    try {
      const { data } = await bookingApi.reschedule(appointment.id, token, selected.start);
      setOpen(false);
      onMoved(data.appointment);
    } catch (err: any) {
      if (err.response?.status === 409) {
        setError(t('booking.slotTaken'));
        load();
      } else {
        setError(t('common.error'));
      }
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => {
          setOpen(true);
          load();
        }}
        className={secondary}
      >
        {t('confirm.reschedule')}
      </button>
    );
  }

  return (
    <div className="space-y-3 rounded-2xl bg-slate-50 p-4 text-start">
      <p className="font-semibold text-slate-900">{t('confirm.pickNewTime')}</p>
      {!slots && !error && <p className="text-sm text-slate-500">{t('booking.loadingSlots')}</p>}
      {slots && slots.length === 0 && <p className="text-sm text-slate-500">{t('booking.noSlots')}</p>}
      {slots && slots.length > 0 && <SlotPicker slots={slots} timeZone="Asia/Jerusalem" selected={selected} onSelect={setSelected} />}
      {error && <p role="alert" className="text-sm text-rose-600">{error}</p>}
      <div className="flex flex-wrap justify-end gap-2">
        <button onClick={() => setOpen(false)} className="rounded-xl px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100">
          {t('common.cancel')}
        </button>
        <button onClick={move} disabled={!selected || busy} className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
          {t('confirm.moveHere')}
        </button>
      </div>
    </div>
  );
};

// The PayPlus callback reaches the server on its own schedule, usually before
// the buyer's browser does and sometimes a little after. Polling covers the
// gap; after that the page says plainly that it has not arrived yet.
const POLL_MS = 2500;
const POLL_TRIES = 12;

export const BookingConfirmedPage = () => {
  const { t, lang } = useLanguage();
  const [params] = useSearchParams();
  const id = params.get('id') || '';
  const token = params.get('t') || '';
  const [appointment, setAppointment] = useState<Appointment | null>(null);
  const [justCancelled, setJustCancelled] = useState(false);
  const [justMoved, setJustMoved] = useState(false);
  const [missing, setMissing] = useState(false);
  const [tries, setTries] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const load = (n: number) => {
      bookingApi
        .get(id)
        .then(({ data }) => {
          if (cancelled) return;
          setAppointment(data.appointment);
          setTries(n);
          if (data.appointment.status === 'pending_payment' && n < POLL_TRIES) {
            timer = setTimeout(() => load(n + 1), POLL_MS);
          }
        })
        .catch(() => !cancelled && setMissing(true));
    };
    if (id) load(0);
    else setMissing(true);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [id]);

  if (missing) {
    return (
      <PublicLayout>
        <Card icon={<XCircle size={28} />} title={t('confirm.notFound')}>
          <Link to="/book" className={primary}>{t('confirm.another')}</Link>
        </Card>
      </PublicLayout>
    );
  }

  if (!appointment) {
    return (
      <PublicLayout>
        <Card icon={<Loader2 size={28} className="animate-spin" />} title={t('common.loading')} />
      </PublicLayout>
    );
  }

  const locale = lang === 'he' ? 'he-IL' : 'en-GB';
  const tz = 'Asia/Jerusalem';
  const start = new Date(appointment.start);
  const dateText = new Intl.DateTimeFormat(locale, { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long' }).format(start);
  const timeText = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(start);

  if (appointment.status === 'pending_payment') {
    const gaveUp = tries >= POLL_TRIES;
    return (
      <PublicLayout>
        <Card icon={gaveUp ? <Clock size={28} /> : <Loader2 size={28} className="animate-spin" />} title={t('confirm.pending')}>
          <p>{gaveUp ? t('confirm.stillPending') : t('confirm.pendingDesc')}</p>
        </Card>
      </PublicLayout>
    );
  }

  if (appointment.status === 'cancelled') {
    return (
      <PublicLayout>
        <Card icon={<XCircle size={28} />} title={justCancelled ? t('confirm.cancelledNow') : t('confirm.cancelled')}>
          {justCancelled && appointment.amount ? <p className="text-sm">{t('confirm.cancelPaidNote')}</p> : null}
          <Link to="/book" className={primary}>{t('confirm.another')}</Link>
        </Card>
      </PublicLayout>
    );
  }

  return (
    <PublicLayout>
      <Card icon={<CalendarCheck size={28} />} title={justMoved ? t('confirm.moved') : t('confirm.booked')}>
        <p className="font-semibold text-slate-900">{t(`booking.type.${appointment.type}.name`)}</p>
        <div className="rounded-2xl bg-slate-50 p-4 text-start text-sm">
          <p>
            <span className="text-slate-500">{t('confirm.when')}: </span>
            {dateText} · <Num>{timeText}</Num>
          </p>
          {appointment.location && (
            <p className="mt-2 flex items-start gap-1.5">
              <MapPin size={15} className="mt-0.5 shrink-0 text-slate-400" />
              <span><span className="text-slate-500">{t('confirm.where')}: </span>{appointment.location}</span>
            </p>
          )}
        </div>
        {appointment.meetLink && (
          <a href={appointment.meetLink} target="_blank" rel="noreferrer" className={`${primary} inline-flex items-center gap-2`}>
            <Video size={18} /> {t('confirm.join')}
          </a>
        )}
        <p className="text-sm">{t('confirm.inviteSent')}</p>
        <Link to="/book" className="text-sm font-semibold text-emerald-700 hover:text-emerald-800">{t('confirm.another')}</Link>
        {token && (
          <RescheduleBox
            appointment={appointment}
            token={token}
            onMoved={(a) => {
              setJustMoved(true);
              setAppointment(a);
            }}
          />
        )}
        {token && (
          <CancelBox
            appointment={appointment}
            token={token}
            onCancelled={(a) => {
              setJustCancelled(true);
              setAppointment(a);
            }}
          />
        )}
      </Card>
    </PublicLayout>
  );
};

export const WelcomePage = () => {
  const { t } = useLanguage();
  return (
    <PublicLayout>
      <Card icon={<CheckCircle2 size={28} />} title={t('welcome.title')}>
        <p>{t('welcome.email')}</p>
        <p className="text-sm">{t('welcome.whatsapp')}</p>
        <Link to="/login" className={primary}>{t('welcome.toLogin')}</Link>
      </Card>
    </PublicLayout>
  );
};

export const PaymentFailedPage = () => {
  const { t } = useLanguage();
  const [params] = useSearchParams();
  // A failed session payment goes back to picking a time: the hold on the old
  // one runs out on its own, and it may be gone by now anyway.
  const forBooking = params.has('booking');
  return (
    <PublicLayout>
      <Card icon={<XCircle size={28} />} title={t('failed.title')}>
        <p>{t('failed.desc')}</p>
        <div className="flex flex-wrap justify-center gap-2">
          {forBooking ? (
            <Link to="/book?type=supermarket" className={primary}>{t('failed.retryBooking')}</Link>
          ) : (
            <Link to="/pricing" className={primary}>{t('failed.retryPlan')}</Link>
          )}
          <Link to={forBooking ? '/pricing' : '/book'} className={secondary}>
            {forBooking ? t('nav.pricing') : t('nav.book')}
          </Link>
        </div>
      </Card>
    </PublicLayout>
  );
};
