export interface Contact {
  id: string;
  name: string;
  phone: string;
  email?: string;
  avatar?: string;
  tags?: string[];
  lastSeen?: string;
}

export interface Message {
  id: string;
  conversationId: string;
  from: string;
  text: string;
  timestamp: string;
  type: "incoming" | "outgoing";
  status?: "sent" | "delivered" | "read";
}

export interface Conversation {
  id: string;
  contactId: string;
  contactName: string;
  lastMessage: string;
  lastMessageTime: string;
  unreadCount: number;
  status: "active" | "resolved" | "pending";
  assignedTo?: string;
}

export interface Template {
  id: string;
  name: string;
  category: "marketing" | "utility" | "authentication";
  status: "approved" | "pending" | "rejected";
  language: string;
  body: string;
  createdAt: string;
}

export interface Campaign {
  id: string;
  name: string;
  status: "draft" | "scheduled" | "running" | "completed" | "paused";
  templateId: string;
  templateName: string;
  totalRecipients: number;
  sent: number;
  delivered: number;
  read: number;
  replied: number;
  scheduledAt?: string;
  createdAt: string;
}

export interface ChatbotFlow {
  id: string;
  name: string;
  status: "active" | "inactive" | "draft";
  triggerKeyword: string;
  nodes: number;
  lastModified: string;
}

// ==================== MULTI-AGENT TYPES ====================

export type AgentStatus = 'active' | 'inactive' | 'warning' | 'error';
export type AlertSeverity = 'CRÍTICA' | 'ALTA' | 'MEDIA' | 'BAJA' | 'INFO';
export type ReportType = 'diario' | 'semanal' | 'mensual';
export type ReportStatus = 'generando' | 'completado' | 'programado' | 'error';

export interface Agent {
  id: string;
  name: string;
  layer: number;
  layerName: string;
  status: AgentStatus;
  health: number; // 0-100
  messagesProcessed: number;
  lastHeartbeat: string;
  uptime: string;
  description: string;
}

export interface AgentLayer {
  id: number;
  name: string;
  description: string;
  agents: Agent[];
  color: string;
  icon: string;
}

export interface EventBusEvent {
  id: string;
  source: string;
  target: string;
  type: string;
  timestamp: string;
  data: string;
}

export interface Alert {
  id: string;
  timestamp: string;
  source: string;
  severity: AlertSeverity;
  title: string;
  description: string;
  actionTaken: string;
  acknowledged: boolean;
  expanded?: boolean;
}

export interface ThresholdConfig {
  id: string;
  name: string;
  condition: string;
  value: number;
  unit: string;
  alertSeverity: AlertSeverity;
  alertType: string;
  current: number;
  maxValue: number;
}

export interface PatternConfig {
  id: string;
  name: string;
  severity: AlertSeverity;
  description: string;
  sequence: string[];
  detectionRate: number;
  lastDetected: string;
  occurrences: number;
}

export interface RiskDimension {
  id: string;
  name: string;
  weight: number;
  description: string;
  color: string;
}

export interface ConsensusVote {
  agentId: string;
  agentName: string;
  vote: 'favor' | 'contra' | 'abstencion';
  confidence: number;
  reasoning: string;
}

export interface PredictionData {
  hour: string;
  activity: number;
  confidence: number;
}

export interface AdaptiveHistory {
  date: string;
  falsePositiveRate: number;
  sensitivity: number;
  accuracy: number;
}

export interface Report {
  id: string;
  title: string;
  date: string;
  type: ReportType;
  status: ReportStatus;
  pages: number;
  sections: string[];
  downloadUrl?: string;
}

export interface ReportTemplate {
  id: string;
  name: string;
  type: ReportType;
  description: string;
  sections: string[];
  schedule?: string;
}

// ==================== EXISTING MOCK DATA ====================

export const mockContacts: Contact[] = [
  { id: "c1", name: "Sarah Johnson", phone: "+1 (555) 123-4567", email: "sarah.j@example.com", tags: ["VIP", "Customer"], lastSeen: "2 min ago" },
  { id: "c2", name: "Michael Chen", phone: "+1 (555) 234-5678", email: "m.chen@example.com", tags: ["Lead"], lastSeen: "15 min ago" },
  { id: "c3", name: "Emily Rodriguez", phone: "+1 (555) 345-6789", email: "emily.r@example.com", tags: ["Customer", "Enterprise"], lastSeen: "1 hour ago" },
  { id: "c4", name: "James Wilson", phone: "+1 (555) 456-7890", email: "j.wilson@example.com", tags: ["Lead"], lastSeen: "3 hours ago" },
  { id: "c5", name: "Priya Patel", phone: "+1 (555) 567-8901", email: "priya.p@example.com", tags: ["Customer", "VIP"], lastSeen: "Online" },
  { id: "c6", name: "David Kim", phone: "+1 (555) 678-9012", email: "d.kim@example.com", tags: ["Prospect"], lastSeen: "Yesterday" },
];

