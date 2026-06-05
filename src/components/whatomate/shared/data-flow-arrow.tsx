'use client';

interface DataFlowArrowProps {
  animated?: boolean;
  direction?: 'down' | 'right';
  className?: string;
}

export function DataFlowArrow({ animated = true, direction = 'down', className = '' }: DataFlowArrowProps) {
  const isDown = direction === 'down';
  return (
    <div className={`flex ${isDown ? 'flex-col items-center' : 'flex-row items-center'} ${className}`}>
      {[0, 1, 2].map(i => (
        <div
          key={i}
          className={`${isDown ? 'w-0.5 h-2' : 'h-0.5 w-2'} bg-current opacity-40`}
          style={animated ? { animation: `pulse 1.5s ease-in-out ${i * 0.2}s infinite` } : {}}
        />
      ))}
      <span className="text-xs opacity-60">{isDown ? '▼' : '▶'}</span>
    </div>
  );
}
