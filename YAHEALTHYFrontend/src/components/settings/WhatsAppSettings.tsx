import { ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { isAxiosError } from 'axios';
import { Copy, ExternalLink, MessageCircle, RefreshCw, Unlink } from 'lucide-react';
import { useLanguage } from '@/i18n/LanguageContext';
import { whatsappLinkApi, type WhatsAppLinkCode, type WhatsAppLinkStatus } from '@/services/api';
import { formatCountdown, secondsLeft } from '@/utils/whatsappLink';

const POLL_MS = 4000;

const Card = ({ children }: { children: ReactNode }) => (
  <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100">{children}</div>
);

const primaryBtn =
  'inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60';
const secondaryBtn =
  'inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-50 disabled:opacity-60';

/**
 * Settings → WhatsApp: connect the chat with Adi to this account so meals
 * confirmed there land in the food diary. The link is made only when the
 * one-time code is sent from the phone (the server never links by number).
 */
export const WhatsAppSettings = () => {
  const { t, lang } = useLanguage();
  const [status, setStatus] = useState<WhatsAppLinkStatus | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [code, setCode] = useState<WhatsAppLinkCode | null>(null);
  const [left, setLeft] = useState(0);
  const [busy, setBusy] = useState<'code' | 'unlink' | 'check' | null>(null);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const codeRef = useRef<HTMLParagraphElement>(null);

  const refresh = useCallback(async () => {
    const res = await whatsappLinkApi.status();
    setStatus(res.data);
    return res.data;
  }, []);

  useEffect(() => {
    refresh().catch(() => setLoadError(true));
  }, [refresh]);

  // While a code is on screen: count down, and watch for the link to land.
  useEffect(() => {
    if (!code) return;
    const tick = () => setLeft(secondsLeft(code.expiresAt));
    tick();
    const timer = window.setInterval(tick, 1000);
    const poll = window.setInterval(() => {
      refresh()
        .then((s) => {
          if (s.linked) {
            setCode(null);
            setNote(t('settings.whatsapp.linkedNow'));
          }
        })
        .catch(() => undefined);
    }, POLL_MS);
    return () => {
      window.clearInterval(timer);
      window.clearInterval(poll);
    };
  }, [code, refresh, t]);

  const getCode = async () => {
    setBusy('code');
    setError('');
    setNote('');
    try {
      const res = await whatsappLinkApi.createCode(lang);
      setLeft(secondsLeft(res.data.expiresAt));
      setCode(res.data);
      // Move focus to the code so a screen reader announces it.
      window.setTimeout(() => codeRef.current?.focus(), 0);
    } catch (err) {
      setError(
        isAxiosError(err) && err.response?.status === 429 ? t('settings.whatsapp.rateLimited') : t('settings.whatsapp.error'),
      );
    } finally {
      setBusy(null);
    }
  };

  const checkNow = async () => {
    setBusy('check');
    setError('');
    try {
      const s = await refresh();
      if (s.linked) {
        setCode(null);
        setNote(t('settings.whatsapp.linkedNow'));
      } else {
        setNote(t('settings.whatsapp.notYet'));
      }
    } catch {
      setError(t('settings.whatsapp.error'));
    } finally {
      setBusy(null);
    }
  };

  const unlink = async () => {
    setBusy('unlink');
    setError('');
    setNote('');
    try {
      await whatsappLinkApi.unlink();
      await refresh();
      setNote(t('settings.whatsapp.unlinked'));
    } catch {
      setError(t('settings.whatsapp.error'));
    } finally {
      setBusy(null);
    }
  };

  const copyCode = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code.code);
      setNote(t('settings.whatsapp.copied'));
    } catch {
      /* clipboard unavailable — the code is on screen */
    }
  };

  if (loadError) {
    return (
      <Card>
        <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700 ring-1 ring-rose-100">
          {t('settings.whatsapp.loadError')}
        </p>
      </Card>
    );
  }

  if (!status) {
    return (
      <Card>
        <div role="status" aria-live="polite" className="flex justify-center py-6">
          <span className="sr-only">{t('common.loading')}</span>
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-200 border-t-emerald-600" aria-hidden="true" />
        </div>
      </Card>
    );
  }

  const expired = code !== null && left === 0;
  const since = status.linkedAt
    ? new Date(status.linkedAt).toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-US', { dateStyle: 'medium' })
    : '';

  return (
    <Card>
      {status.linked ? (
        <div data-testid="whatsapp-linked">
          <p className="font-medium text-slate-900">
            {t('settings.whatsapp.connectedAs')}{' '}
            <span className="num" dir="ltr">
              {status.phone}
            </span>
          </p>
          {since && <p className="text-sm text-slate-500">{t('settings.whatsapp.since', { date: since })}</p>}
          <p className="mt-3 text-sm text-slate-600">{t('settings.whatsapp.howTo')}</p>
          <button type="button" onClick={unlink} disabled={busy !== null} className={`${secondaryBtn} mt-4 text-rose-600 ring-rose-200 hover:bg-rose-50`}>
            <Unlink size={16} aria-hidden="true" />
            {busy === 'unlink' ? t('settings.whatsapp.unlinking') : t('settings.whatsapp.unlink')}
          </button>
        </div>
      ) : (
        <div data-testid="whatsapp-unlinked">
          <p className="font-medium text-slate-900">{t('settings.whatsapp.notConnected')}</p>
          <p className="mt-1 text-sm text-slate-600">{t('settings.whatsapp.explain')}</p>

          {code && !expired ? (
            <div className="mt-4 rounded-2xl bg-emerald-50 p-4 ring-1 ring-emerald-100">
              <p className="text-sm font-medium text-slate-700" id="wa-code-label">
                {t('settings.whatsapp.codeLabel')}
              </p>
              <p
                ref={codeRef}
                tabIndex={-1}
                aria-labelledby="wa-code-label"
                data-testid="whatsapp-code"
                dir="ltr"
                className="num mt-1 font-mono text-3xl font-bold tracking-widest text-emerald-800 outline-none"
              >
                {code.code}
              </p>
              <p className="mt-2 text-sm text-slate-600">
                {code.botNumber
                  ? t('settings.whatsapp.codeHelpNumber', { number: code.botNumber })
                  : t('settings.whatsapp.codeHelp')}
              </p>
              <p className="mt-1 text-xs text-slate-500" aria-live="off">
                {t('settings.whatsapp.expiresIn', { time: formatCountdown(left) })}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {code.waLink && (
                  <a href={code.waLink} target="_blank" rel="noopener noreferrer" className={primaryBtn}>
                    <ExternalLink size={16} aria-hidden="true" />
                    {t('settings.whatsapp.openWhatsApp')}
                  </a>
                )}
                <button type="button" onClick={copyCode} className={secondaryBtn}>
                  <Copy size={16} aria-hidden="true" />
                  {t('settings.whatsapp.copy')}
                </button>
                <button type="button" onClick={checkNow} disabled={busy !== null} className={secondaryBtn}>
                  <RefreshCw size={16} aria-hidden="true" />
                  {t('settings.whatsapp.checkNow')}
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-4">
              {expired && <p className="mb-2 text-sm text-slate-600">{t('settings.whatsapp.expired')}</p>}
              <button type="button" onClick={getCode} disabled={busy !== null} className={primaryBtn}>
                <MessageCircle size={16} aria-hidden="true" />
                {busy === 'code'
                  ? t('settings.whatsapp.connecting')
                  : expired
                    ? t('settings.whatsapp.newCode')
                    : t('settings.whatsapp.connect')}
              </button>
            </div>
          )}
          <p className="mt-4 text-xs text-slate-500">{t('settings.whatsapp.privacy')}</p>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700 ring-1 ring-rose-100">
          {error}
        </p>
      )}
      <p role="status" aria-live="polite" className="mt-3 min-h-[1.25rem] text-sm font-medium text-emerald-700">
        {note}
      </p>
    </Card>
  );
};

export default WhatsAppSettings;
