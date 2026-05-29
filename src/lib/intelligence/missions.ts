/**
 * Specialized Agent Missions — Multi-Agent Intelligence Platform
 *
 * Each Mission Group contains dedicated agents across all 4 DNA layers:
 * Ingestion → Analysis → Monitoring → Reports
 *
 * Mission Groups:
 * 1. ECONOMIC: Economía, Logística y Finanzas
 * 2. GEOPOLITICAL: Geopolítica, Seguridad, Historia y Conflictos
 * 3. TECH: Ciencia, Tecnología e Innovación (AI focus)
 * 4. RISK: Gestión de Riesgo Personal, Geográfico y Empresarial
 *
 * RICCO Patterns Applied:
 * - Strategy Pattern: Each mission has specialized strategies for its domain
 * - Registry Pattern: Missions registered in MissionRegistry
 * - Observer Pattern: Cross-mission event propagation
 * - Specification Pattern: Mission-specific alert criteria
 */

import type {
  AlertSeverity,
  DecisionStrategy,
  MessageSource,
  OsintSnapshot,
  RiskLevel,
} from './types';

// ===== MISSION TYPES =====

export type MissionId = 'economic' | 'geopolitical' | 'tech' | 'risk';

export interface MissionAgent {
  id: string;
  name: string;
  missionId: MissionId;
  layer: number; // 1-4 DNA layer
  layerName: string;
  description: string;
  capabilities: string[];
  status: 'active' | 'inactive' | 'warning' | 'error';
  health: number;
  messagesProcessed: number;
  lastHeartbeat: string;
  uptime: string;
  keywords: string[]; // Domain-specific keywords this agent monitors
  sources: MessageSource[]; // Which data sources this agent uses
  osintScraperIds?: string[]; // Specific OSINT scrapers relevant to this mission
}

export interface MissionThreshold {
  id: string;
  missionId: MissionId;
  name: string;
  metric: string;
  condition: 'gte' | 'lte' | 'gt' | 'lt' | 'eq';
  value: number;
  unit: string;
  alertSeverity: AlertSeverity;
  currentValue: number;
  enabled: boolean;
}

export interface MissionAlert {
  id: string;
  missionId: MissionId;
  title: string;
  description: string;
  severity: AlertSeverity;
  strategy: DecisionStrategy;
  timestamp: string;
  acknowledged: boolean;
}

export interface MissionStats {
  totalAgents: number;
  activeAgents: number;
  messagesProcessed: number;
  activeAlerts: number;
  healthAvg: number;
  threatScore: number; // 0-100 mission-specific threat
}

export interface MissionGroup {
  id: MissionId;
  name: string;
  description: string;
  icon: string;
  color: string;
  gradient: string;
  agents: MissionAgent[];
  thresholds: MissionThreshold[];
  alerts: MissionAlert[];
  stats: MissionStats;
  domains: string[]; // Domain expertise areas
  dataFlow: MissionDataFlowNode[];
}

export interface MissionDataFlowNode {
  layer: number;
  layerName: string;
  agentCount: number;
  messagesIn: number;
  messagesOut: number;
  alertsGenerated: number;
  status: 'active' | 'inactive' | 'degraded';
}

export interface CrossMissionCorrelation {
  id: string;
  missionIds: [MissionId, MissionId];
  entityType: string;
  entityName: string;
  confidence: number;
  description: string;
  timestamp: string;
}

// ===== MISSION DEFINITIONS =====

