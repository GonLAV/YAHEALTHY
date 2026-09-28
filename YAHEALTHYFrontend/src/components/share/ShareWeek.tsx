import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Share2, Download, Copy, Check, MessageCircle, X, Link2, Trash2, AlertCircle, Sparkles,
} from 'lucide-react';
import { shareApi, ShareLink, ShareOptions, WeeklyCardPreview } from '@/services/api';
import { useLanguage } from '@/i18n/LanguageContext';

/**
 * "Share my week": a trigger button and the modal behind it.
 *
 * The card itself is drawn by the backend (utils/share-card.js → SVG) so the
 * preview, the downloaded PNG and the public /s/:token page are the same
 * picture. "Download image" rasterises that SVG on a <canvas> — no extra
 * dependency — and the same PNG is uploaded to the share link so chat apps
 * that ignore SVG previews (WhatsApp, Facebook) still get a real og:image.
 */

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

type Status = { kind: 'ok' | 'error'; text: string } | null;

const svgToDataUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

/** Draw the card SVG onto a canvas and export PNG. */
async function renderPng(svg: string, width: number, height: number): Promise<Blob> {
  const img = new Image();
  img.decoding = 'async';
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('SVG failed to load'));
    img.src = svgToDataUrl(svg);
  });
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No 2D context');
  ctx.drawImage(img, 0, 0, width, height);
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png'),
  );
}

