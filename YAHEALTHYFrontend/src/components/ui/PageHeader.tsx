import { ReactNode } from 'react';

export const PageHeader = ({
  title,
  subtitle,
  icon,
}: {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
}) => (
  <div className="mb-6 flex items-center gap-3">
    {icon && (
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
        {icon}
      </div>
    )}
    <div>
      <h1 className="text-2xl font-bold text-slate-900 md:text-3xl">{title}</h1>
      {subtitle && <p className="mt-0.5 text-sm text-slate-500 md:text-base">{subtitle}</p>}
    </div>
  </div>
);

export default PageHeader;