const MISSION_DEFINITIONS: Array<{
  id: MissionId;
  name: string;
  description: string;
  icon: string;
  color: string;
  gradient: string;
  domains: string[];
  agents: Array<{
    id: string;
    name: string;
    layer: number;
    description: string;
    capabilities: string[];
    keywords: string[];
    sources: MessageSource[];
    osintScraperIds?: string[];
  }>;
  thresholds: Array<{
    id: string;
    name: string;
    metric: string;
    condition: 'gte' | 'lte' | 'gt' | 'lt' | 'eq';
    value: number;
    unit: string;
    alertSeverity: AlertSeverity;
    currentValue: number;
    enabled: boolean;
  }>;
}> = [
  // ===== MISSION 1: ECONOMIC =====
  {
    id: 'economic',
    name: 'Economía, Logística y Finanzas',
    description: 'Monitoreo de mercados financieros, cadenas de suministro, movimientos de capital, lavado de dinero, fraudes financieros y tendencias económicas en tiempo real.',
    icon: 'DollarSign',
    color: '#10B981',
    gradient: 'from-emerald-500 to-teal-600',
    domains: ['mercados', 'finanzas', 'logística', 'comercio', 'criptomonedas', 'banca', 'supply chain', 'fraude financiero', 'lavado de dinero'],
    agents: [
      // Layer 1: Ingesta
      {
        id: 'eco-ing-fin',
        name: 'Financial Market Collector',
        layer: 1,
        description: 'Captura datos de mercados financieros, noticias económicas y movimientos de capital desde Telegram, WhatsApp y OSINT',
        capabilities: ['market_data_ingestion', 'financial_news_scraping', 'crypto_price_tracking'],
        keywords: ['dólar', 'euro', 'inflación', 'BCV', 'petróleo', 'crudo', 'mercado', 'bolsa', 'Bitcoin', 'USDT', 'tipo de cambio', 'reservas', 'PIB'],
        sources: ['telegram', 'whatsapp', 'osint'],
      },
      {
        id: 'eco-ing-log',
        name: 'Supply Chain Monitor',
        layer: 1,
        description: 'Monitorea rutas logísticas, puertos, embarcaciones y cadenas de suministro en tiempo real',
        capabilities: ['maritime_tracking', 'port_monitoring', 'route_analysis'],
        keywords: ['puerto', 'contenedor', 'embarque', 'arancel', 'importación', 'exportación', 'aduanas', 'flete', 'carga'],
        sources: ['osint'],
        osintScraperIds: ['ships'],
      },
      {
        id: 'eco-ing-cry',
        name: 'Crypto & FX Tracker',
        layer: 1,
        description: 'Rastrea transacciones cripto sospechosas y fluctuaciones cambiarias en canales financieros',
        capabilities: ['crypto_transaction_monitoring', 'forex_tracking', 'stablecoin_analysis'],
        keywords: ['USDT', 'BNB', 'Ethereum', 'wallet', 'transfer', 'P2P', 'exchange', 'swap', 'Binance', 'airdrop'],
        sources: ['telegram', 'whatsapp'],
      },
      // Layer 2: Análisis
      {
        id: 'eco-ana-fra',
        name: 'Fraud Pattern Analyzer',
        layer: 2,
        description: 'Detecta patrones de fraude financiero multi-canal: estafas piramidales, esquemas Ponzi, phishing financiero',
        capabilities: ['fraud_detection', 'pattern_matching', 'entity_correlation'],
        keywords: ['inversión', 'ganancia', 'rendimiento', 'estafa', 'pirámide', 'Ponzi', 'phishing', 'robo'],
        sources: ['telegram', 'whatsapp', 'osint'],
      },
      {
        id: 'eco-ana-ml',
        name: 'AML Detector (Lavado)',
        layer: 2,
        description: 'Analiza patrones de lavado de dinero: fragmentación, capas, integración con enfoque multi-plataforma',
        capabilities: ['aml_detection', 'transaction_graph_analysis', 'layering_detection'],
        keywords: ['lavado', 'blanqueo', 'offshore', 'paraíso fiscal', 'transferencia', 'fragmentación', 'smurfing'],
        sources: ['telegram', 'whatsapp', 'osint'],
      },
      {
        id: 'eco-ana-mac',
        name: 'Macroeconomic Analyzer',
        layer: 2,
        description: 'Procesa indicadores macroeconómicos y correlaciones entre datos OSINT y actividad en canales',
        capabilities: ['macro_analysis', 'trend_correlation', 'economic_indicator_tracking'],
        keywords: ['inflación', 'devaluación', 'recesión', 'default', 'bono', 'deuda', 'FMI', 'Banco Mundial'],
        sources: ['telegram', 'osint'],
      },
      // Layer 3: Monitoreo
      {
        id: 'eco-mon-thr',
        name: 'Financial Threshold Guard',
        layer: 3,
        description: 'Vigila umbrales financieros críticos: variaciones cambiarias bruscas, volúmenes de transacción anómalos',
        capabilities: ['threshold_monitoring', 'volatility_alerts', 'volume_anomaly_detection'],
        keywords: [],
        sources: ['osint'],
      },
      {
        id: 'eco-mon-san',
        name: 'Sanctions & Compliance Monitor',
        layer: 3,
        description: 'Monitorea listas de sanciones, compliance regulatorio y alertas de OFAC/ONU',
        capabilities: ['sanctions_screening', 'compliance_monitoring', 'watchlist_tracking'],
        keywords: ['OFAC', 'sanción', 'bloqueo', 'embargo', 'SDN', 'compliance'],
        sources: ['osint'],
      },
      // Layer 4: Reportes
      {
        id: 'eco-rep-fin',
        name: 'Financial Intel Reporter',
        layer: 4,
        description: 'Genera reportes de inteligencia financiera: perfiles de riesgo, análisis de tendencias y alertas económicas',
        capabilities: ['financial_report_generation', 'risk_profiling', 'trend_analysis_reporting'],
        keywords: [],
        sources: ['telegram', 'whatsapp', 'osint'],
      },
      {
        id: 'eco-rep-ale',
        name: 'Market Alert Dispatcher',
        layer: 4,
        description: 'Despacha alertas financieras priorizadas y notificaciones de mercado a canales de distribución',
        capabilities: ['alert_dispatch', 'market_notification', 'priority_routing'],
        keywords: [],
        sources: ['telegram', 'whatsapp'],
      },
    ],
    thresholds: [
      { id: 'eco-thr-1', name: 'Variación cambiaria > 5%', metric: 'fx_rate_change', condition: 'gte', value: 5, unit: '%', alertSeverity: 'ALTA', currentValue: 0, enabled: true },
      { id: 'eco-thr-2', name: 'Menciones fraude > 10/hora', metric: 'fraud_mentions_per_hour', condition: 'gte', value: 10, unit: 'menciones', alertSeverity: 'CRÍTICA', currentValue: 0, enabled: true },
      { id: 'eco-thr-3', name: 'Volumen crypto anómalo', metric: 'crypto_volume_deviation', condition: 'gte', value: 3, unit: 'desviaciones', alertSeverity: 'ALTA', currentValue: 0, enabled: true },
      { id: 'eco-thr-4', name: 'Movimiento portuario inusual', metric: 'ship_anomaly_count', condition: 'gte', value: 5, unit: 'eventos', alertSeverity: 'MEDIA', currentValue: 0, enabled: true },
    ],
  },

  // ===== MISSION 2: GEOPOLITICAL =====
  {
    id: 'geopolitical',
    name: 'Geopolítica, Seguridad, Historia y Conflictos',
    description: 'Análisis de conflictos armados, tensiones geopolíticas, movimientos militares, inteligencia de señal (SIGINT), y correlación histórica de eventos de seguridad.',
    icon: 'Shield',
    color: '#EF4444',
    gradient: 'from-red-500 to-orange-600',
    domains: ['geopolítica', 'conflictos', 'militar', 'SIGINT', 'historia', 'seguridad nacional', 'terrorismo', 'fronteras', 'alianzas'],
    agents: [
      // Layer 1: Ingesta
      {
        id: 'geo-ing-sig',
        name: 'SIGINT Collector',
        layer: 1,
        description: 'Captura inteligencia de señal: transponders militares, comunicaciones ADS-B, señales Meshtastic',
        capabilities: ['sigint_collection', 'military_transponder_tracking', 'signal_analysis'],
        keywords: ['militar', 'ejército', 'transponder', 'SQUAWK', 'NATO', 'fuerza aérea', 'base', 'operación'],
        sources: ['osint'],
        osintScraperIds: ['sigint', 'flights', 'uavs'],
      },
      {
        id: 'geo-ing-gde',
        name: 'GDELT Conflict Monitor',
        layer: 1,
        description: 'Ingesta eventos de conflicto del Global Database of Events, Language, and Tone',
        capabilities: ['conflict_event_ingestion', 'gdelt_processing', 'event_geolocation'],
        keywords: ['conflicto', 'guerra', 'ataque', 'bombardeo', 'invasión', 'protesta', 'golpe'],
        sources: ['osint'],
        osintScraperIds: ['gdelt', 'liveuamap'],
      },
      {
        id: 'geo-ing-cha',
        name: 'Channel Intelligence Harvester',
        layer: 1,
        description: 'Recolecta inteligencia de canales Telegram de seguridad, conflictos y análisis geopolítico',
        capabilities: ['channel_monitoring', 'message_extraction', 'source_verification'],
        keywords: ['inteligencia', 'operativo', 'seguridad', 'amenaza', 'atentado', 'crimen', 'narcotráfico'],
        sources: ['telegram', 'whatsapp'],
      },
      // Layer 2: Análisis
      {
        id: 'geo-ana-ter',
        name: 'Threat Correlation Engine',
        layer: 2,
        description: 'Correlaciona amenazas a través de SIGINT, GDELT y canales de comunicación para detectar escalation patterns',
        capabilities: ['threat_correlation', 'escalation_detection', 'multi_source_fusion'],
        keywords: ['escalada', 'amenaza', 'riesgo', 'conflicto', 'tensión', 'despliegue'],
        sources: ['telegram', 'whatsapp', 'osint'],
      },
      {
        id: 'geo-ana-his',
        name: 'Historical Pattern Matcher',
        layer: 2,
        description: 'Compara eventos actuales contra patrones históricos de conflictos para identificar ciclos y precedentes',
        capabilities: ['historical_pattern_matching', 'cycle_detection', 'precedent_analysis'],
        keywords: ['histórico', 'precedente', 'ciclo', 'patrón', 'repetición', 'analogía'],
        sources: ['osint'],
      },
      {
        id: 'geo-ana-geo',
        name: 'Geospatial Analyst',
        layer: 2,
        description: 'Analiza datos geoespaciales: movimientos de tropas, actividad en fronteras, despliegues navales',
        capabilities: ['geospatial_analysis', 'troop_movement_tracking', 'border_monitoring'],
        keywords: ['frontera', 'despliegue', 'base militar', 'zona', 'posición', 'avance'],
        sources: ['osint'],
        osintScraperIds: ['flights', 'ships', 'gps_jamming'],
      },
      // Layer 3: Monitoreo
      {
        id: 'geo-mon-mil',
        name: 'Military Activity Sentinel',
        layer: 3,
        description: 'Vigila actividad militar inusual: incremento de vuelos, movimientos navales, jamming GPS',
        capabilities: ['military_activity_monitoring', 'anomaly_detection', 'early_warning'],
        keywords: [],
        sources: ['osint'],
        osintScraperIds: ['flights', 'sigint', 'gps_jamming'],
      },
      {
        id: 'geo-mon-ala',
        name: 'Geopolitical Alert Engine',
        layer: 3,
        description: 'Motor de alertas geopolíticas con escalamiento automático basado en consenso multi-agente',
        capabilities: ['geopolitical_alerting', 'escalation_management', 'consensus_voting'],
        keywords: [],
        sources: ['telegram', 'whatsapp', 'osint'],
      },
      // Layer 4: Reportes
      {
        id: 'geo-rep-sit',
        name: 'SITREP Generator',
        layer: 4,
        description: 'Genera Situation Reports (SITREP) automatizados con análisis de amenazas y recomendaciones',
        capabilities: ['sitrep_generation', 'threat_assessment_reporting', 'recommendation_engine'],
        keywords: [],
        sources: ['telegram', 'whatsapp', 'osint'],
      },
      {
        id: 'geo-rep-int',
        name: 'Intelligence Brief Dispatcher',
        layer: 4,
        description: 'Distribuye briefs de inteligencia priorizados a canales de decisión',
        capabilities: ['intelligence_briefing', 'priority_dispatch', 'classification_handling'],
        keywords: [],
        sources: ['telegram'],
      },
    ],
    thresholds: [
      { id: 'geo-thr-1', name: 'Vuelos militares > 15', metric: 'military_flights_count', condition: 'gte', value: 15, unit: 'vuelos', alertSeverity: 'ALTA', currentValue: 0, enabled: true },
      { id: 'geo-thr-2', name: 'Eventos GDELT críticos > 5', metric: 'gdelt_critical_events', condition: 'gte', value: 5, unit: 'eventos', alertSeverity: 'CRÍTICA', currentValue: 0, enabled: true },
      { id: 'geo-thr-3', name: 'Zonas GPS jamming > 3', metric: 'gps_jamming_zones', condition: 'gte', value: 3, unit: 'zonas', alertSeverity: 'ALTA', currentValue: 0, enabled: true },
      { id: 'geo-thr-4', name: 'Menciones conflicto > 20/hora', metric: 'conflict_mentions_per_hour', condition: 'gte', value: 20, unit: 'menciones', alertSeverity: 'MEDIA', currentValue: 0, enabled: true },
    ],
  },

  // ===== MISSION 3: TECH (AI Focus) =====
  {
    id: 'tech',
    name: 'Ciencia, Tecnología e Innovación',
    description: 'Vigilancia tecnológica con enfoque especial en IA: avances en LLMs, investigación académica, ciberseguridad, brechas de datos, y tendencias de innovación emergentes.',
    icon: 'Cpu',
    color: '#8B5CF6',
    gradient: 'from-violet-500 to-purple-600',
    domains: ['inteligencia artificial', 'LLM', 'machine learning', 'ciberseguridad', 'brechas', 'innovación', 'startups', 'papers', 'investigación', 'datos abiertos'],
    agents: [
      // Layer 1: Ingesta
      {
        id: 'tech-ing-ai',
        name: 'AI Research Harvester',
        layer: 1,
        description: 'Captura avances en IA/ML desde canales especializados, repositorios y feeds académicos',
        capabilities: ['ai_paper_ingestion', 'model_release_tracking', 'benchmark_monitoring'],
        keywords: ['GPT', 'Claude', 'Gemini', 'LLM', 'transformer', 'fine-tuning', 'RAG', 'agents', 'AGI', 'reasoning', 'multimodal', 'diffusion'],
        sources: ['telegram', 'osint'],
      },
      {
        id: 'tech-ing-cyb',
        name: 'Cyber Threat Collector',
        layer: 1,
        description: 'Recolecta alertas de ciberseguridad: CVEs, brechas de datos, malware, APTs',
        capabilities: ['cve_monitoring', 'breach_detection', 'malware_intelligence'],
        keywords: ['CVE', 'breach', 'hack', 'malware', 'ransomware', 'phishing', 'zero-day', 'APT', 'vulnerabilidad'],
        sources: ['telegram', 'osint'],
      },
      {
        id: 'tech-ing-inn',
        name: 'Innovation Tracker',
        layer: 1,
        description: 'Rastrea tendencias de innovación, startups, financiación y disruptions tecnológicas',
        capabilities: ['startup_monitoring', 'funding_tracking', 'disruption_detection'],
        keywords: ['startup', 'funding', 'Series A', 'unicornio', 'disruption', 'pivot', 'MVP', 'product-market fit'],
        sources: ['telegram', 'whatsapp', 'osint'],
      },
      // Layer 2: Análisis
      {
        id: 'tech-ana-aim',
        name: 'AI Model Evaluator',
        layer: 2,
        description: 'Evalúa y compara modelos de IA: benchmarks, capacidades, limitaciones, riesgos',
        capabilities: ['model_evaluation', 'benchmark_comparison', 'risk_assessment'],
        keywords: ['benchmark', 'MMLU', 'HumanEval', 'alignment', 'safety', 'hallucination', 'RLHF'],
        sources: ['telegram', 'osint'],
      },
      {
        id: 'tech-ana-cyb',
        name: 'Cyber Threat Analyzer',
        layer: 2,
        description: 'Analiza amenazas cibernéticas: correlación de CVEs, cadenas de ataque, vectores de intrusión',
        capabilities: ['threat_intelligence_analysis', 'attack_chain_correlation', 'vector_analysis'],
        keywords: ['exploit', 'payload', 'C2', 'lateral movement', 'privilege escalation', 'exfiltration'],
        sources: ['osint'],
      },
      {
        id: 'tech-ana-tre',
        name: 'Tech Trend Predictor',
        layer: 2,
        description: 'Predice tendencias tecnológicas basándose en señales tempranas de adopción e inversión',
        capabilities: ['trend_prediction', 'signal_detection', 'adoption_curve_analysis'],
        keywords: ['hype cycle', 'adoption', 'paradigm shift', 'inflection point', 'tipping point'],
        sources: ['telegram', 'whatsapp', 'osint'],
      },
      // Layer 3: Monitoreo
      {
        id: 'tech-mon-cve',
        name: 'CVE Critical Watcher',
        layer: 3,
        description: 'Vigila CVEs críticos (CVSS > 9.0) y brechas de datos masivas en tiempo real',
        capabilities: ['critical_cve_monitoring', 'breach_alert_generation', 'exposure_assessment'],
        keywords: [],
        sources: ['osint'],
      },
      {
        id: 'tech-mon-ai',
        name: 'AI Safety Monitor',
        layer: 3,
        description: 'Monitorea riesgos de seguridad en IA: jailbreaks, prompts maliciosos, deepfakes, alucinaciones peligrosas',
        capabilities: ['ai_safety_monitoring', 'jailbreak_detection', 'deepfake_alerting'],
        keywords: ['jailbreak', 'prompt injection', 'deepfake', 'hallucination', 'misinformation'],
        sources: ['telegram', 'whatsapp', 'osint'],
      },
      // Layer 4: Reportes
      {
        id: 'tech-rep-cib',
        name: 'Cyber Intel Reporter',
        layer: 4,
        description: 'Genera reportes de inteligencia cibernética: threat landscape, brechas relevantes, recomendaciones',
        capabilities: ['cyber_intel_reporting', 'threat_landscape_analysis', 'remediation_guidance'],
        keywords: [],
        sources: ['osint'],
      },
      {
        id: 'tech-rep-ai',
        name: 'AI Landscape Reporter',
        layer: 4,
        description: 'Genera reportes del ecosistema AI: nuevos modelos, capacidades, comparativas, riesgos emergentes',
        capabilities: ['ai_landscape_reporting', 'model_comparison_reporting', 'risk_briefing'],
        keywords: [],
        sources: ['telegram', 'osint'],
      },
    ],
    thresholds: [
      { id: 'tech-thr-1', name: 'CVE Crítico (CVSS ≥ 9.0)', metric: 'critical_cve_count', condition: 'gte', value: 1, unit: 'CVEs', alertSeverity: 'CRÍTICA', currentValue: 0, enabled: true },
      { id: 'tech-thr-2', name: 'Menciones AI safety > 8/hora', metric: 'ai_safety_mentions', condition: 'gte', value: 8, unit: 'menciones', alertSeverity: 'ALTA', currentValue: 0, enabled: true },
      { id: 'tech-thr-3', name: 'Nuevos LLM releases > 3/día', metric: 'llm_releases_per_day', condition: 'gte', value: 3, unit: 'releases', alertSeverity: 'MEDIA', currentValue: 0, enabled: true },
      { id: 'tech-thr-4', name: 'Brechas datos > 100K registros', metric: 'data_breach_records', condition: 'gte', value: 100000, unit: 'registros', alertSeverity: 'CRÍTICA', currentValue: 0, enabled: true },
    ],
  },

  // ===== MISSION 4: RISK =====
  {
    id: 'risk',
    name: 'Gestión de Riesgo Personal, Geográfico y Empresarial',
    description: 'Evaluación integral de riesgos: amenazas naturales (sismos, incendios, clima), riesgos geográficos, seguridad personal y empresarial, y gestión de crisis.',
    icon: 'AlertTriangle',
    color: '#F59E0B',
    gradient: 'from-amber-500 to-orange-600',
    domains: ['riesgo natural', 'sismos', 'incendios', 'clima', 'gestión de crisis', 'seguridad personal', 'riesgo empresarial', 'continuidad', 'evacuación'],
    agents: [
      // Layer 1: Ingesta
      {
        id: 'risk-ing-sei',
        name: 'Seismic Monitor',
        layer: 1,
        description: 'Captura datos sísmicos en tiempo real desde USGS: magnitud, ubicación, profundidad, alertas tempranas',
        capabilities: ['earthquake_monitoring', 'seismic_alert_ingestion', 'tsunami_warning'],
        keywords: ['sismo', 'terremoto', 'magnitud', 'réplica', 'epicentro', 'escala Richter', 'tsunami'],
        sources: ['osint'],
        osintScraperIds: ['earthquakes'],
      },
      {
        id: 'risk-ing-fir',
        name: 'Fire & Thermal Anomaly Detector',
        layer: 1,
        description: 'Detecta incendios activos y anomalías térmicas via NASA FIRMS (VIIRS/MODIS)',
        capabilities: ['fire_detection', 'thermal_anomaly_monitoring', 'burn_area_assessment'],
        keywords: ['incendio', 'fuego', 'quema', 'forestal', 'thermal', 'hotspot'],
        sources: ['osint'],
        osintScraperIds: ['fires'],
      },
      {
        id: 'risk-ing-wea',
        name: 'Weather Alert Collector',
        layer: 1,
        description: 'Recolecta alertas meteorológicas severas: huracanes, tormentas, inundaciones, temperaturas extremas',
        capabilities: ['weather_alert_ingestion', 'severe_weather_monitoring', 'flood_tracking'],
        keywords: ['huracán', 'tormenta', 'inundación', 'lluvia', 'temperatura', 'alerta', 'ciclón'],
        sources: ['osint'],
        osintScraperIds: ['weather'],
      },
      {
        id: 'risk-ing-per',
        name: 'Personal Security Harvester',
        layer: 1,
        description: 'Recolecta datos de seguridad personal desde canales: crímenes, incidentes, zonas de riesgo',
        capabilities: ['crime_data_ingestion', 'incident_monitoring', 'risk_zone_mapping'],
        keywords: ['crimen', 'robo', 'secuestro', 'extorsión', 'homicidio', 'zona roja', 'alerta'],
        sources: ['telegram', 'whatsapp'],
      },
      // Layer 2: Análisis
      {
        id: 'risk-ana-nat',
        name: 'Natural Risk Assessor',
        layer: 2,
        description: 'Evalúa riesgos naturales combinando datos sísmicos, climáticos y de incendios con modelos de vulnerabilidad',
        capabilities: ['natural_risk_assessment', 'vulnerability_modeling', 'impact_prediction'],
        keywords: ['vulnerabilidad', 'exposición', 'amenaza', 'capacidad', 'resiliencia'],
        sources: ['osint'],
      },
      {
        id: 'risk-ana-bus',
        name: 'Business Risk Analyzer',
        layer: 2,
        description: 'Analiza riesgos empresariales: continuidad operativa, amenazas a instalaciones, riesgos regulatorios',
        capabilities: ['business_risk_analysis', 'continuity_assessment', 'regulatory_risk_monitoring'],
        keywords: ['continuidad', 'operaciones', 'instalaciones', 'regulatorio', 'compliance', 'BCP'],
        sources: ['telegram', 'whatsapp', 'osint'],
      },
      {
        id: 'risk-ana-geo',
        name: 'Geographic Risk Mapper',
        layer: 2,
        description: 'Mapea riesgos geográficos: zonas de inundación, fallas geológicas, rutas de evacuación',
        capabilities: ['geographic_risk_mapping', 'evacuation_route_analysis', 'hazard_zone_identification'],
        keywords: ['falla', 'inundación', 'zona', 'evacuación', 'refugio', 'ruta'],
        sources: ['osint'],
      },
      // Layer 3: Monitoreo
      {
        id: 'risk-mon-eve',
        name: 'Event Severity Evaluator',
        layer: 3,
        description: 'Evalúa severidad de eventos en tiempo real y genera alertas con umbrales específicos por región',
        capabilities: ['event_severity_evaluation', 'regional_threshold_monitoring', 'real_time_alerting'],
        keywords: [],
        sources: ['osint'],
      },
      {
        id: 'risk-mon-cri',
        name: 'Crisis Management Sentinel',
        layer: 3,
        description: 'Centinela de gestión de crisis: detecta escalamiento de eventos y activa protocolos de respuesta',
        capabilities: ['crisis_detection', 'escalation_monitoring', 'response_protocol_activation'],
        keywords: ['crisis', 'emergencia', 'protocolo', 'respuesta', 'contingencia'],
        sources: ['telegram', 'whatsapp', 'osint'],
      },
      // Layer 4: Reportes
      {
        id: 'risk-rep-ris',
        name: 'Risk Dashboard Generator',
        layer: 4,
        description: 'Genera dashboards de riesgo: mapas de calor, indicadores por zona, tendencias de amenaza',
        capabilities: ['risk_dashboard_generation', 'heatmap_creation', 'trend_visualization'],
        keywords: [],
        sources: ['osint'],
      },
      {
        id: 'risk-rep-cri',
        name: 'Crisis Brief Producer',
        layer: 4,
        description: 'Produce briefs de crisis con recomendaciones accionables para toma de decisiones',
        capabilities: ['crisis_brief_production', 'actionable_recommendations', 'decision_support'],
        keywords: [],
        sources: ['telegram', 'whatsapp', 'osint'],
      },
    ],
    thresholds: [
      { id: 'risk-thr-1', name: 'Sismo magnitud > 5.0', metric: 'earthquake_magnitude', condition: 'gte', value: 5, unit: 'Mw', alertSeverity: 'CRÍTICA', currentValue: 0, enabled: true },
      { id: 'risk-thr-2', name: 'Incendios activos > 50', metric: 'active_fires_count', condition: 'gte', value: 50, unit: 'focos', alertSeverity: 'ALTA', currentValue: 0, enabled: true },
      { id: 'risk-thr-3', name: 'Alertas clima severo > 3', metric: 'severe_weather_alerts', condition: 'gte', value: 3, unit: 'alertas', alertSeverity: 'ALTA', currentValue: 0, enabled: true },
      { id: 'risk-thr-4', name: 'Menciones crimen > 15/hora', metric: 'crime_mentions_per_hour', condition: 'gte', value: 15, unit: 'menciones', alertSeverity: 'MEDIA', currentValue: 0, enabled: true },
    ],
  },
];

