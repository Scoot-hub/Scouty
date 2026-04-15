import { cn } from '@/lib/utils';
import { useEffect, useState } from 'react';

interface CircularGaugeProps {
  value: number;
  max?: number;
  size?: number;
  strokeWidth?: number;
  variant?: 'success' | 'primary';
  label?: string;
  className?: string;
}

export function CircularGauge({
  value,
  max = 10,
  size = 120,
  strokeWidth = 8,
  variant = 'primary',
  label,
  className,
}: CircularGaugeProps) {
  const [mounted, setMounted] = useState(false);
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const percentage = (value / max) * 100;
  const offset = circumference - (percentage / 100) * circumference;

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 100);
    return () => clearTimeout(t);
  }, []);

  const strokeColor = variant === 'success' ? 'hsl(var(--success))' : 'hsl(var(--primary))';

  // Responsive text sizing based on gauge size
  const textClass = size >= 100 ? 'text-2xl' : size >= 70 ? 'text-lg' : size >= 50 ? 'text-sm' : 'text-xs';
  const labelClass = size >= 80 ? 'text-sm' : 'text-[10px]';

  return (
    <div className={cn('flex flex-col items-center gap-1', className)}>
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="hsl(var(--muted))"
            strokeWidth={strokeWidth}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={strokeColor}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={mounted ? offset : circumference}
            strokeLinecap="round"
            className="gauge-circle"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className={`${textClass} font-bold font-mono`}>{value}</span>
        </div>
      </div>
      {label && <span className={`${labelClass} font-medium text-muted-foreground`}>{label}</span>}
    </div>
  );
}
