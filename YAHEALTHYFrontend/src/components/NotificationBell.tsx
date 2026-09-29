import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, MessageCircle, Settings } from 'lucide-react';
import { useLanguage } from '@/i18n/LanguageContext';
import { NudgeItem, notificationsApi } from '@/services/api';

// Reminders arrive at most a few times a day; checking once a minute is plenty
// and costs one small request.
const POLL_MS = 60_000;

/**
 * The bell: reminders that were sent (water, breakfast, today's menu, well
 * done), newest first, with an unread count. Opening it marks them read.
 */
export const NotificationBell = ({ align = 'end' }: { align?: 'start' | 'end' }) => {
  const { t, lang } = useLanguage();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NudgeItem[]>([]);
  const [unread, setUnread] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);

  const load = useCallback(() => {
    notificationsApi
      .list()
      .then(({ data }) => {
        setItems(data.items);
        setUnread(data.unread);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [load]);

  // Close on outside click and on Escape.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && unread > 0) {
      setUnread(0);
      notificationsApi.markRead().catch(() => {});
    }
  };

  const when = (iso: string) =>
    new Intl.DateTimeFormat(lang === 'he' ? 'he-IL' : 'en-GB', { timeZone: 'Asia/Jerusalem', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso));

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={toggle}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={unread ? t('nudges.bellUnread', { n: unread }) : t('nudges.bell')}
        className="relative rounded-full p-2 text-slate-600 transition hover:bg-slate-100"
      >
        <Bell size={20} aria-hidden="true" />
        {unread > 0 && (
          <span className="absolute -top-0.5 end-0 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-rose-600 px-1 text-[11px] font-bold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label={t('nudges.title')}
          // On a phone the bell sits near the edge, and a 320px panel hung off
          // it ran off the screen: there it spans the width under the top bar.
          className={`fixed inset-x-4 top-16 z-50 overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-slate-200 md:absolute md:inset-x-auto md:top-full md:mt-2 md:w-80 ${align === 'end' ? 'md:end-0' : 'md:start-0'}`}
        >
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <p className="font-bold text-slate-900">{t('nudges.title')}</p>
            <Link to="/notifications" onClick={() => setOpen(false)} className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:text-emerald-800">
              <Settings size={14} aria-hidden="true" /> {t('nudges.settingsLink')}
            </Link>
          </div>
          {items.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-slate-500">{t('nudges.empty')}</p>
          ) : (
            <ul className="max-h-96 divide-y divide-slate-100 overflow-y-auto">
              {items.map((n) => (
                <li key={n.id} className={`px-4 py-3 ${n.readAt ? '' : 'bg-emerald-50/50'}`}>
                  <p className="whitespace-pre-line text-sm text-slate-800">{n.body}</p>
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
                    {n.channel === 'whatsapp' && <MessageCircle size={12} aria-hidden="true" />}
                    <span className="num">{when(n.createdAt)}</span>
                    {n.channel === 'whatsapp' && <span>· {t('nudges.viaWhatsapp')}</span>}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};
