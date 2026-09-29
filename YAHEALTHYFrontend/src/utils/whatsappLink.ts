/**
 * Small pure helpers for Settings → WhatsApp and the food-log badge.
 * No DOM, no network: unit-tested in whatsappLink.test.ts.
 */

/** Whole seconds until `expiresAt` (never negative; 0 for an unreadable date). */
export function secondsLeft(expiresAt: string, now: number = Date.now()): number {
  const t = new Date(expiresAt).getTime();
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Math.ceil((t - now) / 1000));
}

/** 605 → "10:05". */
export function formatCountdown(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** True for a food-log entry that was confirmed in the WhatsApp chat. */
export function isWhatsAppEntry(log: { source?: string | null } | null | undefined): boolean {
  return log?.source === 'whatsapp';
}
