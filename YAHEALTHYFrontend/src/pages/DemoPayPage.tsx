import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AlertTriangle, CreditCard, Loader2 } from 'lucide-react';
import { PublicLayout } from '@/components/layout/PublicLayout';
import { Num } from '@/components/ui/Num';
import { useLanguage } from '@/i18n/LanguageContext';
import { demoPayApi } from '@/services/api';

/**
 * Where a purchase lands in the demo instead of PayPlus. It says, in words
 * nobody could miss, that nothing is charged — and "paying" here runs the same
 * server code a real approved payment runs, so everything after it (the
 * welcome email, the order, the booked session) is the real thing.
 *
 * The server answers 404 for these calls anywhere demo payments are off,
 * which includes every production deployment.
 */
export const DemoPayPage = () => {
  const { t } = useLanguage();
  const [params] = useSearchParams();
  const ref = params.get('ref') || '';
  const [payment, setPayment] = useState<{ amount: number; label: string; email: string } | null>(null);
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState<'pay' | 'cancel' | null>(null);

  useEffect(() => {
    demoPayApi
      .get(ref)
      .then(({ data }) => setPayment(data))
      .catch(() => setMissing(true));
  }, [ref]);

  const finish = async (outcome: 'pay' | 'cancel') => {
    setBusy(outcome);
    try {
      const { data } = await demoPayApi.finish(ref, outcome);
      window.location.href = data.redirect;
    } catch {
      setBusy(null);
      setMissing(true);
    }
  };

  return (
    <PublicLayout>
      <div className="mx-auto max-w-md space-y-4">
        <div role="note" className="flex items-start gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <AlertTriangle size={20} className="mt-0.5 shrink-0" aria-hidden="true" />
          <p>
            <strong className="block">{t('demoPay.bannerTitle')}</strong>
            {t('demoPay.bannerDesc')}
          </p>
        </div>

        <div className="rounded-3xl bg-white p-8 shadow-xl ring-1 ring-slate-100">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
            <CreditCard size={28} aria-hidden="true" />
          </div>
          <h1 className="text-center text-2xl font-extrabold text-slate-900">{t('demoPay.title')}</h1>

          {missing && <p role="alert" className="mt-4 text-center text-slate-600">{t('demoPay.missing')}</p>}
          {!payment && !missing && (
            <p role="status" className="mt-4 flex items-center justify-center gap-2 text-slate-500">
              <Loader2 size={18} className="animate-spin" aria-hidden="true" /> {t('common.loading')}
            </p>
          )}

          {payment && !missing && (
            <>
              <dl className="mt-6 space-y-3 rounded-2xl bg-slate-50 p-4 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-slate-500">{t('demoPay.item')}</dt>
                  <dd className="font-semibold text-slate-900">{payment.label}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-slate-500">{t('demoPay.amount')}</dt>
                  <dd className="font-semibold text-slate-900"><Num>₪{payment.amount}</Num></dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-slate-500">{t('form.email')}</dt>
                  <dd className="truncate text-slate-900" dir="ltr">{payment.email}</dd>
                </div>
              </dl>
              <div className="mt-6 space-y-2">
                <button
                  onClick={() => finish('pay')}
                  disabled={busy !== null}
                  className="w-full rounded-xl bg-emerald-600 py-3 font-semibold text-white shadow-md shadow-emerald-200 transition hover:bg-emerald-700 disabled:opacity-60"
                >
                  {busy === 'pay' ? t('demoPay.paying') : <>{t('demoPay.pay')} · <Num>₪{payment.amount}</Num></>}
                </button>
                <button
                  onClick={() => finish('cancel')}
                  disabled={busy !== null}
                  className="w-full rounded-xl py-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 disabled:opacity-60"
                >
                  {t('demoPay.cancel')}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </PublicLayout>
  );
};
