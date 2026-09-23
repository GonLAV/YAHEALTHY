import { ReactNode } from 'react';
import { COLOR } from '@/theme';

interface ProgressRingProps {
  value: number; // current
  target: number; // goal
  size?: number;
  strokeWidth?: number;
  color?: string; // hex
  trackColor?: string; // hex
  children?: ReactNode; // content inside the ring
}

export const ProgressRing = ({
  value,
  target,
  size = 180,
  strokeWidth = 14,
  color = COLOR.brand,
  trackColor = COLOR.track,
  children,
}: ProgressRingProps) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = target > 0 ? Math.min(1, value / target) : 0;
  const offset = circumference - pct * circumference;

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={trackColor}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-700"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>
    </div>
  );
};

export default ProgressRing;
