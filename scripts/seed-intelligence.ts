/**
 * Comprehensive seed script for Whatomate intelligence database
 *
 * Seeds: ThresholdConfig, RiskDimension, AgentState
 * Uses upsert logic so the script is idempotent — safe to run multiple times.
 *
 * Run with: npx tsx scripts/seed-intelligence.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ──────────────────────────────────────────────
// 1. THRESHOLD CONFIGS
// ──────────────────────────────────────────────
const THRESHOLDS = [
  {
    name: 'Menciones fraude financiero',
    description: 'Cantidad de menciones de fraude por hora',
    metric: 'fraud_mentions_per_hour',
    condition: 'gte',
    value: 3,
    unit: 'mensajes/hora',
    alertSeverity: 'ALTA',
    alertType: 'fraud',
    currentValue: 0,
    enabled: true,
    metadata: JSON.stringify({ adaptiveBounds: { min: 1, max: 10 } }),
  },
  {
    name: 'Terremotos M5.0+',
    description: 'Magnitud de terremotos detectados',
    metric: 'earthquake_magnitude',
    condition: 'gte',
    value: 5.0,
    unit: 'magnitud',
    alertSeverity: 'MEDIA',
    alertType: 'seismic',
    currentValue: 0,
    enabled: true,
    metadata: JSON.stringify({ adaptiveBounds: { min: 3, max: 9 } }),
  },
  {
    name: 'Vuelos militares zona conflicto',
    description: 'Vuelos militares en zona de conflicto por período',
    metric: 'military_flights',
    condition: 'gte',
    value: 10,
    unit: 'vuelos',
    alertSeverity: 'MEDIA',
    alertType: 'military',
    currentValue: 0,
    enabled: true,
    metadata: JSON.stringify({ adaptiveBounds: { min: 3, max: 30 } }),
  },
  {
    name: 'Mensajes sospechosos',
    description: 'Mensajes con palabras clave sospechosas',
    metric: 'suspicious_messages',
    condition: 'gte',
    value: 50,
    unit: 'mensajes',
    alertSeverity: 'ALTA',
    alertType: 'suspicious',
    currentValue: 0,
    enabled: true,
    metadata: JSON.stringify({ adaptiveBounds: { min: 10, max: 200 } }),
  },
  {
    name: 'Actividad grupos inactivos',
    description: 'Múltiplo de actividad sobre media histórica',
    metric: 'inactive_group_activity',
    condition: 'gte',
    value: 3.0,
    unit: 'x promedio',
    alertSeverity: 'BAJA',
    alertType: 'activity',
    currentValue: 0,
    enabled: true,
    metadata: JSON.stringify({ adaptiveBounds: { min: 1, max: 10 } }),
  },
  {
    name: 'Alertas climáticas extremas',
    description: 'Alertas climáticas simultáneas',
    metric: 'weather_alerts',
    condition: 'gte',
    value: 5,
    unit: 'alertas',
    alertSeverity: 'MEDIA',
    alertType: 'weather',
    currentValue: 0,
    enabled: true,
    metadata: JSON.stringify({ adaptiveBounds: { min: 1, max: 20 } }),
  },
  {
    name: 'Eventos GDELT conflicto',
    description: 'Eventos de conflicto detectados por GDELT',
    metric: 'gdelt_events',
    condition: 'gte',
    value: 15,
    unit: 'eventos',
    alertSeverity: 'MEDIA',
    alertType: 'conflict',
    currentValue: 0,
    enabled: true,
    metadata: JSON.stringify({ adaptiveBounds: { min: 5, max: 50 } }),
  },
];

// ──────────────────────────────────────────────
// 2. RISK DIMENSIONS
// ──────────────────────────────────────────────
const RISK_DIMENSIONS = [
  {
    name: 'Naturaleza',
    weight: 35,
    color: '#EF4444',
    description: 'Tipo y severidad de la actividad',
  },
  {
    name: 'Volumen',
    weight: 25,
    color: '#F59E0B',
    description: 'Cantidad de eventos relacionados',
  },
  {
    name: 'Conexiones',
    weight: 20,
    color: '#3B82F6',
    description: 'Vínculos entre entidades',
  },
  {
    name: 'Contexto OSINT',
    weight: 15,
    color: '#10B981',
    description: 'Corroboración de fuentes abiertas',
  },
  {
    name: 'Recencia',
    weight: 5,
    color: '#8B5CF6',
    description: 'Frescura de los datos',
  },
];

// ──────────────────────────────────────────────
// 3. AGENT STATES (matching AGENT_DEFINITIONS in agents API route)
// ──────────────────────────────────────────────
const AGENT_STATES = [
  // Layer 1: Ingesta
  { agentId: 'ing-wa', name: 'WhatsApp Bridge', layer: 1, layerName: 'Ingesta', status: 'inactive' as const, health: 0, messagesProcessed: 0 },
  { agentId: 'ing-tg', name: 'Telethon (Telegram)', layer: 1, layerName: 'Ingesta', status: 'inactive' as const, health: 0, messagesProcessed: 0 },
  { agentId: 'ing-os', name: 'OSINT Shadowbroker', layer: 1, layerName: 'Ingesta', status: 'inactive' as const, health: 0, messagesProcessed: 0 },
  // Layer 2: Análisis
  { agentId: 'ana-sem', name: 'Semantic Analyzer', layer: 2, layerName: 'Análisis', status: 'inactive' as const, health: 0, messagesProcessed: 0 },
  { agentId: 'ana-pat', name: 'Pattern Detector', layer: 2, layerName: 'Análisis', status: 'inactive' as const, health: 0, messagesProcessed: 0 },
  { agentId: 'ana-cro', name: 'Cross-Platform Correlator', layer: 2, layerName: 'Análisis', status: 'inactive' as const, health: 0, messagesProcessed: 0 },
  { agentId: 'ana-ris', name: 'Risk Scorer', layer: 2, layerName: 'Análisis', status: 'inactive' as const, health: 0, messagesProcessed: 0 },
  // Layer 3: Monitoreo
  { agentId: 'mon-thr', name: 'Threshold Monitor', layer: 3, layerName: 'Monitoreo', status: 'inactive' as const, health: 0, messagesProcessed: 0 },
  { agentId: 'mon-ano', name: 'Anomaly Detector', layer: 3, layerName: 'Monitoreo', status: 'inactive' as const, health: 0, messagesProcessed: 0 },
  { agentId: 'mon-ale', name: 'Alert Engine', layer: 3, layerName: 'Monitoreo', status: 'inactive' as const, health: 0, messagesProcessed: 0 },
  // Layer 4: Reportes
  { agentId: 'rep-gen', name: 'Report Generator', layer: 4, layerName: 'Reportes', status: 'inactive' as const, health: 0, messagesProcessed: 0 },
  { agentId: 'rep-das', name: 'Dashboard Builder', layer: 4, layerName: 'Reportes', status: 'inactive' as const, health: 0, messagesProcessed: 0 },
  { agentId: 'rep-sch', name: 'Scheduler', layer: 4, layerName: 'Reportes', status: 'inactive' as const, health: 0, messagesProcessed: 0 },
];

// ──────────────────────────────────────────────
// Seed functions with upsert logic
// ──────────────────────────────────────────────

async function seedThresholds() {
  console.log('\n📡 Seeding ThresholdConfig...');
  let created = 0;
  let updated = 0;

  for (const t of THRESHOLDS) {
    // Check by metric (unique business key)
    const existing = await prisma.thresholdConfig.findFirst({
      where: { metric: t.metric },
    });

    if (existing) {
      await prisma.thresholdConfig.update({
        where: { id: existing.id },
        data: {
          name: t.name,
          description: t.description,
          condition: t.condition,
          value: t.value,
          unit: t.unit,
          alertSeverity: t.alertSeverity,
          alertType: t.alertType,
          currentValue: t.currentValue,
          enabled: t.enabled,
          metadata: t.metadata,
        },
      });
      updated++;
    } else {
      await prisma.thresholdConfig.create({
        data: t,
      });
      created++;
    }
  }

  console.log(`  ✅ ${THRESHOLDS.length} threshold configs: ${created} created, ${updated} updated`);
}

async function seedRiskDimensions() {
  console.log('\n⚖️  Seeding RiskDimension...');
  let created = 0;
  let updated = 0;

  for (const dim of RISK_DIMENSIONS) {
    // Use upsert on unique `name` field
    const existing = await prisma.riskDimension.findUnique({
      where: { name: dim.name },
    });

    if (existing) {
      await prisma.riskDimension.update({
        where: { id: existing.id },
        data: {
          weight: dim.weight,
          color: dim.color,
          description: dim.description,
        },
      });
      updated++;
    } else {
      await prisma.riskDimension.create({
        data: dim,
      });
      created++;
    }
  }

  console.log(`  ✅ ${RISK_DIMENSIONS.length} risk dimensions: ${created} created, ${updated} updated`);
}

async function seedAgentStates() {
  console.log('\n🤖 Seeding AgentState...');
  let created = 0;
  let updated = 0;

  for (const a of AGENT_STATES) {
    // Use upsert on unique `agentId` field
    const existing = await prisma.agentState.findUnique({
      where: { agentId: a.agentId },
    });

    if (existing) {
      await prisma.agentState.update({
        where: { id: existing.id },
        data: {
          name: a.name,
          layer: a.layer,
          layerName: a.layerName,
          status: a.status,
          health: a.health,
          messagesProcessed: a.messagesProcessed,
        },
      });
      updated++;
    } else {
      await prisma.agentState.create({
        data: a,
      });
      created++;
    }
  }

  console.log(`  ✅ ${AGENT_STATES.length} agent states: ${created} created, ${updated} updated`);
}

// ──────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────

async function main() {
  console.log('🌱 Whatomate Intelligence Database Seed');
  console.log('========================================');
  console.log(`Started at: ${new Date().toISOString()}`);

  try {
    await seedThresholds();
    await seedRiskDimensions();
    await seedAgentStates();

    // Print summary
    console.log('\n========================================');
    console.log('📊 Summary:');

    const thresholdCount = await prisma.thresholdConfig.count();
    const riskDimCount = await prisma.riskDimension.count();
    const agentCount = await prisma.agentState.count();

    console.log(`  ThresholdConfig: ${thresholdCount} records`);
    console.log(`  RiskDimension:   ${riskDimCount} records`);
    console.log(`  AgentState:      ${agentCount} records`);

    console.log('\n🎉 Intelligence database seeded successfully!');
  } catch (error) {
    console.error('\n❌ Seed failed:');
    console.error(error);
    process.exit(1);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
