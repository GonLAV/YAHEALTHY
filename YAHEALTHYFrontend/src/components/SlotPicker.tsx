import { useEffect, useMemo, useState } from 'react';
import { Num } from '@/components/ui/Num';
import { useLanguage } from '@/i18n/LanguageContext';
import { Slot } from '@/services/api';

/**
 * Slots are instants; people think in "Sunday at 10:00" in Israel. Everything
 * shown is formatted in the calendar's time zone, not the browser's, so
 * someone booking from abroad sees the time the meeting actually happens.
 */
export const useSlotFormat = (timeZone: string) => {
  const { lang } = useLanguage();
  const locale = lang === 'he' ? 'he-IL' : 'en-GB';
  return useMemo(
    () => ({
      dayKey: (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso)),
      weekday: (iso: string) => new Intl.DateTimeFormat(locale, { timeZone, weekday: 'short' }).format(new Date(iso)),
      dayMonth: (iso: string) => new Intl.DateTimeFormat('en-GB', { timeZone, day: 'numeric', month: 'numeric' }).format(new Date(iso)),
      time: (iso: string) => new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso)),
    }),
    [timeZone, locale]
  );
};

const chip = (active: boolean) =>
  `rounded-xl px-3 py-2 text-sm font-medium transition ring-1 ${
    active ? 'bg-emerald-700 text-white ring-emerald-600' : 'bg-white text-slate-700 ring-slate-200 hover:ring-emerald-400'
  }`;

/**
 * Day chips, then the free times on the chosen day. Used by the booking page
 * and by "change time" on the confirmation page, so both read the same way.
 */
export const SlotPicker = ({
  slots,
  timeZone,
  selected,
  onSelect,
}: {
  slots: Slot[];
  timeZone: string;
  selected: Slot | null;
  onSelect: (slot: Slot) => void;
}) => {
  const fmt = useSlotFormat(timeZone);
  const days = useMemo(() => {
    const seen = new Map<string, string>();
    for (const s of slots) {
      const key = fmt.dayKey(s.start);
      if (!seen.has(key)) seen.set(key, s.start);
    }
    return [...seen.entries()];
  }, [slots, fmt]);

  const [day, setDay] = useState<string | null>(days[0]?.[0] ?? null);
  // A fresh list (after "someone took that time") may no longer have the day
  // that was open; fall back to the first day that still has times.
  useEffect(() => {
    if (!days.some(([key]) => key === day)) setDay(days[0]?.[0] ?? null);
  }, [days, day]);

  return (
    <>
      <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {days.map(([key, iso]) => (
          <button key={key} type="button" onClick={() => setDay(key)} aria-pressed={day === key} className={`${chip(day === key)} flex shrink-0 flex-col items-center`}>
            <span className="text-xs">{fmt.weekday(iso)}</span>
            <Num>{fmt.dayMonth(iso)}</Num>
          </button>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
        {slots.filter((s) => fmt.dayKey(s.start) === day).map((s) => (
          <button key={s.start} type="button" onClick={() => onSelect(s)} aria-pressed={selected?.start === s.start} className={chip(selected?.start === s.start)}>
            <Num>{fmt.time(s.start)}</Num>
          </button>
        ))}
      </div>
    </>
  );
};
