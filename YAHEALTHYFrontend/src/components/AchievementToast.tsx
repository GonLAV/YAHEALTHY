import { useEffect } from 'react';
import { X } from 'lucide-react';
import { Badge } from '@/services/api';
import { useLanguage } from '@/i18n/LanguageContext';

/**
 * What was achieved, in words.
 *
 * The confetti is the decoration; this is the part that carries the
 * information. Someone with reduced motion turned on sees no animation at all,
 * and someone using a screen reader never sees a canvas — both still get told,
 * in their own language, which badge they just earned and what it was for.
 *
 * role="status" rather than "alert": an achievement is good news, and it should
 * wait for a pause rather than interrupt whatever is being read.
 */

const AUTO_DISMISS_MS = 6000;

export const AchievementToast = ({
  badges,
  onDismiss,
}: {
  badges: Badge[];
  onDismiss: () => void;
}) => {
  const { t } = useLanguage();

  useEffect(() => {
    if (badges.length === 0) return;
    const timer = setTimeout(onDismiss, AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [badges, onDismiss]);

  if (badges.length === 0) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      // bottom-24 clears the mobile nav; `end-4` is logical, so it sits on the
      // left in Hebrew and the right in English without a second rule.
      className="fixed bottom-24 end-4 z-50 w-[min(22rem,calc(100vw-2rem))] md:bottom-6"
    >
      {badges.map((badge) => (
        <div
          key={badge.id}
          className="mb-2 flex items-start gap-3 rounded-2xl bg-white p-4 shadow-lg ring-1 ring-slate-200"
        >
          <span
            aria-hidden="true"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-50 text-2xl"
          >
            {badge.icon}
          </span>

          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-emerald-600">{t('achievement.earned')}</p>
            {/* The translated name, not the English one the API ships. */}
            <p className="font-semibold text-slate-900">{t(`badge.${badge.id}.name`)}</p>
            <p className="mt-0.5 text-xs text-slate-500">{t(`badge.${badge.id}.desc`)}</p>
          </div>

          <button
            onClick={onDismiss}
            aria-label={t('common.close')}
            className="rounded-lg p-1 text-slate-300 transition hover:bg-slate-100 hover:text-slate-500"
          >
            <X size={16} />
          </button>
        </div>
      ))}
    </div>
  );
};

export default AchievementToast;