export const ShareWeekModal = ({ open, onClose }: { open: boolean; onClose: () => void }) => {
  const { t, lang } = useLanguage();
  const titleId = useId();
  const descId = useId();
  const nameId = useId();
  const nameHintId = useId();
  const weightId = useId();
  const weightHintId = useId();
  const linkId = useId();

  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const linkInputRef = useRef<HTMLInputElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const pngCache = useRef<{ svg: string; blob: Blob } | null>(null);

  const [opts, setOpts] = useState<ShareOptions>({ showName: true, includeWeight: false });
  const [preview, setPreview] = useState<WeeklyCardPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [link, setLink] = useState<ShareLink | null>(null);
  const [busy, setBusy] = useState<'link' | 'download' | 'revoke' | null>(null);
  const [status, setStatus] = useState<Status>(null);
  const [copied, setCopied] = useState(false);

  const canNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  // Only the latest request may land: toggling an option twice quickly must
  // not let the slower, older answer overwrite the newer preview.
  const loadSeq = useRef(0);
  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    setLoading(true);
    setLoadError(false);
    try {
      const res = await shareApi.getWeeklyCard(lang, opts);
      if (seq === loadSeq.current) setPreview(res.data);
    } catch {
      if (seq === loadSeq.current) setLoadError(true);
    } finally {
      if (seq === loadSeq.current) setLoading(false);
    }
  }, [lang, opts]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  // Reset per opening, so a revoked or stale link never reappears.
  useEffect(() => {
    if (!open) {
      setLink(null);
      setStatus(null);
      setCopied(false);
    }
  }, [open]);

  // Focus management: initial focus, trap, Escape, restore, background inert.
  useEffect(() => {
    if (!open) return undefined;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const root = document.getElementById('root');
    root?.setAttribute('inert', '');
    root?.setAttribute('aria-hidden', 'true');
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab' || !dialogRef.current) return;
      const items = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null,
      );
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !dialogRef.current.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !dialogRef.current.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      root?.removeAttribute('inert');
      root?.removeAttribute('aria-hidden');
      previouslyFocused?.focus?.();
    };
  }, [open]);

  const getPng = async (): Promise<Blob> => {
    if (!preview) throw new Error('No preview');
    if (pngCache.current?.svg === preview.svg) return pngCache.current.blob;
    const blob = await renderPng(preview.svg, preview.width, preview.height);
    pngCache.current = { svg: preview.svg, blob };
    return blob;
  };

  const fileName = preview ? `yahealthy-week-${preview.snapshot.week.end}.png` : 'yahealthy-week.png';

  const handleDownload = async () => {
    setBusy('download');
    setStatus(null);
    try {
      const blob = await getPng();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setStatus({ kind: 'ok', text: t('share.downloaded') });
    } catch {
      setStatus({ kind: 'error', text: t('share.downloadFailed') });
    } finally {
      setBusy(null);
    }
  };

  const handleCreateLink = async () => {
    setBusy('link');
    setStatus(null);
    try {
      const res = await shareApi.createLink(lang, opts);
      setLink(res.data);
      setStatus({ kind: 'ok', text: t('share.linkCreated') });
      // Best effort: give chat apps a PNG preview. The SVG one works without it.
      // Only when the preview on screen IS this link's snapshot: a preview
      // still refreshing after an option change (e.g. weight just switched
      // off) would publish a picture the link itself does not allow.
      if (preview && JSON.stringify(preview.snapshot) === JSON.stringify(res.data.snapshot)) {
        getPng()
          .then((blob) => shareApi.uploadImage(res.data.token, blob))
          .catch(() => undefined);
      }
    } catch {
      setStatus({ kind: 'error', text: t('share.linkFailed') });
    } finally {
      setBusy(null);
    }
  };

  const handleRevoke = async () => {
    if (!link) return;
    setBusy('revoke');
    try {
      await shareApi.revoke(link.token);
      setLink(null);
      setCopied(false);
      setStatus({ kind: 'ok', text: t('share.revoked') });
    } catch {
      setStatus({ kind: 'error', text: t('share.revokeFailed') });
    } finally {
      setBusy(null);
    }
  };

  const handleCopy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link.url);
      setCopied(true);
      setStatus({ kind: 'ok', text: t('share.copied') });
    } catch {
      linkInputRef.current?.select();
      setStatus({ kind: 'error', text: t('share.copyFailed') });
    }
  };

  const shareText = preview
    ? t('share.shareText', { score: preview.snapshot.avgScore, streak: preview.snapshot.streak })
    : '';

  const handleNativeShare = async () => {
    if (!link || !canNativeShare) return;
    const data: ShareData = { title: t('share.shareTitle'), text: shareText, url: link.url };
    try {
      const blob = await getPng();
      const file = new File([blob], fileName, { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) data.files = [file];
    } catch {
      /* share the link alone */
    }
    try {
      await navigator.share(data);
    } catch {
      /* dismissed by the user */
    }
  };

  if (!open) return null;

  const snap = preview?.snapshot;
  const locale = lang === 'he' ? 'he-IL' : 'en-US';
  const whatsappHref = link ? `https://wa.me/?text=${encodeURIComponent(`${shareText} ${link.url}`)}` : '#';
  const altParts = snap
    ? [
        t('share.previewAlt', {
          score: snap.avgScore, days: snap.daysLogged, streak: snap.streak, water: snap.waterHits, sleep: snap.sleepHits,
        }),
        snap.badges.length ? t('share.badgesAlt', { list: snap.badges.map((b) => b.title).join(', ') }) : '',
        typeof snap.weightChangeKg === 'number' ? t('share.weightAlt', { kg: snap.weightChangeKg }) : '',
      ].filter(Boolean)
    : [];

  const btn =
    'inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60';

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/60 sm:items-center sm:p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl bg-white p-5 shadow-xl sm:rounded-3xl md:p-6"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 id={titleId} className="text-xl font-bold text-slate-900">{t('share.modalTitle')}</h2>
            <p id={descId} className="mt-0.5 text-sm text-slate-500">{t('share.modalDesc')}</p>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label={t('share.close')}
            className="rounded-full p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        {/* Preview */}
        <div role="status" aria-live="polite">
          {loading && !preview && (
            <div className="flex aspect-[1200/630] w-full items-center justify-center gap-3 rounded-2xl bg-emerald-50 text-sm text-emerald-700">
              <div className="h-6 w-6 animate-spin rounded-full border-4 border-emerald-200 border-t-emerald-600" aria-hidden="true" />
              {t('share.loading')}
            </div>
          )}
        </div>
        {loadError && (
          <div role="alert" className="flex flex-wrap items-center gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            <AlertCircle size={16} className="shrink-0" aria-hidden="true" />
            <span className="flex-1">{t('share.loadError')}</span>
            <button type="button" onClick={load} className="rounded-full bg-white px-3 py-1.5 font-semibold text-rose-700 ring-1 ring-rose-200 hover:bg-rose-100">
              {t('share.retry')}
            </button>
          </div>
        )}
        {preview && (
          <figure className={`transition-opacity ${loading ? 'opacity-60' : ''}`}>
            <img
              src={svgToDataUrl(preview.svg)}
              width={preview.width}
              height={preview.height}
              alt=""
              className="h-auto w-full rounded-2xl shadow-sm ring-1 ring-slate-100"
            />
            <figcaption className="sr-only">{altParts.join(' ')}</figcaption>
          </figure>
        )}

        {/* Privacy toggles */}
        <fieldset className="mt-5 rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-100" disabled={!!link || busy === 'link'}>
          <legend className="px-1 text-sm font-semibold text-slate-900">{t('share.privacy')}</legend>
          <div className="mt-1 space-y-3">
            <div className="flex items-start gap-3">
              <input
                id={nameId}
                type="checkbox"
                checked={opts.showName}
                onChange={(e) => setOpts((o) => ({ ...o, showName: e.target.checked }))}
                aria-describedby={nameHintId}
                className="mt-1 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
              />
              <div>
                <label htmlFor={nameId} className="text-sm font-medium text-slate-800">{t('share.showName')}</label>
                <p id={nameHintId} className="text-xs text-slate-500">{t('share.showNameHint')}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <input
                id={weightId}
                type="checkbox"
                checked={opts.includeWeight}
                onChange={(e) => setOpts((o) => ({ ...o, includeWeight: e.target.checked }))}
                aria-describedby={weightHintId}
                className="mt-1 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
              />
              <div>
                <label htmlFor={weightId} className="text-sm font-medium text-slate-800">{t('share.includeWeight')}</label>
                <p id={weightHintId} className="text-xs text-slate-500">{t('share.includeWeightHint')}</p>
              </div>
            </div>
          </div>
          {link && <p className="mt-3 text-xs text-slate-500">{t('share.lockedHint')}</p>}
        </fieldset>

        {/* Link */}
        {link && (
          <div className="mt-5">
            <label htmlFor={linkId} className="block text-sm font-medium text-slate-800">{t('share.linkLabel')}</label>
            <div className="mt-1.5 flex flex-col gap-2 sm:flex-row">
              <input
                id={linkId}
                ref={linkInputRef}
                type="text"
                readOnly
                dir="ltr"
                value={link.url}
                onFocus={(e) => e.currentTarget.select()}
                className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-start text-sm text-slate-700"
              />
              <button type="button" onClick={handleCopy} className={`${btn} bg-emerald-600 text-white hover:bg-emerald-700`}>
                {copied ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
                {t('share.copy')}
              </button>
            </div>
            <p className="mt-1.5 text-xs text-slate-500">
              {t('share.expires', { date: new Date(link.expiresAt).toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' }) })}
            </p>
          </div>
        )}

        {/* Actions */}
        <div className="mt-5 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={handleDownload}
            disabled={!preview || busy !== null}
            className={`${btn} bg-white text-emerald-700 ring-1 ring-emerald-200 hover:bg-emerald-50`}
          >
            <Download size={16} aria-hidden="true" />
            {busy === 'download' ? t('share.downloading') : t('share.download')}
          </button>

          {!link ? (
            <button
              type="button"
              onClick={handleCreateLink}
              disabled={!preview || busy !== null}
              className={`${btn} bg-emerald-600 text-white hover:bg-emerald-700`}
            >
              <Link2 size={16} aria-hidden="true" />
              {busy === 'link' ? t('share.creating') : t('share.createLink')}
            </button>
          ) : (
            <>
              <a
                href={whatsappHref}
                target="_blank"
                rel="noopener noreferrer"
                className={`${btn} bg-[#25D366] text-white hover:brightness-95`}
              >
                <MessageCircle size={16} aria-hidden="true" />
                {t('share.whatsapp')}
              </a>
              {canNativeShare && (
                <button type="button" onClick={handleNativeShare} className={`${btn} bg-slate-900 text-white hover:bg-slate-800`}>
                  <Share2 size={16} aria-hidden="true" />
                  {t('share.native')}
                </button>
              )}
              <button
                type="button"
                onClick={handleRevoke}
                disabled={busy !== null}
                className={`${btn} text-rose-700 ring-1 ring-rose-200 hover:bg-rose-50`}
              >
                <Trash2 size={16} aria-hidden="true" />
                {t('share.revoke')}
              </button>
            </>
          )}
        </div>

        <p
          role="status"
          aria-live="polite"
          className={`mt-3 min-h-[1.25rem] text-sm font-medium ${status?.kind === 'error' ? 'text-rose-700' : 'text-emerald-700'}`}
        >
          {status?.text}
        </p>

        <p className="mt-2 text-xs text-slate-400">{t('share.disclaimer')}</p>
      </div>
    </div>,
    document.body,
  );
};

/** Compact trigger (e.g. next to a page header). */
export const ShareWeekButton = ({ className = '' }: { className?: string }) => {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className={`inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 ${className}`}
      >
        <Share2 size={16} aria-hidden="true" />
        {t('share.button')}
      </button>
      <ShareWeekModal open={open} onClose={() => setOpen(false)} />
    </>
  );
};

/** Dashboard call-out. */
export const ShareWeekCard = () => {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  return (
    <section
      aria-labelledby="share-week-title"
      className="flex flex-col gap-4 rounded-3xl bg-gradient-to-br from-emerald-600 to-teal-600 p-5 text-white shadow-md sm:flex-row sm:items-center"
    >
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/15" aria-hidden="true">
        <Sparkles size={24} />
      </span>
      <div className="min-w-0 flex-1">
        <h2 id="share-week-title" className="font-semibold">{t('share.cardTitle')}</h2>
        <p className="text-sm text-emerald-50">{t('share.cardBody')}</p>
      </div>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-emerald-700 shadow-sm transition hover:bg-emerald-50"
      >
        <Share2 size={16} aria-hidden="true" />
        {t('share.button')}
      </button>
      <ShareWeekModal open={open} onClose={() => setOpen(false)} />
    </section>
  );
};

export default ShareWeekButton;
