'use client';
import { AGENT_STATUS, type AgentStatus } from '@/lib/registries';

interface StatusDotProps {
  status: AgentStatus;
  size?: number;
  pulse?: boolean;
}

export function StatusDot({ status, size = 2.5, pulse = true }: StatusDotProps) {
  const config = AGENT_STATUS[status];
  return (
    <span className="relative flex h-3 w-3">
      {pulse && status === 'active' && (
        <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${config.bg}`} />
      )}
      <span
        className={`relative inline-flex rounded-full ${config.bg}`}
        style={{ width: size * 4, height: size * 4 }}
      />
    </span>
  );
}
