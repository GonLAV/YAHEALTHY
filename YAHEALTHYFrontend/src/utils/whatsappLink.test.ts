import { describe, expect, it } from 'vitest';
import { formatCountdown, isWhatsAppEntry, secondsLeft } from './whatsappLink';

describe('secondsLeft', () => {
  const now = Date.parse('2026-09-29T10:00:00Z');

  it('counts whole seconds up to expiry', () => {
    expect(secondsLeft('2026-09-29T10:10:00Z', now)).toBe(600);
    expect(secondsLeft('2026-09-29T10:00:00.400Z', now)).toBe(1);
  });

  it('never goes negative once expired', () => {
    expect(secondsLeft('2026-09-29T09:59:00Z', now)).toBe(0);
  });

  it('treats an unreadable date as expired', () => {
    expect(secondsLeft('not a date', now)).toBe(0);
  });
});

describe('formatCountdown', () => {
  it('formats minutes and zero-padded seconds', () => {
    expect(formatCountdown(605)).toBe('10:05');
    expect(formatCountdown(59)).toBe('0:59');
    expect(formatCountdown(0)).toBe('0:00');
    expect(formatCountdown(-3)).toBe('0:00');
  });
});

describe('isWhatsAppEntry', () => {
  it('is true only for entries logged from WhatsApp', () => {
    expect(isWhatsAppEntry({ source: 'whatsapp' })).toBe(true);
    expect(isWhatsAppEntry({ source: null })).toBe(false);
    expect(isWhatsAppEntry({})).toBe(false);
    expect(isWhatsAppEntry(undefined)).toBe(false);
  });
});