export const mockMessages: Record<string, Message[]> = {
  conv1: [
    { id: "m1", conversationId: "conv1", from: "c1", text: "Hi! I'm interested in your enterprise plan. Can you tell me more about the pricing?", timestamp: "10:30 AM", type: "incoming" },
    { id: "m2", conversationId: "conv1", from: "agent", text: "Hello Sarah! Great to hear from you. Our Enterprise plan starts at $299/month with unlimited conversations, 10 WhatsApp numbers, and priority support.", timestamp: "10:31 AM", type: "outgoing", status: "read" },
    { id: "m3", conversationId: "conv1", from: "c1", text: "That sounds good! Do you offer any discounts for annual billing?", timestamp: "10:33 AM", type: "incoming" },
    { id: "m4", conversationId: "conv1", from: "agent", text: "Absolutely! We offer a 20% discount for annual subscriptions. That brings it down to $287/month billed annually.", timestamp: "10:34 AM", type: "outgoing", status: "delivered" },
    { id: "m5", conversationId: "conv1", from: "c1", text: "Perfect! Can we schedule a demo this week?", timestamp: "10:36 AM", type: "incoming" },
    { id: "m6", conversationId: "conv1", from: "agent", text: "Of course! I'll have our team reach out to schedule a demo. Would Thursday at 2 PM work for you?", timestamp: "10:37 AM", type: "outgoing", status: "sent" },
  ],
  conv2: [
    { id: "m7", conversationId: "conv2", from: "c2", text: "Hey, I've been trying to set up the webhook integration but I'm getting a 403 error.", timestamp: "9:15 AM", type: "incoming" },
    { id: "m8", conversationId: "conv2", from: "agent", text: "Hi Michael! Let me help you with that. Can you share the webhook URL you're trying to configure?", timestamp: "9:16 AM", type: "outgoing", status: "read" },
    { id: "m9", conversationId: "conv2", from: "c2", text: "Sure, it's https://api.myapp.com/webhooks/whatomate", timestamp: "9:18 AM", type: "incoming" },
    { id: "m10", conversationId: "conv2", from: "agent", text: "I see the issue. You need to whitelist the webhook URL in your account settings first. Let me send you a guide.", timestamp: "9:20 AM", type: "outgoing", status: "read" },
  ],
  conv3: [
    { id: "m11", conversationId: "conv3", from: "c3", text: "Hello, when will the new chatbot feature be available?", timestamp: "Yesterday", type: "incoming" },
    { id: "m12", conversationId: "conv3", from: "agent", text: "Hi Emily! The AI chatbot feature is currently in beta. Would you like to join the beta program?", timestamp: "Yesterday", type: "outgoing", status: "read" },
    { id: "m13", conversationId: "conv3", from: "c3", text: "Yes, that would be great! How do I sign up?", timestamp: "Yesterday", type: "incoming" },
  ],
  conv4: [
    { id: "m14", conversationId: "conv4", from: "c4", text: "I need help with the template approval process.", timestamp: "8:45 AM", type: "incoming" },
    { id: "m15", conversationId: "conv4", from: "agent", text: "Sure! What status does your template show? Is it pending or rejected?", timestamp: "8:46 AM", type: "outgoing", status: "delivered" },
  ],
  conv5: [
    { id: "m16", conversationId: "conv5", from: "c5", text: "Thank you for the quick response! The issue is resolved now.", timestamp: "11:00 AM", type: "incoming" },
    { id: "m17", conversationId: "conv5", from: "agent", text: "Great to hear that, Priya! Don't hesitate to reach out if you need anything else.", timestamp: "11:01 AM", type: "outgoing", status: "read" },
  ],
};

export const mockConversations: Conversation[] = [
  { id: "conv1", contactId: "c1", contactName: "Sarah Johnson", lastMessage: "Can we schedule a demo this week?", lastMessageTime: "10:36 AM", unreadCount: 1, status: "active", assignedTo: "You" },
  { id: "conv2", contactId: "c2", contactName: "Michael Chen", lastMessage: "Sure, it's https://api.myapp.com/webhooks/whatomate", lastMessageTime: "9:18 AM", unreadCount: 0, status: "active", assignedTo: "You" },
  { id: "conv3", contactId: "c3", contactName: "Emily Rodriguez", lastMessage: "Yes, that would be great! How do I sign up?", lastMessageTime: "Yesterday", unreadCount: 2, status: "pending" },
  { id: "conv4", contactId: "c4", contactName: "James Wilson", lastMessage: "I need help with the template approval process.", lastMessageTime: "8:45 AM", unreadCount: 1, status: "active" },
  { id: "conv5", contactId: "c5", contactName: "Priya Patel", lastMessage: "Thank you for the quick response!", lastMessageTime: "11:00 AM", unreadCount: 0, status: "resolved", assignedTo: "You" },
];