// ===== MISSION REGISTRY =====

class MissionRegistry {
  private missions: Map<MissionId, MissionGroup> = new Map();

  register(mission: MissionGroup): void {
    this.missions.set(mission.id, mission);
  }

  get(id: MissionId): MissionGroup | undefined {
    return this.missions.get(id);
  }

  getAll(): MissionGroup[] {
    return Array.from(this.missions.values());
  }

  getAgentsByLayer(missionId: MissionId, layer: number): MissionAgent[] {
    const mission = this.missions.get(missionId);
    if (!mission) return [];
    return mission.agents.filter(a => a.layer === layer);
  }

  getAgentsBySource(source: MessageSource): MissionAgent[] {
    return Array.from(this.missions.values())
      .flatMap(m => m.agents)
      .filter(a => a.sources.includes(source));
  }

  /**
   * Find which missions are relevant for a given message content
   * based on keyword matching
   */
  matchMissions(content: string): MissionId[] {
    const lower = content.toLowerCase();
    const matched: MissionId[] = [];

    for (const mission of this.missions.values()) {
      const allKeywords = mission.agents.flatMap(a => a.keywords);
      const matchCount = allKeywords.filter(kw => lower.includes(kw.toLowerCase())).length;
      if (matchCount >= 2) {
        matched.push(mission.id);
      }
    }

    return matched;
  }

