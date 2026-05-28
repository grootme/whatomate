import { NextResponse } from 'next/server';
import { fetchService } from '@/lib/intelligence/service-client';
import { db } from '@/lib/db';
import { withAuth } from '@/lib/intelligence/auth';

// ===== Agent Definition (static metadata) =====
interface AgentDefinition {
  id: string;
  name: string;
  layer: number;
  layerName: string;
  description: string;
  serviceCheck?: {
    service: Parameters<typeof fetchService>[0];
    path: string;
  };
}

const AGENT_DEFINITIONS: AgentDefinition[] = [
  // Layer 1: Ingesta
  {
    id: 'ing-wa',
    name: 'WhatsApp Bridge',
    layer: 1,
    layerName: 'Ingesta',
    description: 'Conector Baileys para WhatsApp - monitoreo de 195 grupos',
    serviceCheck: { service: 'whatsapp', path: '/status' },
  },
  {
    id: 'ing-tg',
    name: 'Telethon (Telegram)',
    layer: 1,
    layerName: 'Ingesta',
    description: 'Conector Telegram - monitoreo de canales con 16.3M+ miembros',
    serviceCheck: { service: 'telegram', path: '/status' },
  },
  {
    id: 'ing-os',
    name: 'OSINT Shadowbroker',
    layer: 1,
    layerName: 'Ingesta',
    description: 'Motor OSINT - 6 fuentes de inteligencia activas',
    serviceCheck: { service: 'osint', path: '/report' },
  },
  // Layer 2: Análisis
  {
    id: 'ana-sem',
    name: 'Semantic Analyzer',
    layer: 2,
    layerName: 'Análisis',
    description: 'Análisis semántico con NLP y detección de intenciones',
    serviceCheck: { service: 'cognitive', path: '/dashboard' },
  },
  {
    id: 'ana-pat',
    name: 'Pattern Detector',
    layer: 2,
    layerName: 'Análisis',
    description: 'Detección de patrones de fraude, lavado y desinformación',
  },
  {
    id: 'ana-cro',
    name: 'Cross-Platform Correlator',
    layer: 2,
    layerName: 'Análisis',
    description: 'Correlación de eventos entre WhatsApp, Telegram y OSINT',
  },
  {
    id: 'ana-ris',
    name: 'Risk Scorer',
    layer: 2,
    layerName: 'Análisis',
    description: 'Puntuación de riesgo multidimensional con 5 factores',
  },
  // Layer 3: Monitoreo
  {
    id: 'mon-thr',
    name: 'Threshold Monitor',
    layer: 3,
    layerName: 'Monitoreo',
    description: 'Monitoreo de umbrales configurables con alertas automáticas',
  },
  {
    id: 'mon-ano',
    name: 'Anomaly Detector',
    layer: 3,
    layerName: 'Monitoreo',
    description: 'Detección de anomalías con ML y desviación estadística',
  },
  {
    id: 'mon-ale',
    name: 'Alert Engine',
    layer: 3,
    layerName: 'Monitoreo',
    description: 'Motor de alertas con 5 niveles de severidad y escalamiento',
    serviceCheck: { service: 'shadowbrokerAi', path: '/status' },
  },
  // Layer 4: Reportes
  {
    id: 'rep-gen',
    name: 'Report Generator',
    layer: 4,
    layerName: 'Reportes',
    description: 'Generación de reportes diarios, semanales y mensuales',
  },
  {
    id: 'rep-das',
    name: 'Dashboard Builder',
    layer: 4,
    layerName: 'Reportes',
    description: 'Constructor de dashboards con métricas en tiempo real',
  },
  {
    id: 'rep-sch',
    name: 'Scheduler',
    layer: 4,
    layerName: 'Reportes',
    description: 'Programador de tareas y reportes automáticos',
  },
];