export const mockTemplates: Template[] = [
  { id: "t1", name: "welcome_message", category: "utility", status: "approved", language: "en", body: "Welcome to {{1}}! We're excited to have you. How can we help you today?", createdAt: "2024-01-15" },
  { id: "t2", name: "order_confirmation", category: "utility", status: "approved", language: "en", body: "Your order #{{1}} has been confirmed! Estimated delivery: {{2}}. Track your order at {{3}}.", createdAt: "2024-01-20" },
  { id: "t3", name: "promo_offer", category: "marketing", status: "approved", language: "en", body: "Special offer! Get {{1}}% off on all products. Use code {{2}} at checkout. Valid until {{3}}!", createdAt: "2024-02-01" },
  { id: "t4", name: "appointment_reminder", category: "utility", status: "pending", language: "en", body: "Reminder: You have an appointment with {{1}} on {{2}} at {{3}}. Reply YES to confirm or NO to reschedule.", createdAt: "2024-02-10" },
  { id: "t5", name: "feedback_request", category: "marketing", status: "approved", language: "en", body: "Hi {{1}}! How was your experience with {{2}}? We'd love your feedback: {{3}}", createdAt: "2024-02-15" },
  { id: "t6", name: "otp_verification", category: "authentication", status: "approved", language: "en", body: "Your verification code is {{1}}. This code expires in {{2}} minutes. Do not share this code.", createdAt: "2024-02-20" },
];

export const mockCampaigns: Campaign[] = [
  { id: "camp1", name: "Spring Sale 2024", status: "completed", templateId: "t3", templateName: "promo_offer", totalRecipients: 1250, sent: 1250, delivered: 1180, read: 890, replied: 234, createdAt: "2024-02-01" },
  { id: "camp2", name: "New Feature Announcement", status: "running", templateId: "t1", templateName: "welcome_message", totalRecipients: 3200, sent: 2100, delivered: 1950, read: 1200, replied: 156, createdAt: "2024-02-15" },
  { id: "camp3", name: "Customer Feedback Drive", status: "scheduled", templateId: "t5", templateName: "feedback_request", totalRecipients: 800, sent: 0, delivered: 0, read: 0, replied: 0, scheduledAt: "2024-03-01T10:00:00", createdAt: "2024-02-20" },
  { id: "camp4", name: "Product Launch Notification", status: "draft", templateId: "t2", templateName: "order_confirmation", totalRecipients: 0, sent: 0, delivered: 0, read: 0, replied: 0, createdAt: "2024-02-25" },
  { id: "camp5", name: "Flash Sale Weekend", status: "paused", templateId: "t3", templateName: "promo_offer", totalRecipients: 5000, sent: 2300, delivered: 2100, read: 1500, replied: 345, createdAt: "2024-02-22" },
];

export const mockChatbotFlows: ChatbotFlow[] = [
  { id: "flow1", name: "Customer Support Bot", status: "active", triggerKeyword: "help", nodes: 8, lastModified: "2024-02-20" },
  { id: "flow2", name: "Sales Qualification", status: "active", triggerKeyword: "pricing", nodes: 12, lastModified: "2024-02-18" },
  { id: "flow3", name: "Order Tracking", status: "active", triggerKeyword: "track", nodes: 6, lastModified: "2024-02-15" },
  { id: "flow4", name: "Appointment Booking", status: "inactive", triggerKeyword: "book", nodes: 10, lastModified: "2024-02-10" },
  { id: "flow5", name: "Feedback Collector", status: "draft", triggerKeyword: "feedback", nodes: 4, lastModified: "2024-02-25" },
];

export const mockDashboardStats = {
  totalContacts: 2847,
  activeConversations: 156,
  messagesSent: 12893,
  templates: 24,
  contactGrowth: 12.5,
  conversationGrowth: -3.2,
  messageGrowth: 8.7,
  templateGrowth: 4.2,
};

export const mockWeeklyAnalytics = [
  { day: "Mon", sent: 245, received: 189 },
  { day: "Tue", sent: 312, received: 267 },
  { day: "Wed", sent: 289, received: 234 },
  { day: "Thu", sent: 356, received: 298 },
  { day: "Fri", sent: 398, received: 345 },
  { day: "Sat", sent: 178, received: 156 },
  { day: "Sun", sent: 134, received: 112 },
];

export const mockMonthlyAnalytics = [
  { month: "Sep", conversations: 320, messages: 4500 },
  { month: "Oct", conversations: 380, messages: 5200 },
  { month: "Nov", conversations: 410, messages: 5800 },
  { month: "Dec", conversations: 490, messages: 6100 },
  { month: "Jan", conversations: 450, messages: 5600 },
  { month: "Feb", conversations: 520, messages: 6400 },
];

// ==================== MULTI-AGENT MOCK DATA ====================

