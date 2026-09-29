import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { useLanguage } from '@/i18n/LanguageContext';

export interface UndoState {
  /** Changes identity for every new log so the timer restarts. */
  key: number;
  message: string;
  ids: string[];
}

const VISIBLE_MS = 8000;

/**
 * "Logged — Undo" after a one-tap log. The live region is always in the DOM
 * (so screen readers announce what is put into it); the Undo button is a
 * normal, focusable button, and the timer pauses while it has focus or the
 * pointer, so nobody loses the chance to undo by being slow.
 */
export function UndoSnackbar({
  state,
  onUndo,
  onDismiss,
}: {
  state: UndoState | null;
  onUndo: (ids: string[]) => void;
  onDismiss: () => void;
}) {
  const { t } = useLanguage();
  const [paused, setPaused] = useState(false);
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;

  useEffect(() => {
    if (!state || paused) return;
    const timer = window.setTimeout(() => dismissRef.current(), VISIBLE_MS);
    return () => window.clearTimeout(timer);
  }, [state, paused]);

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="pointer-events-none fixed inset-x-0 bottom-20 z-40 flex justify-center px-4 md:bottom-6"
    >
      {state && (
        <div
          data-testid="undo-snackbar"
          className="pointer-events-auto flex max-w-md items-center gap-3 rounded-2xl bg-slate-900 py-2.5 pe-2 ps-4 text-sm text-white shadow-xl"
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
          onFocus={() => setPaused(true)}
          onBlur={() => setPaused(false)}
        >
          <span className="min-w-0 flex-1 truncate">{state.message}</span>
          <button
            type="button"
            onClick={() => onUndo(state.ids)}
            className="rounded-lg px-3 py-1.5 font-semibold text-emerald-300 transition hover:bg-white/10"
          >
            {t('food.undo.action')}
          </button>
          <button
            type="button"
            onClick={onDismiss}
            aria-label={t('food.undo.dismiss')}
            className="rounded-lg p-1.5 text-slate-300 transition hover:bg-white/10"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
}

export default UndoSnackbar;
