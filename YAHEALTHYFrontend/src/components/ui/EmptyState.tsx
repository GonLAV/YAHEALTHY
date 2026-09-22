import { ReactNode } from 'react';

export const EmptyState = ({ icon, text }: { icon: ReactNode; text: string }) => (
  <div className="flex flex-col items-center justify-center gap-3 rounded-2xl bg-white px-6 py-10 text-center shadow-sm ring-1 ring-slate-100">
    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
      {icon}
    </div>
    <p className="max-w-xs text-sm text-slate-500">{text}</p>
  </div>
);

export default EmptyState;