export const mockAgentLayers: AgentLayer[] = [
  {
    id: 1,
    name: 'Ingesta',
    description: 'Captura y recolección de datos de múltiples fuentes en tiempo real',
    color: '#10B981',
    icon: 'Download',
    agents: [
      { id: 'ing-wa', name: 'WhatsApp Bridge', layer: 1, layerName: 'Ingesta', status: 'active', health: 98, messagesProcessed: 45230, lastHeartbeat: 'Hace 2s', uptime: '45d 12h', description: 'Conector Baileys para WhatsApp - monitoreo de 195 grupos' },
      { id: 'ing-tg', name: 'Telethon (Telegram)', layer: 1, layerName: 'Ingesta', status: 'active', health: 95, messagesProcessed: 1283400, lastHeartbeat: 'Hace 1s', uptime: '45d 12h', description: 'Conector Telegram - monitoreo de canales con 16.3M+ miembros' },
      { id: 'ing-os', name: 'OSINT Shadowbroker', layer: 1, layerName: 'Ingesta', status: 'active', health: 87, messagesProcessed: 89420, lastHeartbeat: 'Hace 5s', uptime: '30d 8h', description: 'Motor OSINT - 6 fuentes de inteligencia activas' },
    ],
  },
  {
    id: 2,
    name: 'Análisis',
    description: 'Procesamiento semántico, detección de patrones y correlación multi-plataforma',
    color: '#F59E0B',
    icon: 'Brain',
    agents: [
      { id: 'ana-sem', name: 'Semantic Analyzer', layer: 2, layerName: 'Análisis', status: 'active', health: 92, messagesProcessed: 342100, lastHeartbeat: 'Hace 3s', uptime: '45d 12h', description: 'Análisis semántico con NLP y detección de intenciones' },
      { id: 'ana-pat', name: 'Pattern Detector', layer: 2, layerName: 'Análisis', status: 'active', health: 89, messagesProcessed: 156700, lastHeartbeat: 'Hace 4s', uptime: '45d 12h', description: 'Detección de patrones de fraude, lavado y desinformación' },
      { id: 'ana-cro', name: 'Cross-Platform Correlator', layer: 2, layerName: 'Análisis', status: 'warning', health: 72, messagesProcessed: 89340, lastHeartbeat: 'Hace 8s', uptime: '20d 4h', description: 'Correlación de eventos entre WhatsApp, Telegram y OSINT' },
      { id: 'ana-ris', name: 'Risk Scorer', layer: 2, layerName: 'Análisis', status: 'active', health: 96, messagesProcessed: 234500, lastHeartbeat: 'Hace 2s', uptime: '45d 12h', description: 'Puntuación de riesgo multidimensional con 5 factores' },
    ],
  },
  {
    id: 3,
    name: 'Monitoreo',
    description: 'Supervisión de umbrales, detección de anomalías y generación de alertas',
    color: '#EF4444',
    icon: 'Shield',
    agents: [
      { id: 'mon-thr', name: 'Threshold Monitor', layer: 3, layerName: 'Monitoreo', status: 'active', health: 94, messagesProcessed: 567800, lastHeartbeat: 'Hace 1s', uptime: '45d 12h', description: 'Monitoreo de 6 umbrales configurables con alertas automáticas' },
      { id: 'mon-ano', name: 'Anomaly Detector', layer: 3, layerName: 'Monitoreo', status: 'active', health: 88, messagesProcessed: 234100, lastHeartbeat: 'Hace 3s', uptime: '45d 12h', description: 'Detección de anomalías con ML y desviación estadística' },
      { id: 'mon-ale', name: 'Alert Engine', layer: 3, layerName: 'Monitoreo', status: 'active', health: 97, messagesProcessed: 89230, lastHeartbeat: 'Hace 1s', uptime: '45d 12h', description: 'Motor de alertas con 5 niveles de severidad y escalamiento' },
    ],
  },
  {
    id: 4,
    name: 'Reportes',
    description: 'Generación automatizada de informes y construcción de dashboards',
    color: '#8B5CF6',
    icon: 'FileOutput',
    agents: [
      { id: 'rep-gen', name: 'Report Generator', layer: 4, layerName: 'Reportes', status: 'active', health: 91, messagesProcessed: 1240, lastHeartbeat: 'Hace 10s', uptime: '45d 12h', description: 'Generación de reportes diarios, semanales y mensuales' },
      { id: 'rep-das', name: 'Dashboard Builder', layer: 4, layerName: 'Reportes', status: 'active', health: 85, messagesProcessed: 340, lastHeartbeat: 'Hace 15s', uptime: '45d 12h', description: 'Constructor de dashboards personalizados con métricas en tiempo real' },
      { id: 'rep-sch', name: 'Scheduler', layer: 4, layerName: 'Reportes', status: 'inactive', health: 0, messagesProcessed: 0, lastHeartbeat: 'Hace 2h', uptime: '0d 0h', description: 'Programador de tareas y reportes automáticos (mantenimiento)' },
    ],
  },
];