// ===== Compute health from AgentState data =====
function computeHealthFromDB(
  agentState: { lastHeartbeat: Date | null; status: string; health: number } | null,
  serviceOnline: boolean | null
): number {
  // If we have an agent state in DB, use it primarily
  if (agentState) {
    const now = Date.now();
    const heartbeatAge = agentState.lastHeartbeat
      ? now - agentState.lastHeartbeat.getTime()
      : Infinity;

    // Health based on heartbeat freshness:
    // < 1 min → 100, < 5 min → 90, < 15 min → 70, < 30 min → 50, < 1hr → 30, > 1hr → 10
    let heartbeatHealth: number;
    if (heartbeatAge < 60 * 1000) heartbeatHealth = 100;
    else if (heartbeatAge < 5 * 60 * 1000) heartbeatHealth = 90;
    else if (heartbeatAge < 15 * 60 * 1000) heartbeatHealth = 70;
    else if (heartbeatAge < 30 * 60 * 1000) heartbeatHealth = 50;
    else if (heartbeatAge < 60 * 60 * 1000) heartbeatHealth = 30;
    else heartbeatHealth = 10;

    // Factor in service availability if checked
    if (serviceOnline === true) {
      heartbeatHealth = Math.max(heartbeatHealth, 80);
    } else if (serviceOnline === false) {
      heartbeatHealth = Math.min(heartbeatHealth, 30);
    }

    // Use DB health as a floor/ceiling guide
    return Math.min(100, Math.max(0, Math.round((heartbeatHealth + agentState.health) / 2)));
  }

  // No DB state: infer from service check
  if (serviceOnline === true) return 85;
  if (serviceOnline === false) return 0;
  return 0; // Unknown
}

// ===== Compute status from DB and service check =====
function computeStatusFromDB(
  agentState: { status: string; lastHeartbeat: Date | null } | null,
  serviceOnline: boolean | null
): 'active' | 'inactive' | 'warning' | 'error' {
  if (agentState) {
    // If DB says active, check heartbeat freshness
    if (agentState.status === 'active') {
      if (serviceOnline === false) return 'warning';
      const heartbeatAge = agentState.lastHeartbeat
        ? Date.now() - agentState.lastHeartbeat.getTime()
        : Infinity;
      if (heartbeatAge > 30 * 60 * 1000) return 'warning';
      return 'active';
    }
    return agentState.status as 'active' | 'inactive' | 'warning' | 'error';
  }

  // No DB state
  if (serviceOnline === true) return 'active';
  if (serviceOnline === false) return 'error';
  return 'inactive';
}

// ===== Compute uptime string from startedAt =====
function computeUptime(startedAt: Date | null | undefined): string {
  if (!startedAt) return '0d 0h';

  const now = Date.now();
  const diff = now - startedAt.getTime();
  if (diff < 0) return '0d 0h';

  const days = Math.floor(diff / (24 * 60 * 60 * 1000));
  const hours = Math.floor((diff % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));

  return `${days}d ${hours}h`;
}

