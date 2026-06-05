'use client';

interface HealthBarProps {
  value: number;
  max?: number;
  className?: string;
}

export function HealthBar({ value, max = 100, className = '' }: HealthBarProps) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  const color = pct >= 70 ? 'bg-emerald-500' : pct >= 40 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div className={`w-full h-2 rounded-full bg-muted ${className}`}>
      <div
        className={`h-full rounded-full transition-all ${color}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