export const mockEventBusEvents: EventBusEvent[] = [
  { id: 'evt1', source: 'WhatsApp Bridge', target: 'Semantic Analyzer', type: 'message_batch', timestamp: '22:45:12', data: '150 mensajes batch' },
  { id: 'evt2', source: 'Telethon', target: 'Pattern Detector', type: 'channel_update', timestamp: '22:45:10', data: '3 canales actualizados' },
  { id: 'evt3', source: 'OSINT Shadowbroker', target: 'Cross-Platform Correlator', type: 'osint_alert', timestamp: '22:45:08', data: 'Alerta sísmica M5.2' },
  { id: 'evt4', source: 'Pattern Detector', target: 'Threshold Monitor', type: 'pattern_match', timestamp: '22:45:05', data: 'Patrón fraude multi-canal' },
  { id: 'evt5', source: 'Risk Scorer', target: 'Alert Engine', type: 'risk_score', timestamp: '22:45:03', data: 'Score 87/100 - CRÍTICO' },
  { id: 'evt6', source: 'Threshold Monitor', target: 'Alert Engine', type: 'threshold_breach', timestamp: '22:45:01', data: 'Umbral fraude: 5/hora' },
  { id: 'evt7', source: 'Alert Engine', target: 'Report Generator', type: 'alert_dispatch', timestamp: '22:44:58', data: 'Alerta CRÍTICA generada' },
  { id: 'evt8', source: 'Anomaly Detector', target: 'Alert Engine', type: 'anomaly', timestamp: '22:44:55', data: 'Anomalía grupos inactivos 8x' },
];

export const mockEcosystemStats = {
  monitoredGroups: 276,
  telegramMembers: 16300000,
  whatsappGroups: 195,
  osintSources: 6,
  intelligenceTools: 19,
  threatLevel: 'ALTO' as const,
};

// ==================== STRATEGIES MOCK DATA ====================

export const mockThresholds: ThresholdConfig[] = [
  { id: 'thr1', name: 'Menciones fraude financiero', condition: '3+/hora', value: 3, unit: 'menciones/hora', alertSeverity: 'CRÍTICA', alertType: 'Alerta roja', current: 2, maxValue: 10 },
  { id: 'thr2', name: 'Terremotos M5.0+', condition: 'Magnitud >= 5.0', value: 5, unit: 'magnitud', alertSeverity: 'ALTA', alertType: 'Alerta sísmica', current: 4.2, maxValue: 10 },
  { id: 'thr3', name: 'Vuelos militares zona conflicto', condition: '3+/2horas', value: 3, unit: 'vuelos/2horas', alertSeverity: 'ALTA', alertType: 'Escalación', current: 1, maxValue: 10 },
  { id: 'thr4', name: 'Mensajes sospechosos WhatsApp', condition: '10+/hora con palabras clave', value: 10, unit: 'mensajes/hora', alertSeverity: 'MEDIA', alertType: 'Revisión manual', current: 7, maxValue: 30 },
  { id: 'thr5', name: 'Actividad grupos inactivos', condition: '5x media histórica', value: 5, unit: 'x media', alertSeverity: 'MEDIA', alertType: 'Revisión manual', current: 3.2, maxValue: 15 },
  { id: 'thr6', name: 'Alertas climáticas extremas', condition: '200+ simultáneas', value: 200, unit: 'alertas', alertSeverity: 'BAJA', alertType: 'Monitoreo', current: 89, maxValue: 500 },
];

export const mockPatterns: PatternConfig[] = [
  { id: 'pat1', name: 'Fraude multi-canal', severity: 'CRÍTICA', description: 'Detección de esquemas de fraude coordinados entre WhatsApp, Telegram y otras plataformas simultáneamente', sequence: ['Detección WhatsApp', 'Correlación Telegram', 'Verificación OSINT', 'Confirmación multi-fuente'], detectionRate: 94.7, lastDetected: 'Hace 2h', occurrences: 23 },
  { id: 'pat2', name: 'Lavado de divisas', severity: 'ALTA', description: 'Patrones de transacciones sospechosas que indican posibles operaciones de lavado de dinero a través de múltiples canales', sequence: ['Transacción inusual', 'Patrón fragmentación', 'Conexión cripto', 'Flujo offshore'], detectionRate: 87.3, lastDetected: 'Hace 6h', occurrences: 15 },
  { id: 'pat3', name: 'Migración irregular', severity: 'MEDIA', description: 'Identificación de rutas y patrones de migración irregular basados en comunicaciones y datos OSINT', sequence: ['Agrupamiento geográfico', 'Patrones comunicación', 'Rutas identificadas', 'Cruce fronterizo'], detectionRate: 72.1, lastDetected: 'Hace 12h', occurrences: 8 },
  { id: 'pat4', name: 'Desinformación coordinada', severity: 'ALTA', description: 'Campañas de desinformación sincronizadas en múltiples plataformas con narrativas similares', sequence: ['Narrativa emergente', 'Coordinación temporal', 'Amplificación bots', 'Verificación factual'], detectionRate: 81.5, lastDetected: 'Hace 4h', occurrences: 31 },
  { id: 'pat5', name: 'Manipulación cripto', severity: 'ALTA', description: 'Esquemas de pump-and-dump y manipulación de mercados cripto detectados en grupos de comunicación', sequence: ['Señal compra coordinada', 'Volumen anómalo', 'Venta masiva', 'Caída precio'], detectionRate: 76.8, lastDetected: 'Hace 8h', occurrences: 19 },
];

