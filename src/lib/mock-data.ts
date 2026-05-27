/**
 * Type definitions for the Whatomate platform.
 *
 * These types are kept for reference but all mock data has been removed.
 * Data now comes from real API endpoints and database queries:
 *   - Dashboard: /api/dashboard
 *   - Analytics: /api/analytics
 *   - Contacts: /api/hermes/contacts
 *   - Conversations: /api/hermes/conversations
 *   - Templates: /api/hermes/templates
 *   - Campaigns: /api/hermes/campaigns
 *   - Chatbot flows: /api/hermes/chatbot
 *   - Agents: /api/agents
 *   - Alerts: /api/alerts
 *   - Strategies: /api/strategies
 *   - Reports: /api/reports
 *   - OSINT: /api/osint
 *   - Events: /api/events
 *
 * Multi-agent intelligence types are defined in @/lib/intelligence/types.ts
 * Navigation configuration is defined in @/lib/nav-config.ts
 */

// ==================== WHATSAPP CRM TYPES ====================

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
