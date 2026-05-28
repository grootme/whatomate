/**
 * Comprehensive seed script for Whatomate intelligence database
 *
 * Seeds: ThresholdConfig, RiskDimension, AgentState
 * Uses upsert logic so the script is idempotent — safe to run multiple times.
 *
 * Flags:
 *   --force   Delete existing data before seeding (destructive)
 *
 * Run with:
 *   npx tsx scripts/seed-intelligence.ts
 *   npx tsx scripts/seed-intelligence.ts --force
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Parse CLI flags
const args = process.argv.slice(2);
const forceMode = args.includes('--force');

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
// Force mode: delete existing data
// ──────────────────────────────────────────────

async function forceCleanAll() {
  console.log('\n⚠️  FORCE MODE: Deleting existing data...');

  await prisma.$transaction([
    prisma.thresholdConfig.deleteMany(),
    prisma.riskDimension.deleteMany(),
    prisma.agentState.deleteMany(),
  ]);

  console.log('  ✅ All ThresholdConfig, RiskDimension, and AgentState records deleted');
}

// ──────────────────────────────────────────────
// Seed functions with upsert logic (atomic via transactions)
// ──────────────────────────────────────────────

async function seedThresholds() {
  console.log('\n📡 Seeding ThresholdConfig (upsert on metric)...');

  const result = await prisma.$transaction(
    THRESHOLDS.map((t) =>
      prisma.thresholdConfig.upsert({
        where: { metric: t.metric },
        update: {
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
        create: t,
      }),
    ),
  );

  const created = result.filter((r) => r.createdAt.getTime() === r.updatedAt.getTime()).length;
  const updated = result.length - created;
  console.log(`  ✅ ${THRESHOLDS.length} threshold configs: ${created} created, ${updated} updated`);
}

async function seedRiskDimensions() {
  console.log('\n⚖️  Seeding RiskDimension (upsert on name)...');

  const result = await prisma.$transaction(
    RISK_DIMENSIONS.map((dim) =>
      prisma.riskDimension.upsert({
        where: { name: dim.name },
        update: {
          weight: dim.weight,
          color: dim.color,
          description: dim.description,
        },
        create: dim,
      }),
    ),
  );

  const created = result.filter((r) => r.createdAt.getTime() === r.updatedAt.getTime()).length;
  const updated = result.length - created;
  console.log(`  ✅ ${RISK_DIMENSIONS.length} risk dimensions: ${created} created, ${updated} updated`);
}

async function seedAgentStates() {
  console.log('\n🤖 Seeding AgentState (upsert on agentId)...');

  const result = await prisma.$transaction(
    AGENT_STATES.map((a) =>
      prisma.agentState.upsert({
        where: { agentId: a.agentId },
        update: {
          name: a.name,
          layer: a.layer,
          layerName: a.layerName,
          status: a.status,
          health: a.health,
          messagesProcessed: a.messagesProcessed,
        },
        create: a,
      }),
    ),
  );

  const created = result.filter((r) => r.createdAt.getTime() === r.updatedAt.getTime()).length;
  const updated = result.length - created;
  console.log(`  ✅ ${AGENT_STATES.length} agent states: ${created} created, ${updated} updated`);
}

// ──────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────

async function main() {
  console.log('🌱 Whatomate Intelligence Database Seed');
  console.log('========================================');
  console.log(`Started at: ${new Date().toISOString()}`);
  if (forceMode) {
    console.log('🔓 Mode: FORCE (destructive — existing data will be deleted)');
  } else {
    console.log('🔒 Mode: IDEMPOTENT (upsert — safe to run multiple times)');
  }

  try {
    // Force mode: clean slate
    if (forceMode) {
      await forceCleanAll();
    }

    // All seeding in a single top-level transaction for atomicity
    await prisma.$transaction(async (tx) => {
      // Seed thresholds using upsert on `metric` unique field
      for (const t of THRESHOLDS) {
        await tx.thresholdConfig.upsert({
          where: { metric: t.metric },
          update: {
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
          create: t,
        });
      }
      console.log('\n📡 ThresholdConfig seeded (upsert on metric)');

      // Seed risk dimensions using upsert on `name` unique field
      for (const dim of RISK_DIMENSIONS) {
        await tx.riskDimension.upsert({
          where: { name: dim.name },
          update: {
            weight: dim.weight,
            color: dim.color,
            description: dim.description,
          },
          create: dim,
        });
      }
      console.log('⚖️  RiskDimension seeded (upsert on name)');

      // Seed agent states using upsert on `agentId` unique field
      for (const a of AGENT_STATES) {
        await tx.agentState.upsert({
          where: { agentId: a.agentId },
          update: {
            name: a.name,
            layer: a.layer,
            layerName: a.layerName,
            status: a.status,
            health: a.health,
            messagesProcessed: a.messagesProcessed,
          },
          create: a,
        });
      }
      console.log('🤖 AgentState seeded (upsert on agentId)');
    });

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