export const mockRiskDimensions: RiskDimension[] = [
  { id: 'dim1', name: 'Naturaleza', weight: 35, description: 'Tipo y gravedad de la actividad detectada', color: '#EF4444' },
  { id: 'dim2', name: 'Volumen', weight: 25, description: 'Cantidad de eventos y mensajes relacionados', color: '#F59E0B' },
  { id: 'dim3', name: 'Conexiones', weight: 20, description: 'Vínculos entre entidades y redes identificadas', color: '#10B981' },
  { id: 'dim4', name: 'Contexto OSINT', weight: 15, description: 'Corroboración con fuentes de inteligencia abierta', color: '#06B6D4' },
  { id: 'dim5', name: 'Recencia', weight: 5, description: 'Temporalidad y frescura de los datos', color: '#8B5CF6' },
];

export const mockConsensusVotes: ConsensusVote[] = [
  { agentId: 'ana-sem', agentName: 'Semantic Analyzer', vote: 'favor', confidence: 95, reasoning: 'Alta correlación semántica con patrones de fraude conocidos. Confianza elevada.' },
  { agentId: 'ana-pat', agentName: 'Pattern Detector', vote: 'favor', confidence: 88, reasoning: 'Secuencia coincide con patrón de fraude multi-canal en 94% de indicadores.' },
  { agentId: 'ana-cro', agentName: 'Cross-Platform Correlator', vote: 'favor', confidence: 72, reasoning: 'Correlación moderada entre plataformas. Necesita más datos para confirmar.' },
  { agentId: 'ana-ris', agentName: 'Risk Scorer', vote: 'contra', confidence: 45, reasoning: 'Score de riesgo en rango medio. Faltan indicadores de contexto OSINT.' },
];

export const mockPredictionData: PredictionData[] = [
  { hour: '00:00', activity: 45, confidence: 92 },
  { hour: '02:00', activity: 28, confidence: 88 },
  { hour: '04:00', activity: 15, confidence: 85 },
  { hour: '06:00', activity: 52, confidence: 90 },
  { hour: '08:00', activity: 78, confidence: 94 },
  { hour: '10:00', activity: 95, confidence: 91 },
  { hour: '12:00', activity: 110, confidence: 87 },
  { hour: '14:00', activity: 125, confidence: 83 },
  { hour: '16:00', activity: 115, confidence: 89 },
  { hour: '18:00', activity: 98, confidence: 93 },
  { hour: '20:00', activity: 82, confidence: 90 },
  { hour: '22:00', activity: 58, confidence: 86 },
];

export const mockAdaptiveHistory: AdaptiveHistory[] = [
  { date: 'Ene 1', falsePositiveRate: 12.5, sensitivity: 80, accuracy: 78 },
  { date: 'Ene 15', falsePositiveRate: 10.2, sensitivity: 82, accuracy: 81 },
  { date: 'Feb 1', falsePositiveRate: 8.7, sensitivity: 85, accuracy: 84 },
  { date: 'Feb 15', falsePositiveRate: 7.1, sensitivity: 87, accuracy: 86 },
  { date: 'Mar 1', falsePositiveRate: 5.8, sensitivity: 89, accuracy: 89 },
  { date: 'Mar 15', falsePositiveRate: 4.5, sensitivity: 91, accuracy: 91 },
  { date: 'Abr 1', falsePositiveRate: 3.9, sensitivity: 92, accuracy: 93 },
  { date: 'Abr 15', falsePositiveRate: 3.2, sensitivity: 93, accuracy: 94 },
  { date: 'May 1', falsePositiveRate: 2.8, sensitivity: 94, accuracy: 95 },
  { date: 'May 15', falsePositiveRate: 2.5, sensitivity: 95, accuracy: 96 },
];

// ==================== ALERTS MOCK DATA ====================

