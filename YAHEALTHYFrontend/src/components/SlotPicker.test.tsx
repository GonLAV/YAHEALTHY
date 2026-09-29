import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SlotPicker } from './SlotPicker';
import type { Slot } from '@/services/api';
import { renderInApp } from '@/test/render';

const slot = (start: string): Slot => ({ start, end: new Date(Date.parse(start) + 45 * 60_000).toISOString() });

// Israel is on summer time (UTC+3) in early October 2026. Each slot is named
// for the day and time it happens in Jerusalem.
const SUN_0900 = slot('2026-10-04T06:00:00.000Z');
const SUN_1600 = slot('2026-10-04T13:00:00.000Z');
const MON_1000 = slot('2026-10-05T07:00:00.000Z');
const MON_1830 = slot('2026-10-05T15:30:00.000Z');
const TUE_1100 = slot('2026-10-06T08:00:00.000Z');
const WEEK = [SUN_0900, SUN_1600, MON_1000, MON_1830, TUE_1100];
const JERUSALEM_DAY = new Map<Slot, number>([[SUN_0900, 4], [SUN_1600, 4], [MON_1000, 5], [MON_1830, 5], [TUE_1100, 6]]);

/** The booking page's shape: SlotPicker is controlled, the page keeps the choice. */
const Picker = ({ slots, onSelect = () => {} }: { slots: Slot[]; onSelect?: (s: Slot) => void }) => {
  const [selected, setSelected] = useState<Slot | null>(null);
  return (
    <SlotPicker
      slots={slots}
      timeZone="Asia/Jerusalem"
      selected={selected}
      onSelect={(s) => {
        onSelect(s);
        setSelected(s);
      }}
    />
  );
};

const buttons = () => screen.queryAllByRole('button');
/** Day chips read "<weekday><d/m>", e.g. "Sun04/10" (ICU versions differ on the zero). */
const dayChips = () => buttons().filter((b) => /\d\/\d/.test(b.textContent ?? ''));
const dayChip = (dayOfMonth: number) => {
  const chip = dayChips().find((b) => new RegExp(`(^|\\D)0?${dayOfMonth}/10$`).test(b.textContent ?? ''));
  if (!chip) throw new Error(`No chip for ${dayOfMonth}/10 among: ${dayChips().map((b) => b.textContent).join(', ')}`);
  return chip;
};
const times = () => buttons().filter((b) => /^\d\d:\d\d$/.test(b.textContent ?? '')).map((b) => b.textContent);
const openDay = () => dayChips().filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.textContent);

// The browser's zone must not matter: someone booking from abroad has to see
// the days and times the meeting happens in Israel. Run with a zone ahead of
// Israel and one behind it, where local-day grouping would split and merge the
// days differently.
const originalTZ = process.env.TZ;
afterAll(() => {
  process.env.TZ = originalTZ;
});

describe.each(['Pacific/Kiritimati', 'America/Los_Angeles'])('SlotPicker with the browser in %s', (zone) => {
  beforeAll(() => {
    process.env.TZ = zone;
  });

  it('really is in a zone where the local calendar day differs from Israel', () => {
    const differ = WEEK.filter((s) => new Date(s.start).getDate() !== JERUSALEM_DAY.get(s));
    expect(differ.length).toBeGreaterThan(0);
  });

  it('groups the slots into the days they happen in Jerusalem, first day open', () => {
    renderInApp(<Picker slots={WEEK} />);
    expect(dayChips().map((b) => b.textContent?.replace(/\d.*/, ''))).toEqual(['Sun', 'Mon', 'Tue']);
    dayChip(4);
    dayChip(5);
    dayChip(6);
    expect(times()).toEqual(['09:00', '16:00']);
  });

  it('shows the chosen day when switching days', async () => {
    const user = userEvent.setup();
    renderInApp(<Picker slots={WEEK} />);
    await user.click(dayChip(5));
    expect(times()).toEqual(['10:00', '18:30']);
    await user.click(dayChip(6));
    expect(times()).toEqual(['11:00']);
    await user.click(dayChip(4));
    expect(times()).toEqual(['09:00', '16:00']);
  });
});

describe('SlotPicker', () => {
  beforeAll(() => {
    process.env.TZ = 'America/Los_Angeles';
  });

  it('tells assistive technology which day is open, not only by colour', async () => {
    const user = userEvent.setup();
    renderInApp(<Picker slots={WEEK} />);
    expect(openDay()).toEqual([dayChip(4).textContent]);
    await user.click(dayChip(5));
    expect(openDay()).toEqual([dayChip(5).textContent]);
    expect(dayChip(4).getAttribute('aria-pressed')).toBe('false');
  });

  it('hands the chosen slot back and marks it pressed', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    renderInApp(<Picker slots={WEEK} onSelect={onSelect} />);
    await user.click(screen.getByRole('button', { name: '16:00' }));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(SUN_1600);
    expect(screen.getByRole('button', { name: '16:00' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: '09:00' }).getAttribute('aria-pressed')).toBe('false');

    // Looking at another day and coming back keeps the choice.
    await user.click(dayChip(5));
    expect(screen.getByRole('button', { name: '10:00' }).getAttribute('aria-pressed')).toBe('false');
    await user.click(dayChip(4));
    expect(screen.getByRole('button', { name: '16:00' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('falls back to the first day when a refreshed list no longer has the open day', async () => {
    const user = userEvent.setup();
    const { rerender } = renderInApp(<Picker slots={WEEK} />);
    await user.click(dayChip(5));
    expect(times()).toEqual(['10:00', '18:30']);

    // Someone else took both Monday times while this page was open.
    rerender(<Picker slots={[SUN_0900, TUE_1100]} />);
    expect(dayChips()).toHaveLength(2);
    expect(() => dayChip(5)).toThrow();
    expect(times()).toEqual(['09:00']);
    expect(openDay()).toEqual([dayChip(4).textContent]);
  });

  it('keeps the open day when a refreshed list still has it', async () => {
    const user = userEvent.setup();
    const { rerender } = renderInApp(<Picker slots={WEEK} />);
    await user.click(dayChip(5));
    rerender(<Picker slots={[SUN_0900, MON_1830, TUE_1100]} />);
    expect(times()).toEqual(['18:30']);
  });

  it('opens the first day once slots arrive after an empty list', () => {
    const { rerender } = renderInApp(<Picker slots={[]} />);
    expect(buttons()).toHaveLength(0);
    rerender(<Picker slots={[MON_1000, TUE_1100]} />);
    expect(times()).toEqual(['10:00']);
  });

  it('names the days in Hebrew and keeps the times LTR-isolated', () => {
    renderInApp(<Picker slots={WEEK} />, { lang: 'he' });
    expect(dayChips()).toHaveLength(3);
    expect(dayChip(4).textContent).toMatch(/^יום א/);
    const time = screen.getByText('09:00');
    expect(time.classList.contains('num')).toBe(true);
  });
});
