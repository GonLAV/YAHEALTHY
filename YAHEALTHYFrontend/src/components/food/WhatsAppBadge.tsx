import { MessageCircle } from 'lucide-react';
import { useLanguage } from '@/i18n/LanguageContext';

/** Marks a food-log entry that was confirmed in the WhatsApp chat with Adi. */
export const WhatsAppBadge = () => {
  const { t } = useLanguage();
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-emerald-100"
      title={t('food.fromWhatsAppLabel')}
      data-testid="whatsapp-badge"
    >
      <MessageCircle size={12} aria-hidden="true" />
      <span aria-hidden="true">{t('food.fromWhatsApp')}</span>
      <span className="sr-only">{t('food.fromWhatsAppLabel')}</span>
    </span>
  );
};

export default WhatsAppBadge;
