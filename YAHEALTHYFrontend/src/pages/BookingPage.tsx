import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AlertCircle, MapPin, ShoppingCart, Stethoscope, Video } from 'lucide-react';
import { PublicLayout } from '@/components/layout/PublicLayout';
import { Num } from '@/components/ui/Num';
import { useLanguage } from '@/i18n/LanguageContext';
import { AppointmentType, BookingOption, Slot, bookingApi } from '@/services/api';
import { inputClass, looksLikeIsraeliMobile } from '@/pages/PricingPage';
import { SlotPicker, useSlotFormat } from '@/components/SlotPicker';

const ICONS: Record<AppointmentType, JSX.Element> = {
  physical: <Stethoscope size={22} />,
  online: <Video size={22} />,
  supermarket: <ShoppingCart size={22} />,
};

export const BookingPage = () => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const [options, setOptions] = useState<BookingOption[] | null>(null);
  const [timeZone, setTimeZone] = useState('Asia/Jerusalem');
  const [optionsFailed, setOptionsFailed] = useState(false);
  const [type, setType] = useState<AppointmentType | null>(null);

  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [slotsError, setSlotsError] = useState(false);
  const [slot, setSlot] = useState<Slot | null>(null);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [location, setLocation] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const fmt = useSlotFormat(timeZone);

  useEffect(() => {
    bookingApi
      .options()
      .then(({ data }) => {
        setOptions(data.types);
        setTimeZone(data.timeZone);
        const wanted = params.get('type');
        if (data.types.some((o) => o.type === wanted)) setType(wanted as AppointmentType);
      })
      .catch(() => setOptionsFailed(true));
  }, [params]);

  const loadSlots = (which: AppointmentType) => {
    setSlots(null);
    setSlotsError(false);
    setSlot(null);
    bookingApi
      .slots(which)
      .then(({ data }) => setSlots(data.slots))
      .catch(() => setSlotsError(true));
  };

  useEffect(() => {
    if (type) loadSlots(type);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type]);

  const option = options?.find((o) => o.type === type) || null;
  const paid = Boolean(option?.paid);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!type || !slot) return;
    setError('');
    if (!looksLikeIsraeliMobile(phone)) {
      setError(t('form.invalidPhone'));
      return;
    }
    setBusy(true);
    try {
      const { data } = await bookingApi.book({
        type,
        start: slot.start,
        name,
        phone,
        email: email || undefined,
        location: type === 'supermarket' ? location : undefined,
        notes: notes || undefined,
      });
      if (data.paymentPageLink) {
        window.location.href = data.paymentPageLink;
        return;
      }
      navigate(`/book/confirmed?id=${data.appointment.id}&t=${encodeURIComponent(data.cancelToken)}`);
    } catch (err: any) {
      setBusy(false);
      const status = err.response?.status;
      if (status === 409) {
        setError(t('booking.slotTaken'));
        loadSlots(type);
      } else if (status === 400) {
        setError(t('pricing.invalid'));
      } else if (status === 503) {
        // Say what is actually unavailable: "booking unavailable" for a
        // payment problem sent people away from a calendar that was fine.
        setError(err.response?.data?.code === 'payments_unavailable' ? t('pricing.unavailable') : t('booking.unavailable'));
      } else {
        setError(t('common.error'));
      }
    }
  };

  const emailHint = paid ? t('booking.emailHintPaid') : type === 'online' ? t('booking.emailHintOnline') : t('booking.emailHint');

  return (
    <PublicLayout>
      <div className="mx-auto max-w-3xl">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-extrabold text-slate-900">{t('booking.title')}</h1>
          <p className="mt-2 text-slate-600">{t('booking.subtitle')}</p>
        </div>

        {optionsFailed && <p className="text-center text-slate-500">{t('booking.unavailable')}</p>}
        {!options && !optionsFailed && <p className="text-center text-slate-500">{t('common.loading')}</p>}

        {options && (
          <section aria-labelledby="step-type" className="mb-8">
            <h2 id="step-type" className="mb-3 font-bold text-slate-900">{t('booking.chooseType')}</h2>
            <div className="grid gap-3 sm:grid-cols-3">
              {options.map((o) => (
                <button
                  key={o.type}
                  onClick={() => setType(o.type)}
                  aria-pressed={type === o.type}
                  className={`flex flex-col items-start rounded-2xl bg-white p-4 text-start ring-1 transition ${
                    type === o.type ? 'ring-2 ring-emerald-500 shadow-md shadow-emerald-100' : 'ring-slate-200 hover:ring-emerald-300'
                  }`}
                >
                  <span className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">{ICONS[o.type]}</span>
                  <span className="font-semibold text-slate-900">{t(`booking.type.${o.type}.name`)}</span>
                  <span className="mt-1 text-xs text-slate-500">{t(`booking.type.${o.type}.desc`)}</span>
                  <span className="mt-3 flex items-center gap-2 text-sm">
                    <span className={o.paid ? 'font-bold text-slate-900' : 'font-semibold text-emerald-700'}>
                      {o.paid ? <Num>₪{o.price}</Num> : t('booking.free')}
                    </span>
                    <span className="text-slate-400">·</span>
                    <span className="text-slate-500"><Num unit={t('booking.min')}>{o.durationMin}</Num></span>
                  </span>
                </button>
              ))}
            </div>
            {option?.location && (
              <p className="mt-3 flex items-center gap-1.5 text-sm text-slate-600">
                <MapPin size={15} className="shrink-0" /> {option.location}
              </p>
            )}
          </section>
        )}

        {type && (
          <section aria-labelledby="step-time" className="mb-8">
            <h2 id="step-time" className="mb-3 font-bold text-slate-900">{t('booking.chooseTime')}</h2>
            {slotsError && <p className="text-sm text-rose-600">{t('booking.slotsError')}</p>}
            {!slots && !slotsError && <p className="text-sm text-slate-500">{t('booking.loadingSlots')}</p>}
            {slots && slots.length === 0 && <p className="text-sm text-slate-500">{t('booking.noSlots')}</p>}
            {slots && slots.length > 0 && (
              <SlotPicker slots={slots} timeZone={timeZone} selected={slot} onSelect={setSlot} />
            )}
          </section>
        )}

        {type && slot && (
          <form onSubmit={submit} aria-labelledby="step-details" className="space-y-4 rounded-3xl bg-white p-6 shadow-xl ring-1 ring-slate-100 md:p-8">
            <div className="flex items-start justify-between gap-3">
              <h2 id="step-details" className="font-bold text-slate-900">{t('booking.details')}</h2>
              <span className="rounded-full bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-800">
                {fmt.weekday(slot.start)} <Num>{fmt.dayMonth(slot.start)}</Num> · <Num>{fmt.time(slot.start)}</Num>
              </span>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="bk-name" className="mb-1.5 block text-sm font-medium text-slate-700">{t('form.name')}</label>
                <input id="bk-name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} required minLength={2} />
              </div>
              <div>
                <label htmlFor="bk-phone" className="mb-1.5 block text-sm font-medium text-slate-700">{t('form.phone')}</label>
                <input id="bk-phone" type="tel" autoComplete="tel" dir="ltr" placeholder="050-1234567" value={phone} onChange={(e) => setPhone(e.target.value)} className={inputClass} required />
              </div>
            </div>
            <div>
              <label htmlFor="bk-email" className="mb-1.5 block text-sm font-medium text-slate-700">
                {t('form.email')} {!paid && <span className="font-normal text-slate-400">({t('form.optional')})</span>}
              </label>
              <input id="bk-email" type="email" autoComplete="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} required={paid} />
              <p className="mt-1.5 text-xs text-slate-500">{emailHint}</p>
            </div>
            {type === 'supermarket' && (
              <div>
                <label htmlFor="bk-location" className="mb-1.5 block text-sm font-medium text-slate-700">{t('booking.location')}</label>
                <input id="bk-location" value={location} onChange={(e) => setLocation(e.target.value)} placeholder={t('booking.locationPlaceholder')} className={inputClass} required maxLength={200} />
              </div>
            )}
            <div>
              <label htmlFor="bk-notes" className="mb-1.5 block text-sm font-medium text-slate-700">
                {t('booking.notes')} <span className="font-normal text-slate-400">({t('form.optional')})</span>
              </label>
              <textarea id="bk-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} className={inputClass} maxLength={1000} />
            </div>

            {error && (
              <div role="alert" className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                <AlertCircle size={16} className="shrink-0" />
                {error}
              </div>
            )}

            <button type="submit" disabled={busy} className="w-full rounded-xl bg-emerald-600 py-3 font-semibold text-white shadow-md shadow-emerald-200 transition hover:bg-emerald-700 disabled:opacity-60">
              {busy ? t('booking.submitting') : paid ? <>{t('pricing.toPayment')} · <Num>₪{option?.price}</Num></> : t('booking.submitFree')}
            </button>
            {paid && <p className="text-center text-xs text-slate-400">{t('booking.holdNote')} {t('pricing.securePayment')}</p>}
          </form>
        )}
      </div>
    </PublicLayout>
  );
};