  /**
   * Find cross-mission correlations from OSINT data
   */
  findCrossMissionCorrelations(osintData: OsintSnapshot): CrossMissionCorrelation[] {
    const correlations: CrossMissionCorrelation[] = [];

    // Earthquake + Geopolitical: earthquakes in conflict zones
    if (osintData.earthquakes && osintData.earthquakes.length > 0) {
      const bigQuakes = osintData.earthquakes.filter(e => e.magnitude >= 5.0);
      if (bigQuakes.length > 0) {
        correlations.push({
          id: `xcorr-geo-risk-quakes-${Date.now()}`,
          missionIds: ['geopolitical', 'risk'],
          entityType: 'event',
          entityName: 'Sismos en zonas de conflicto',
          confidence: 60,
          description: `${bigQuakes.length} sismos significativos detectados — posible intersección con zonas de interés geopolítico`,
          timestamp: new Date().toISOString(),
        });
      }
    }

    // Military flights + Economic: military escalation affects markets
    if (osintData.flights && osintData.flights.length > 0) {
      const militaryFlights = osintData.flights.filter(f => f.type === 'military');
      if (militaryFlights.length >= 5) {
        correlations.push({
          id: `xcorr-eco-geo-mil-${Date.now()}`,
          missionIds: ['economic', 'geopolitical'],
          entityType: 'event',
          entityName: 'Escalada militar con impacto económico',
          confidence: 55,
          description: `${militaryFlights.length} vuelos militares detectados — potencial impacto en mercados y cadenas de suministro`,
          timestamp: new Date().toISOString(),
        });
      }
    }

    // Fires + Risk: large fire events
    if (osintData.fires && osintData.fires.length > 50) {
      correlations.push({
        id: `xcorr-risk-tech-fires-${Date.now()}`,
        missionIds: ['risk', 'tech'],
        entityType: 'event',
        entityName: 'Incendios masivos con impacto en infraestructura tecnológica',
        confidence: 45,
        description: `${osintData.fires.length} focos de incendio activos — riesgo potencial para infraestructura de datos y centros de cómputo`,
        timestamp: new Date().toISOString(),
      });
    }

    // News + All missions: cross-cutting intelligence
    if (osintData.news && osintData.news.length > 0) {
      const techNews = osintData.news.filter(n =>
        n.category?.toLowerCase().includes('tech') || n.category?.toLowerCase().includes('ai')
      );
      if (techNews.length > 0) {
        correlations.push({
          id: `xcorr-tech-news-${Date.now()}`,
          missionIds: ['tech', 'economic'],
          entityType: 'trend',
          entityName: 'Noticias tecnológicas con impacto económico',
          confidence: 40,
          description: `${techNews.length} noticias tech/econ detectadas — seguimiento de impacto en mercados y adopción`,
          timestamp: new Date().toISOString(),
        });
      }
    }

    return correlations;
  }
}

