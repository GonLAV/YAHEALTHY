import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AddToWeek, MEAL_TYPES, localDate } from './AddToWeek';
import { mealPlanApi } from '@/services/api';
import { copy, httpError, renderInApp } from '@/test/render';

vi.mock('@/services/api', () => ({ mealPlanApi: { add: vi.fn() } }));
const add = vi.mocked(mealPlanApi.add);
const saved = { data: {} } as never;

// The customers' zone, and one where the local day and the UTC day differ for
// two or three hours every night — which is what makes these tests meaningful
// on a CI machine that runs in UTC.
const originalTZ = process.env.TZ;
beforeAll(() => {
  process.env.TZ = 'Asia/Jerusalem';
});
afterAll(() => {
  process.env.TZ = originalTZ;
});

/** Freezes the clock (only the clock: user-event still needs real timers). */
const at = (...local: [number, number, number, number?, number?]) => {
  vi.useFakeTimers({ toFake: ['Date'] });
  const now = new Date(local[0], local[1], local[2], local[3] ?? 12, local[4] ?? 0);
  vi.setSystemTime(now);
  return now;
};

describe('localDate', () => {
  it('rolls over the end of a month', () => {
    at(2026, 0, 31);
    expect(localDate(0)).toBe('2026-01-31');
    expect(localDate(1)).toBe('2026-02-01');
  });

  it('rolls over the end of a year, both ways', () => {
    at(2026, 11, 31, 23, 59);
    expect(localDate(0)).toBe('2026-12-31');
    expect(localDate(1)).toBe('2027-01-01');
    at(2027, 0, 1, 0, 0);
    expect(localDate(-1)).toBe('2026-12-31');
  });

  it('knows February', () => {
    at(2027, 1, 28);
    expect(localDate(1)).toBe('2027-03-01');
    at(2028, 1, 28);
    expect(localDate(1)).toBe('2028-02-29');
    expect(localDate(2)).toBe('2028-03-01');
  });

  it('is the browser’s day, not UTC’s, just after midnight', () => {
    const now = at(2027, 0, 1, 0, 30);
    expect(now.toISOString().slice(0, 10)).toBe('2026-12-31'); // UTC is still in last year
    expect(localDate(0)).toBe('2027-01-01');
  });

  it('gives seven consecutive days across a clock change', () => {
    at(2027, 2, 25, 23, 30); // Israel moves to summer time at 02:00 on 26 March 2027
    expect(Array.from({ length: 7 }, (_, i) => localDate(i))).toEqual([
      '2027-03-25', '2027-03-26', '2027-03-27', '2027-03-28', '2027-03-29', '2027-03-30', '2027-03-31',
    ]);
  });
});

const daySelect = (lang: 'en' | 'he' = 'en') => screen.getByRole('combobox', { name: new RegExp(`^${copy(lang, 'week.day')}`) });
const mealSelect = (lang: 'en' | 'he' = 'en') => screen.getByRole('combobox', { name: new RegExp(`^${copy(lang, 'week.meal')}`) });
const addButton = (lang: 'en' | 'he' = 'en') => screen.getByRole('button', { name: copy(lang, 'week.add') });

