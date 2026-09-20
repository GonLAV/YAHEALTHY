interface ProgressBarProps {
  value: number; // current
  target: number; // goal
  color?: string; // tailwind bg class for the fill
  height?: string;
}

export const ProgressBar = ({
  value,
  target,
  color = 'bg-emerald-500',
  height = 'h-2.5',
}: ProgressBarProps) => {
  const pct = target > 0 ? Math.min(100, Math.round((value / target) * 100)) : 0;
  return (
    <div className={`w-full overflow-hidden rounded-full bg-slate-100 ${height}`}>
      <div
        className={`${height} rounded-full ${color} transition-all duration-500`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
};

export default ProgressBar;