export const missionRegistry = new MissionRegistry();

// ===== INITIALIZE REGISTRY =====

/**
 * Build initial mission groups from definitions with computed stats.
 * Called from API route or store initialization.
 */
export function buildMissionGroups(
  serviceStatus?: Record<string, boolean>,
  osintData?: OsintSnapshot
): MissionGroup[] {
  return MISSION_DEFINITIONS.map(def => {
    // Compute agent health/status from service availability
    const agents: MissionAgent[] = def.agents.map(agent => {
      let status: MissionAgent['status'] = 'inactive';
      let health = 0;
      let messagesProcessed = 0;

      // Determine status from service checks
      if (agent.sources.includes('osint') && serviceStatus?.osint) {
        status = 'active';
        health = 85;
        messagesProcessed = Math.floor(Math.random() * 500) + 100;
      }
      if (agent.sources.includes('telegram') && serviceStatus?.telegram) {
        status = 'active';
        health = Math.max(health, 80);
        messagesProcessed += Math.floor(Math.random() * 300) + 50;
      }
      if (agent.sources.includes('whatsapp') && serviceStatus?.whatsapp) {
        status = status === 'active' ? 'active' : 'warning';
        health = Math.max(health, 40);
        messagesProcessed += Math.floor(Math.random() * 100);
      }

      // Update threshold current values from OSINT data
      const threshold = def.thresholds.find(t => t.id.includes(agent.id.split('-').slice(0, 2).join('')));
      if (threshold && osintData) {
        // This is a simplified update; real system would compute from data
      }

      const now = new Date();
      return {
        ...agent,
        missionId: def.id,
        layerName: agent.layer === 1 ? 'Ingesta' : agent.layer === 2 ? 'Análisis' : agent.layer === 3 ? 'Monitoreo' : 'Reportes',
        status,
        health,
        messagesProcessed,
        lastHeartbeat: status === 'active' ? now.toISOString() : '',
        uptime: status === 'active' ? '0d 0h' : '0d 0h',
      };
    });

    // Compute data flow for each layer
    const dataFlow: MissionDataFlowNode[] = [1, 2, 3, 4].map(layer => {
      const layerAgents = agents.filter(a => a.layer === layer);
      const activeCount = layerAgents.filter(a => a.status === 'active').length;
      return {
        layer,
        layerName: layer === 1 ? 'Ingesta' : layer === 2 ? 'Análisis' : layer === 3 ? 'Monitoreo' : 'Reportes',
        agentCount: layerAgents.length,
        messagesIn: layerAgents.reduce((s, a) => s + a.messagesProcessed, 0),
        messagesOut: layer < 4 ? layerAgents.reduce((s, a) => s + Math.floor(a.messagesProcessed * 0.7), 0) : 0,
        alertsGenerated: layer >= 3 ? layerAgents.reduce((s, a) => s + Math.floor(a.messagesProcessed * 0.1), 0) : 0,
        status: activeCount === layerAgents.length ? 'active' : activeCount > 0 ? 'degraded' : 'inactive',
      };
    });

    // Compute stats
    const activeAgents = agents.filter(a => a.status === 'active').length;
    const healthAvg = agents.length > 0 ? Math.round(agents.reduce((s, a) => s + a.health, 0) / agents.length) : 0;
    const threatScore = Math.min(100, Math.max(0,
      def.thresholds.reduce((s, t) => s + (t.currentValue / t.value) * 25, 0)
    ));

    return {
      id: def.id,
      name: def.name,
      description: def.description,
      icon: def.icon,
      color: def.color,
      gradient: def.gradient,
      agents,
      thresholds: def.thresholds,
      alerts: [],
      stats: {
        totalAgents: agents.length,
        activeAgents,
        messagesProcessed: agents.reduce((s, a) => s + a.messagesProcessed, 0),
        activeAlerts: 0,
        healthAvg,
        threatScore,
      },
      domains: def.domains,
      dataFlow,
    };
  });
}