describe('AddToWeek', () => {
  it('offers today and the six days after it', () => {
    at(2026, 8, 29);
    renderInApp(<AddToWeek recipeId="r-1" />);
    const values = within(daySelect()).getAllByRole('option').map((o) => (o as HTMLOptionElement).value);
    expect(values).toEqual(['2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05']);
    expect((daySelect() as HTMLSelectElement).value).toBe('2026-09-29');
  });

  // The label is what the person reads; the value is what gets saved. Around a
  // clock change they must still name the same day.
  it.each([
    ['the evening before summer time starts', [2027, 2, 25, 23, 30]],
    ['the week summer time ends', [2026, 9, 20, 0, 30]],
  ] as const)('labels each day with the date it saves, %s', (_, when) => {
    const [y, m, d, h, min] = when;
    at(y, m, d, h, min);
    renderInApp(<AddToWeek recipeId="r-1" />);
    for (const option of within(daySelect()).getAllByRole('option') as HTMLOptionElement[]) {
      const [, month, day] = option.value.match(/^\d{4}-(\d\d)-(\d\d)$/)!;
      const [, shownDay, shownMonth] = option.textContent!.match(/(\d{1,2})\/(\d{1,2})/)!;
      expect(`${+shownDay}/${+shownMonth}`, `"${option.textContent}" saves ${option.value}`).toBe(`${+day}/${+month}`);
    }
  });

  it('names every meal in the reader’s language', () => {
    renderInApp(<AddToWeek recipeId="r-1" />, { lang: 'he' });
    const labels = within(mealSelect('he')).getAllByRole('option').map((o) => o.textContent);
    expect(labels).toEqual(MEAL_TYPES.map((m) => copy('he', `meal.${m}`)));
  });

  it('adds the recipe for today’s dinner by default', async () => {
    at(2026, 8, 29);
    add.mockResolvedValue(saved);
    renderInApp(<AddToWeek recipeId="r-1" />);
    await userEvent.click(addButton());
    expect(add).toHaveBeenCalledWith('r-1', '2026-09-29', 'dinner');
  });

  it('sends the day and meal that were chosen, then points to the shopping list', async () => {
    at(2026, 8, 29);
    add.mockResolvedValue(saved);
    const user = userEvent.setup();
    renderInApp(<AddToWeek recipeId="r-7" defaultMeal="breakfast" />);
    expect((mealSelect() as HTMLSelectElement).value).toBe('breakfast');
    await user.selectOptions(daySelect(), '2026-10-01');
    await user.selectOptions(mealSelect(), 'lunch');
    await user.click(addButton());

    expect(add).toHaveBeenCalledTimes(1);
    expect(add).toHaveBeenCalledWith('r-7', '2026-10-01', 'lunch');
    const status = await screen.findByRole('status');
    expect(status.textContent).toContain(copy('en', 'week.added'));
    expect(within(status).getByRole('link', { name: copy('en', 'week.toList') }).getAttribute('href')).toBe('/shopping');
  });

  it('sends once while the first request is still on its way', async () => {
    let finish: (v: never) => void = () => {};
    add.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const user = userEvent.setup();
    renderInApp(<AddToWeek recipeId="r-1" />);
    await user.click(addButton());
    expect((addButton() as HTMLButtonElement).disabled).toBe(true);
    await user.click(addButton());
    expect(add).toHaveBeenCalledTimes(1);
    finish(saved);
    expect(await screen.findByRole('status')).toBeTruthy();
    expect((addButton() as HTMLButtonElement).disabled).toBe(false);
  });

  it('says the slot is already planned when the server answers 409', async () => {
    add.mockRejectedValue(httpError(409, { error: 'Already planned' }));
    renderInApp(<AddToWeek recipeId="r-1" />, { lang: 'he' });
    await userEvent.click(addButton('he'));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe(copy('he', 'week.taken'));
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('clears the "already planned" message once the choice changes', async () => {
    at(2026, 8, 29);
    add.mockRejectedValue(httpError(409));
    const user = userEvent.setup();
    renderInApp(<AddToWeek recipeId="r-1" />);
    await user.click(addButton());
    expect(await screen.findByRole('alert')).toBeTruthy();
    await user.selectOptions(daySelect(), '2026-09-30');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it.each([
    ['a server error', httpError(500)],
    ['no answer at all', new Error('Network Error')],
  ])('shows the generic error for %s, not "already planned"', async (_, failure) => {
    add.mockRejectedValue(failure);
    renderInApp(<AddToWeek recipeId="r-1" />);
    await userEvent.click(addButton());
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe(copy('en', 'common.error'));
  });
});