export const mockAlerts: Alert[] = [
  { id: 'alert1', timestamp: '22:45:12', source: 'WhatsApp Bridge', severity: 'CRÍTICA', title: 'Pico de menciones de fraude financiero', description: 'Se detectaron 5 menciones de fraude financiero en la última hora, superando el umbral de 3/hora. Los mensajes provienen de 3 grupos diferentes con posible coordinación.', actionTaken: 'Alerta roja activada automáticamente. Notificación enviada al equipo de inteligencia.', acknowledged: false },
  { id: 'alert2', timestamp: '22:40:08', source: 'OSINT Shadowbroker', severity: 'ALTA', title: 'Terremoto M5.2 detectado en zona sísmica', description: 'El servicio USGS reportó un sismo de magnitud 5.2 con epicentro a 15km de profundidad. Posible afectación a zonas pobladas cercanas.', actionTaken: 'Alerta sísmica generada. Monitoreo de respuestas en canales locales activado.', acknowledged: false },
  { id: 'alert3', timestamp: '22:35:45', source: 'Pattern Detector', severity: 'ALTA', title: 'Patrón de fraude multi-canal detectado', description: 'Se identificó un patrón de fraude coordinado entre WhatsApp y Telegram. Tres grupos comparten narrativas idénticas sobre esquema de inversión fraudulento.', actionTaken: 'Escalado a equipo de análisis. Votación de consenso multi-agente iniciada.', acknowledged: true },
  { id: 'alert4', timestamp: '22:30:22', source: 'Telethon', severity: 'MEDIA', title: 'Actividad inusual en grupos inactivos', description: 'Grupo "Inversiones_Latam" (inactivo 45 días) muestra actividad 8x superior a su media histórica. 340 mensajes en las últimas 2 horas.', actionTaken: 'Monitoreo intensivo activado. Pendiente revisión manual.', acknowledged: false },
  { id: 'alert5', timestamp: '22:25:10', source: 'Anomaly Detector', severity: 'MEDIA', title: 'Anomalía en volumen de mensajes sospechosos', description: 'Se detectaron 12 mensajes con palabras clave sospechosas en la última hora, superando la media de 4/hora. Concentrados en 2 grupos de WhatsApp.', actionTaken: 'Flagging automático. Revisión manual programada.', acknowledged: true },
  { id: 'alert6', timestamp: '22:20:55', source: 'OSINT Shadowbroker', severity: 'BAJA', title: 'Incremento en alertas climáticas simultáneas', description: 'Se registran 95 alertas climáticas activas simultáneamente, por debajo del umbral de 200. Tendencia ascendente en las últimas 6 horas.', actionTaken: 'Monitoreo continuo. Sin acción requerida actualmente.', acknowledged: true },
  { id: 'alert7', timestamp: '22:15:30', source: 'Cross-Platform Correlator', severity: 'ALTA', title: 'Campaña de desinformación coordinada', description: 'Narrativa sobre crisis bancaria detectada en 5 canales de Telegram y 3 grupos de WhatsApp con timestamps coordinados en los últimos 30 minutos.', actionTaken: 'Votación de consenso: Mayoritario (3/4). Alerta activada con notificación.', acknowledged: false },
  { id: 'alert8', timestamp: '22:10:18', source: 'Risk Scorer', severity: 'INFO', title: 'Actualización de score de riesgo - Entidad X342', description: 'El score de riesgo de la entidad X342 ha aumentado de 45 a 72 en las últimas 24 horas. Principalmente por aumento en conexiones con redes sospechosas.', actionTaken: 'Registro actualizado. Monitoreo pasivo.', acknowledged: true },
  { id: 'alert9', timestamp: '22:05:42', source: 'Pattern Detector', severity: 'ALTA', title: 'Patrón de manipulación cripto detectado', description: 'Señales de pump-and-dump identificadas en grupo "Crypto_Signals_VIP". Coordinación de compra detectada seguida de señales de venta masiva.', actionTaken: 'Alerta generada. Datos enviados a Risk Scorer para evaluación.', acknowledged: false },
  { id: 'alert10', timestamp: '22:00:00', source: 'Threshold Monitor', severity: 'MEDIA', title: 'Vuelos militares en zona de conflicto', description: '2 vuelos militares detectados en zona de conflicto en las últimas 2 horas. Umbral de 3/2horas no alcanzado pero en observación.', actionTaken: 'Monitoreo activo. Sin escalamiento aún.', acknowledged: true },
];

// ==================== REPORTS MOCK DATA ====================

export const mockReportTemplates: ReportTemplate[] = [
  { id: 'tmpl1', name: 'Reporte Diario de Inteligencia', type: 'diario', description: 'Resumen diario de alertas, métricas de agentes y eventos detectados en las últimas 24 horas', sections: ['Resumen ejecutivo', 'Alertas activas', 'Métricas de agentes', 'Eventos destacados', 'Recomendaciones'], schedule: '0 8 * * *' },
  { id: 'tmpl2', name: 'Reporte Semanal de Análisis', type: 'semanal', description: 'Análisis semanal de tendencias, patrones detectados y evolución del nivel de amenaza', sections: ['Tendencias semanales', 'Patrones detectados', 'Evolución amenazas', 'Estadísticas de agentes', 'Plan de acción'], schedule: '0 9 * * 1' },
  { id: 'tmpl3', name: 'Reporte Mensual Estratégico', type: 'mensual', description: 'Informe mensual estratégico con análisis profundo, métricas de rendimiento y planificación', sections: ['Análisis estratégico', 'Métricas KPI', 'Rendimiento del sistema', 'Casos destacados', 'Planificación mensual', 'Evolución adaptativa'], schedule: '0 10 1 * *' },
];

