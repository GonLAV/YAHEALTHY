import { ReactNode } from 'react';

interface StatCardProps {
  label: string;
  value: string | number;
  unit?: string;
  icon: ReactNode;
  color?: 'emerald' | 'sky' | 'violet' | 'amber' | 'rose';
}

const COLOR_MAP = {
  emerald: { bg: 'bg-emerald-100', text: 'text-emerald-600' },
  sky: { bg: 'bg-sky-100', text: 'text-sky-600' },
  violet: { bg: 'bg-violet-100', text: 'text-violet-600' },
  amber: { bg: 'bg-amber-100', text: 'text-amber-600' },
  rose: { bg: 'bg-rose-100', text: 'text-rose-600' },
};

export const StatCard = ({ label, value, unit, icon, color = 'emerald' }: StatCardProps) => {
  const c = COLOR_MAP[color];
  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100 transition hover:shadow-md">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-slate-500">{label}</span>
        <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${c.bg} ${c.text}`}>
          {icon}
        </span>
      </div>
      <div className="mt-3 flex items-baseline gap-1">
        <span className="num text-2xl font-bold text-slate-900">{value}</span>
        {unit && <span className="text-sm font-medium text-slate-400">{unit}</span>}
      </div>
    </div>
  );
};

export default StatCard;
