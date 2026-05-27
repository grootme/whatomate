/**
 * Seed script for intelligence database
 * Run with: bun run scripts/seed-intelligence.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding intelligence database...');

  // ===== THRESHOLD CONFIGS =====
  const thresholds = [
    { name: 'Menciones fraude financiero', description: 'Cantidad de menciones de fraude por hora', metric: 'fraud_mentions_per_hour', condition: 'gte', value: 3, unit: 'menciones/hora', alertSeverity: 'CRÍTICA', alertType: 'Alerta roja', currentValue: 0, enabled: true },
    { name: 'Terremotos M5.0+', description: 'Magnitud de terremotos detectados', metric: 'earthquake_magnitude', condition: 'gte', value: 5.0, unit: 'magnitud', alertSeverity: 'ALTA', alertType: 'Alerta sísmica', currentValue: 0, enabled: true },
    { name: 'Vuelos militares zona conflicto', description: 'Vuelos militares en zona de conflicto por período', metric: 'military_flights', condition: 'gte', value: 3, unit: 'vuelos/2horas', alertSeverity: 'ALTA', alertType: 'Escalación', currentValue: 0, enabled: true },
    { name: 'Mensajes sospechosos WhatsApp', description: 'Mensajes con palabras clave sospechosas', metric: 'suspicious_messages', condition: 'gte', value: 10, unit: 'mensajes/hora', alertSeverity: 'MEDIA', alertType: 'Revisión manual', currentValue: 0, enabled: true },
    { name: 'Actividad grupos inactivos', description: 'Múltiplo de actividad sobre media histórica', metric: 'inactive_group_activity', condition: 'gte', value: 5, unit: 'x media', alertSeverity: 'MEDIA', alertType: 'Revisión manual', currentValue: 0, enabled: true },
    { name: 'Alertas climáticas extremas', description: 'Alertas climáticas simultáneas', metric: 'weather_alerts', condition: 'gte', value: 200, unit: 'alertas', alertSeverity: 'BAJA', alertType: 'Monitoreo', currentValue: 0, enabled: true },
  ];

  for (const t of thresholds) {
    await prisma.thresholdConfig.upsert({
      where: { id: `thr_${t.metric}` },
      update: t,
      create: { id: `thr_${t.metric}`, ...t },
    });
  }
  console.log(`  ✅ ${thresholds.length} threshold configs seeded`);

  // ===== AGENT STATES =====
  const agents = [
    { agentId: 'ing-wa', name: 'WhatsApp Bridge', layer: 1, layerName: 'Ingesta', status: 'inactive', health: 0, messagesProcessed: 0 },
    { agentId: 'ing-tg', name: 'Telethon (Telegram)', layer: 1, layerName: 'Ingesta', status: 'inactive', health: 0, messagesProcessed: 0 },
    { agentId: 'ing-os', name: 'OSINT Shadowbroker', layer: 1, layerName: 'Ingesta', status: 'inactive', health: 0, messagesProcessed: 0 },
    { agentId: 'ana-sem', name: 'Semantic Analyzer', layer: 2, layerName: 'Análisis', status: 'inactive', health: 0, messagesProcessed: 0 },
    { agentId: 'ana-pat', name: 'Pattern Detector', layer: 2, layerName: 'Análisis', status: 'inactive', health: 0, messagesProcessed: 0 },
    { agentId: 'ana-cro', name: 'Cross-Platform Correlator', layer: 2, layerName: 'Análisis', status: 'inactive', health: 0, messagesProcessed: 0 },
    { agentId: 'ana-ris', name: 'Risk Scorer', layer: 2, layerName: 'Análisis', status: 'inactive', health: 0, messagesProcessed: 0 },
    { agentId: 'mon-thr', name: 'Threshold Monitor', layer: 3, layerName: 'Monitoreo', status: 'inactive', health: 0, messagesProcessed: 0 },
    { agentId: 'mon-ano', name: 'Anomaly Detector', layer: 3, layerName: 'Monitoreo', status: 'inactive', health: 0, messagesProcessed: 0 },
    { agentId: 'mon-ale', name: 'Alert Engine', layer: 3, layerName: 'Monitoreo', status: 'inactive', health: 0, messagesProcessed: 0 },
    { agentId: 'rep-gen', name: 'Report Generator', layer: 4, layerName: 'Reportes', status: 'inactive', health: 0, messagesProcessed: 0 },
    { agentId: 'rep-das', name: 'Dashboard Builder', layer: 4, layerName: 'Reportes', status: 'inactive', health: 0, messagesProcessed: 0 },
    { agentId: 'rep-sch', name: 'Scheduler', layer: 4, layerName: 'Reportes', status: 'inactive', health: 0, messagesProcessed: 0 },
  ];

  for (const a of agents) {
    await prisma.agentState.upsert({
      where: { agentId: a.agentId },
      update: a,
      create: a,
    });
  }
  console.log(`  ✅ ${agents.length} agent states seeded`);

  // ===== ADAPTIVE METRICS (historical baseline) =====
  const baseDate = new Date('2026-01-01');
  for (let i = 0; i < 10; i++) {
    const date = new Date(baseDate.getTime() + i * 15 * 24 * 60 * 60 * 1000);
    const fpRate = 12.5 - i * 1.1;
    const sensitivity = 80 + i * 1.7;
    const accuracy = 78 + i * 2;
    
    await prisma.adaptiveMetric.create({
      data: {
        date,
        falsePositiveRate: Math.max(0, fpRate),
        sensitivity: Math.min(100, sensitivity),
        accuracy: Math.min(100, accuracy),
        threshold: 'system',
      },
    });
  }
  console.log('  ✅ 10 adaptive metrics seeded (historical baseline)');

  // ===== PATTERN DETECTIONS (initial) =====
  const patterns = [
    { patternType: 'fraud_multichannel', severity: 'CRÍTICA', confidence: 94.7, description: 'Detección de esquemas de fraude coordinados entre WhatsApp, Telegram y otras plataformas simultáneamente', occurrences: 23, status: 'active', detectionRate: 94.7 },
    { patternType: 'money_laundering', severity: 'ALTA', confidence: 87.3, description: 'Patrones de transacciones sospechosas que indican posibles operaciones de lavado de dinero a través de múltiples canales', occurrences: 15, status: 'active', detectionRate: 87.3 },
    { patternType: 'irregular_migration', severity: 'MEDIA', confidence: 72.1, description: 'Identificación de rutas y patrones de migración irregular basados en comunicaciones y datos OSINT', occurrences: 8, status: 'active', detectionRate: 72.1 },
    { patternType: 'disinformation', severity: 'ALTA', confidence: 81.5, description: 'Campañas de desinformación sincronizadas en múltiples plataformas con narrativas similares', occurrences: 31, status: 'active', detectionRate: 81.5 },
    { patternType: 'crypto_manipulation', severity: 'ALTA', confidence: 76.8, description: 'Esquemas de pump-and-dump y manipulación de mercados cripto detectados en grupos de comunicación', occurrences: 19, status: 'active', detectionRate: 76.8 },
  ];

  for (const p of patterns) {
    await prisma.patternDetection.create({ data: p });
  }
  console.log(`  ✅ ${patterns.length} pattern detections seeded`);

  console.log('\n🎉 Intelligence database seeded successfully!');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
