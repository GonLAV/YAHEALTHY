// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { LanguageProvider } from '@/i18n/LanguageContext';
import { UndoSnackbar, type UndoState } from './UndoSnackbar';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const renderBar = (state: UndoState | null, onUndo = vi.fn(), onDismiss = vi.fn()) => {
  render(
    <LanguageProvider initialLang="en">
      <UndoSnackbar state={state} onUndo={onUndo} onDismiss={onDismiss} />
    </LanguageProvider>,
  );
  return { onUndo, onDismiss };
};

describe('UndoSnackbar', () => {
  it('keeps an empty live region mounted so the message is announced', () => {
    renderBar(null);
    const region = screen.getByRole('status');
    expect(region.getAttribute('aria-live')).toBe('polite');
    expect(region.textContent).toBe('');
  });

  it('shows the message with a focusable Undo button that undoes exactly those ids', () => {
    const { onUndo } = renderBar({ key: 1, message: 'Logged Oatmeal', ids: ['a', 'b'] });
    expect(screen.getByRole('status').textContent).toContain('Logged Oatmeal');
    const undo = screen.getByRole('button', { name: 'Undo' });
    undo.focus();
    expect(document.activeElement).toBe(undo);
    fireEvent.click(undo);
    expect(onUndo).toHaveBeenCalledWith(['a', 'b']);
  });

  it('dismisses itself after a while, but not while it has focus', () => {
    vi.useFakeTimers();
    const { onDismiss } = renderBar({ key: 1, message: 'Logged', ids: ['a'] });
    fireEvent.focus(screen.getByRole('button', { name: 'Undo' }));
    act(() => void vi.advanceTimersByTime(20000));
    expect(onDismiss).not.toHaveBeenCalled();
    fireEvent.blur(screen.getByRole('button', { name: 'Undo' }));
    act(() => void vi.advanceTimersByTime(8000));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
