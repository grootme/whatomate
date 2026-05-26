import { NextResponse } from 'next/server';
import { mockAgentLayers, mockEcosystemStats, mockEventBusEvents } from '@/lib/mock-data';

export async function GET() {
  const allAgents = mockAgentLayers.flatMap((l) => l.agents);
  const activeAgents = allAgents.filter((a) => a.status === 'active');
  const totalProcessed = allAgents.reduce((s, a) => s + a.messagesProcessed, 0);
  const avgHealth = Math.round(
    allAgents.filter((a) => a.status !== 'inactive').reduce((s, a) => s + a.health, 0) /
    allAgents.filter((a) => a.status !== 'inactive').length
  );

  return NextResponse.json({
    layers: mockAgentLayers,
    stats: {
      totalAgents: allAgents.length,
      activeAgents: activeAgents.length,
      totalProcessed,
      avgHealth,
      ecosystem: mockEcosystemStats,
    },
    eventBus: mockEventBusEvents.slice(0, 10),
  });
}