export const mockReports: Report[] = [
  { id: 'rep1', title: 'Reporte Diario - 25 Mayo 2026', date: '2026-05-25', type: 'diario', status: 'completado', pages: 12, sections: ['Resumen ejecutivo', 'Alertas activas', 'Métricas de agentes', 'Eventos destacados', 'Recomendaciones'], downloadUrl: '/download/reporte-diario-2026-05-25.pdf' },
  { id: 'rep2', title: 'Reporte Diario - 24 Mayo 2026', date: '2026-05-24', type: 'diario', status: 'completado', pages: 10, sections: ['Resumen ejecutivo', 'Alertas activas', 'Métricas de agentes', 'Eventos destacados', 'Recomendaciones'], downloadUrl: '/download/reporte-diario-2026-05-24.pdf' },
  { id: 'rep3', title: 'Reporte Semanal - Semana 21', date: '2026-05-23', type: 'semanal', status: 'completado', pages: 28, sections: ['Tendencias semanales', 'Patrones detectados', 'Evolución amenazas', 'Estadísticas de agentes', 'Plan de acción'], downloadUrl: '/download/reporte-semanal-s21.pdf' },
  { id: 'rep4', title: 'Reporte Diario - 23 Mayo 2026', date: '2026-05-23', type: 'diario', status: 'completado', pages: 11, sections: ['Resumen ejecutivo', 'Alertas activas', 'Métricas de agentes', 'Eventos destacados', 'Recomendaciones'], downloadUrl: '/download/reporte-diario-2026-05-23.pdf' },
  { id: 'rep5', title: 'Reporte Mensual - Abril 2026', date: '2026-05-01', type: 'mensual', status: 'completado', pages: 45, sections: ['Análisis estratégico', 'Métricas KPI', 'Rendimiento del sistema', 'Casos destacados', 'Planificación mensual', 'Evolución adaptativa'], downloadUrl: '/download/reporte-mensual-abril-2026.pdf' },
  { id: 'rep6', title: 'Reporte Semanal - Semana 20', date: '2026-05-16', type: 'semanal', status: 'completado', pages: 25, sections: ['Tendencias semanales', 'Patrones detectados', 'Evolución amenazas', 'Estadísticas de agentes', 'Plan de acción'], downloadUrl: '/download/reporte-semanal-s20.pdf' },
  { id: 'rep7', title: 'Reporte Diario - 26 Mayo 2026', date: '2026-05-26', type: 'diario', status: 'generando', pages: 0, sections: ['Resumen ejecutivo', 'Alertas activas', 'Métricas de agentes', 'Eventos destacados', 'Recomendaciones'] },
];

// ==================== OSINT MOCK DATA ====================

export const mockOsintData = {
  earthquakes: [
    { id: 'eq1', location: 'Chile, Valparaíso', magnitude: 5.2, depth: 15, time: '22:40:08', source: 'USGS' },
    { id: 'eq2', location: 'Japón, Honshu', magnitude: 4.8, depth: 32, time: '20:15:33', source: 'USGS' },
    { id: 'eq3', location: 'Indonesia, Sumatra', magnitude: 4.5, depth: 45, time: '18:30:12', source: 'EMSC' },
  ],
  flights: [
    { id: 'fl1', callsign: 'AE4012', type: 'Militar', altitude: 35000, heading: 145, zone: 'Med Oriente', time: '22:20:00' },
    { id: 'fl2', callsign: 'TU8834', type: 'Militar', altitude: 28000, heading: 270, zone: 'Europa del Este', time: '22:10:00' },
  ],
  weather: {
    activeAlerts: 95,
    extremeEvents: ['Tormenta tropical - Caribe', 'Ola de calor - Sudeste Asiático', 'Inundaciones - África Occidental'],
  },
  crypto: [
    { symbol: 'BTC', price: 67842, change: +2.3, volume: '28.5B', trend: 'alcista' },
    { symbol: 'ETH', price: 3845, change: -1.2, volume: '15.2B', trend: 'mixta' },
    { symbol: 'USDT', price: 1.0, change: 0.01, volume: '52.1B', trend: 'estable' },
  ],
};

// ==================== NAVIGATION ITEMS ====================

export const navItems = [
  { id: "dashboard", label: "Dashboard", icon: "LayoutDashboard" as const },
  { id: "chat", label: "Chat", icon: "MessageSquare" as const },
  { id: "contacts", label: "Contacts", icon: "Users" as const },
  { id: "templates", label: "Templates", icon: "FileText" as const },
  { id: "campaigns", label: "Campaigns", icon: "Megaphone" as const },
  { id: "chatbot", label: "Chatbot", icon: "Bot" as const },
  { id: "analytics", label: "Analytics", icon: "BarChart3" as const },
  { id: "cognitive", label: "🧠 Cognitive", icon: "Brain" as const },
  { id: "research", label: "🔬 Research", icon: "Microscope" as const },
  { id: "hermes", label: "⚡ Hermes", icon: "Zap" as const },
  { id: "multiagent", label: "🛡️ Multi-Agente", icon: "Radar" as const },
  { id: "strategies", label: "🎯 Estrategias", icon: "GitBranch" as const },
  { id: "monitoring", label: "📡 Monitoreo", icon: "Activity" as const },
  { id: "reports", label: "📊 Reportes", icon: "FileOutput" as const },
  { id: "settings", label: "Settings", icon: "Settings" as const },
];