async function _GET() {
  try {
    // ===== Try Go backend first =====
    const goResult = await fetchService<Record<string, unknown>>('goBackend', '/agents');
    if (!goResult.error && goResult.data) {
      return NextResponse.json(goResult.data);
    }

    // ===== Fallback to local Next.js intelligence engine =====
    console.warn('[api/agents] Go backend unavailable, using local fallback:', goResult.error);

    // Check all microservices in parallel
    const serviceChecks = await Promise.all([
      fetchService<{ connected: boolean; groups?: number }>('whatsapp', '/status'),
      fetchService<{ status: string; groups_count?: number }>('telegram', '/status'),
      fetchService<{ status: string }>('osint', '/report'),
      fetchService<{ status: string }>('cognitive', '/dashboard'),
      fetchService<{ status: string }>('hermes', '/status'),
      fetchService<{ status: string }>('shadowbrokerAi', '/status'),
    ]);

    // Map service check results
    const serviceResults: Record<string, boolean | null> = {
      whatsapp: !serviceChecks[0].error,
      telegram: !serviceChecks[1].error,
      osint: !serviceChecks[2].error,
      cognitive: !serviceChecks[3].error,
      hermes: !serviceChecks[4].error,
      shadowbrokerAi: !serviceChecks[5].error,
    };

    // Load all persisted agent states from DB
    const agentStates = await db.agentState.findMany();
    const agentMap = new Map(agentStates.map(a => [a.agentId, a]));

    // Build agents from definitions + DB state + service checks
    const agents = AGENT_DEFINITIONS.map(def => {
      const dbState = agentMap.get(def.id);
      let serviceOnline: boolean | null = null;

      // Determine service check result
      if (def.serviceCheck) {
        serviceOnline = serviceResults[def.serviceCheck.service] ?? null;
      }

      const health = computeHealthFromDB(dbState, serviceOnline);
      const status = computeStatusFromDB(dbState, serviceOnline);
      const uptime = computeUptime(dbState?.startedAt);

      return {
        id: def.id,
        name: def.name,
        layer: def.layer,
        layerName: def.layerName,
        status,
        health,
        messagesProcessed: dbState?.messagesProcessed ?? 0,
        lastHeartbeat: dbState?.lastHeartbeat?.toISOString() ?? '',
        uptime,
        description: def.description,
      };
    });

    // Group agents into layers
    const layers = [
      {
        id: 1,
        name: 'Ingesta',
        description: 'Captura y recolección de datos de múltiples fuentes en tiempo real',
        color: '#10B981',
        icon: 'Download',
        agents: agents.filter(a => a.layer === 1),
      },
      {
        id: 2,
        name: 'Análisis',
        description: 'Procesamiento semántico, detección de patrones y correlación multi-plataforma',
        color: '#F59E0B',
        icon: 'Brain',
        agents: agents.filter(a => a.layer === 2),
      },
      {
        id: 3,
        name: 'Monitoreo',
        description: 'Supervisión de umbrales, detección de anomalías y generación de alertas',
        color: '#EF4444',
        icon: 'Shield',
        agents: agents.filter(a => a.layer === 3),
      },
      {
        id: 4,
        name: 'Reportes',
        description: 'Generación automatizada de informes y construcción de dashboards',
        color: '#8B5CF6',
        icon: 'FileOutput',
        agents: agents.filter(a => a.layer === 4),
      },
    ];

    // Compute ecosystem stats from real DB data
    const [whatsappChannels, telegramChannels, osintChannels] = await Promise.all([
      db.rawMessage.findMany({
        where: { source: 'whatsapp' },
        select: { channelId: true },
        distinct: ['channelId'],
      }),
      db.rawMessage.findMany({
        where: { source: 'telegram' },
        select: { channelId: true },
        distinct: ['channelId'],
      }),
      db.rawMessage.findMany({
        where: { source: 'osint' },
        select: { channelId: true },
        distinct: ['channelId'],
      }),
    ]);

    const whatsappGroups = whatsappChannels.filter(c => c.channelId != null).length;
    const telegramChannelsCount = telegramChannels.filter(c => c.channelId != null).length;
    const osintSources = osintChannels.filter(c => c.channelId != null).length;

    // Also try to get richer stats from live service responses
    const whatsappGroupCount = (serviceChecks[0].data as { groups?: number } | null)?.groups;
    const telegramGroupCount = (serviceChecks[1].data as { groups_count?: number } | null)?.groups_count;

    // Compute telegramMembers from live service response (real member count)
    // Fall back to DB: estimate based on distinct channels × avg member count from last check
    const telegramMemberCount = (serviceChecks[1].data as { total_members?: number; members_count?: number } | null)?.total_members
      ?? (serviceChecks[1].data as { total_members?: number; members_count?: number } | null)?.members_count;

    const ecosystem = {
      whatsappGroups: whatsappGroupCount ?? whatsappGroups,
      telegramChannels: telegramGroupCount ?? telegramChannelsCount,
      osintSources: osintSources,
      totalGroups: (whatsappGroupCount ?? whatsappGroups) + (telegramGroupCount ?? telegramChannelsCount) + osintSources,
      telegramMembers: telegramMemberCount != null
        ? telegramMemberCount > 1000000
          ? `${(telegramMemberCount / 1000000).toFixed(1)}M+`
          : telegramMemberCount > 1000
            ? `${(telegramMemberCount / 1000).toFixed(1)}K+`
            : String(telegramMemberCount)
        : 'N/A',
    };

    return NextResponse.json({ layers, ecosystem });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export const GET = withAuth(_GET);