/**
 * Update mission groups with live OSINT data — computes real threshold values
 */
export function updateMissionsWithOsint(
  missions: MissionGroup[],
  osintData: OsintSnapshot
): MissionGroup[] {
  return missions.map(mission => {
    const updatedThresholds = mission.thresholds.map(threshold => {
      let currentValue = threshold.currentValue;

      switch (threshold.metric) {
        case 'military_flights_count':
          currentValue = osintData.flights?.filter(f => f.type === 'military').length ?? 0;
          break;
        case 'gdelt_critical_events':
          currentValue = osintData.gdelt?.length ?? 0;
          break;
        case 'gps_jamming_zones':
          // Derived from sigint
          currentValue = 0;
          break;
        case 'earthquake_magnitude':
          currentValue = osintData.earthquakes?.length ?? 0 > 0
            ? Math.max(...(osintData.earthquakes?.map(e => e.magnitude) ?? [0]))
            : 0;
          break;
        case 'active_fires_count':
          currentValue = osintData.fires?.length ?? 0;
          break;
        case 'severe_weather_alerts':
          currentValue = osintData.weather?.activeAlerts ?? 0;
          break;
        case 'critical_cve_count':
          // Would need dedicated CVE feed
          currentValue = 0;
          break;
        default:
          break;
      }

      return { ...threshold, currentValue };
    });

    // Recompute threat score
    const threatScore = Math.min(100, Math.max(0,
      updatedThresholds.reduce((s, t) => {
        if (!t.enabled) return s;
        return s + Math.min(25, (t.currentValue / t.value) * 25);
      }, 0)
    ));

    // Generate mission alerts from triggered thresholds
    const newAlerts: MissionAlert[] = updatedThresholds
      .filter(t => t.enabled && t.currentValue >= t.value)
      .map(t => ({
        id: `mission-alert-${mission.id}-${t.id}-${Date.now()}`,
        missionId: mission.id,
        title: `Umbral superado: ${t.name}`,
        description: `Métrica "${t.metric}" = ${t.currentValue} ${t.unit} (umbral: ${t.value} ${t.unit})`,
        severity: t.alertSeverity,
        strategy: 'threshold' as DecisionStrategy,
        timestamp: new Date().toISOString(),
        acknowledged: false,
      }));

    // Update data flow with real counts
    const dataFlow = mission.dataFlow.map(node => ({
      ...node,
      alertsGenerated: node.layer >= 3 ? newAlerts.length : 0,
      status: (mission.agents.filter(a => a.layer === node.layer && a.status === 'active').length > 0
        ? 'active' : 'inactive') as MissionDataFlowNode['status'],
    }));

    return {
      ...mission,
      thresholds: updatedThresholds,
      alerts: [...mission.alerts, ...newAlerts].slice(-20), // Keep last 20
      stats: {
        ...mission.stats,
        threatScore,
        activeAlerts: newAlerts.length,
      },
      dataFlow,
    };
  });
}

export { MISSION_DEFINITIONS };
