import { useCallback, useEffect, useRef, useState } from 'react';
import { Badge } from '@/services/api';

/**
 * Which badges the person has earned since the last time we looked.
 *
 * /api/badges returns everything they currently hold, with no notion of "new" —
 * so newness has to be worked out on the client by remembering what we have
 * already celebrated.
 *
 * That memory lives in localStorage, which is the right size of thing for it:
 * a celebration is a moment, not a record. If it is lost, somebody misses a
 * burst of confetti. Nothing about their actual achievements depends on it, and
 * none of it needs to reach the server.
 *
 * The one case worth being careful about is the first run on a device. Somebody
 * who has been using the app for months and opens it on a new phone holds four
 * badges and has an empty store — celebrating all four would be wrong, because
 * none of them happened just now. So the first run seeds the store silently and
 * celebrates nothing; only what appears afterwards counts as new.
 */

const STORAGE_KEY = 'yahealthy-celebrated-badges';

const readSeen = (): Set<string> | null => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw == null) return null; // never run on this device
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? new Set(parsed.map(String)) : new Set();
  } catch {
    // Private window, blocked site data, corrupt value. Treat it as "we cannot
    // tell" and stay quiet: firing confetti on every single page load would be
    // far worse than missing one.
    return null;
  }
};

const writeSeen = (ids: Set<string>) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]));
  } catch {
    /* nothing to do, and nothing depends on it */
  }
};

export const useNewAchievements = (badges: Badge[] | undefined) => {
  const [earned, setEarned] = useState<Badge[]>([]);
  // Guards against a re-render re-celebrating the same badge before the write
  // has been read back.
  const handled = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!badges) return;

    const currentIds = badges.map((b) => b.id);
    const seen = readSeen();

    if (seen === null) {
      // Either the first run on this device, or storage we cannot read. Both
      // mean: record where we are, say nothing.
      writeSeen(new Set(currentIds));
      currentIds.forEach((id) => handled.current.add(id));
      return;
    }

    const fresh = badges.filter((b) => !seen.has(b.id) && !handled.current.has(b.id));
    if (fresh.length === 0) return;

    fresh.forEach((b) => handled.current.add(b.id));
    writeSeen(new Set([...seen, ...currentIds]));
    setEarned(fresh);
  }, [badges]);

  const dismiss = useCallback(() => setEarned([]), []);

  return { earned, dismiss };
};

export default useNewAchievements;
