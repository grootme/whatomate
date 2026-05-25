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

// Mock Contacts
export const mockContacts: Contact[] = [
  {
    id: "c1",
    name: "Sarah Johnson",
    phone: "+1 (555) 123-4567",
    email: "sarah.j@example.com",
    tags: ["VIP", "Customer"],
    lastSeen: "2 min ago",
  },
  {
    id: "c2",
    name: "Michael Chen",
    phone: "+1 (555) 234-5678",
    email: "m.chen@example.com",
    tags: ["Lead"],
    lastSeen: "15 min ago",
  },
  {
    id: "c3",
    name: "Emily Rodriguez",
    phone: "+1 (555) 345-6789",
    email: "emily.r@example.com",
    tags: ["Customer", "Enterprise"],
    lastSeen: "1 hour ago",
  },
  {
    id: "c4",
    name: "James Wilson",
    phone: "+1 (555) 456-7890",
    email: "j.wilson@example.com",
    tags: ["Lead"],
    lastSeen: "3 hours ago",
  },
  {
    id: "c5",
    name: "Priya Patel",
    phone: "+1 (555) 567-8901",
    email: "priya.p@example.com",
    tags: ["Customer", "VIP"],
    lastSeen: "Online",
  },
  {
    id: "c6",
    name: "David Kim",
    phone: "+1 (555) 678-9012",
    email: "d.kim@example.com",
    tags: ["Prospect"],
    lastSeen: "Yesterday",
  },
];

// Mock Messages
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
    { id: "m17", conversationId: "conv5", from: "agent", text: "Great to hear that, Priya! Don't hesitate to reach out if you need anything else. 😊", timestamp: "11:01 AM", type: "outgoing", status: "read" },
  ],
};

// Mock Conversations
export const mockConversations: Conversation[] = [
  { id: "conv1", contactId: "c1", contactName: "Sarah Johnson", lastMessage: "Can we schedule a demo this week?", lastMessageTime: "10:36 AM", unreadCount: 1, status: "active", assignedTo: "You" },
  { id: "conv2", contactId: "c2", contactName: "Michael Chen", lastMessage: "Sure, it's https://api.myapp.com/webhooks/whatomate", lastMessageTime: "9:18 AM", unreadCount: 0, status: "active", assignedTo: "You" },
  { id: "conv3", contactId: "c3", contactName: "Emily Rodriguez", lastMessage: "Yes, that would be great! How do I sign up?", lastMessageTime: "Yesterday", unreadCount: 2, status: "pending" },
  { id: "conv4", contactId: "c4", contactName: "James Wilson", lastMessage: "I need help with the template approval process.", lastMessageTime: "8:45 AM", unreadCount: 1, status: "active" },
  { id: "conv5", contactId: "c5", contactName: "Priya Patel", lastMessage: "Thank you for the quick response!", lastMessageTime: "11:00 AM", unreadCount: 0, status: "resolved", assignedTo: "You" },
];

// Mock Templates
export const mockTemplates: Template[] = [
  { id: "t1", name: "welcome_message", category: "utility", status: "approved", language: "en", body: "Welcome to {{1}}! We're excited to have you. How can we help you today?", createdAt: "2024-01-15" },
  { id: "t2", name: "order_confirmation", category: "utility", status: "approved", language: "en", body: "Your order #{{1}} has been confirmed! Estimated delivery: {{2}}. Track your order at {{3}}.", createdAt: "2024-01-20" },
  { id: "t3", name: "promo_offer", category: "marketing", status: "approved", language: "en", body: "🎉 Special offer! Get {{1}}% off on all products. Use code {{2}} at checkout. Valid until {{3}}!", createdAt: "2024-02-01" },
  { id: "t4", name: "appointment_reminder", category: "utility", status: "pending", language: "en", body: "Reminder: You have an appointment with {{1}} on {{2}} at {{3}}. Reply YES to confirm or NO to reschedule.", createdAt: "2024-02-10" },
  { id: "t5", name: "feedback_request", category: "marketing", status: "approved", language: "en", body: "Hi {{1}}! How was your experience with {{2}}? We'd love your feedback: {{3}}", createdAt: "2024-02-15" },
  { id: "t6", name: "otp_verification", category: "authentication", status: "approved", language: "en", body: "Your verification code is {{1}}. This code expires in {{2}} minutes. Do not share this code.", createdAt: "2024-02-20" },
];

// Mock Campaigns
export const mockCampaigns: Campaign[] = [
  { id: "camp1", name: "Spring Sale 2024", status: "completed", templateId: "t3", templateName: "promo_offer", totalRecipients: 1250, sent: 1250, delivered: 1180, read: 890, replied: 234, createdAt: "2024-02-01" },
  { id: "camp2", name: "New Feature Announcement", status: "running", templateId: "t1", templateName: "welcome_message", totalRecipients: 3200, sent: 2100, delivered: 1950, read: 1200, replied: 156, createdAt: "2024-02-15" },
  { id: "camp3", name: "Customer Feedback Drive", status: "scheduled", templateId: "t5", templateName: "feedback_request", totalRecipients: 800, sent: 0, delivered: 0, read: 0, replied: 0, scheduledAt: "2024-03-01T10:00:00", createdAt: "2024-02-20" },
  { id: "camp4", name: "Product Launch Notification", status: "draft", templateId: "t2", templateName: "order_confirmation", totalRecipients: 0, sent: 0, delivered: 0, read: 0, replied: 0, createdAt: "2024-02-25" },
  { id: "camp5", name: "Flash Sale Weekend", status: "paused", templateId: "t3", templateName: "promo_offer", totalRecipients: 5000, sent: 2300, delivered: 2100, read: 1500, replied: 345, createdAt: "2024-02-22" },
];

// Mock Chatbot Flows
export const mockChatbotFlows: ChatbotFlow[] = [
  { id: "flow1", name: "Customer Support Bot", status: "active", triggerKeyword: "help", nodes: 8, lastModified: "2024-02-20" },
  { id: "flow2", name: "Sales Qualification", status: "active", triggerKeyword: "pricing", nodes: 12, lastModified: "2024-02-18" },
  { id: "flow3", name: "Order Tracking", status: "active", triggerKeyword: "track", nodes: 6, lastModified: "2024-02-15" },
  { id: "flow4", name: "Appointment Booking", status: "inactive", triggerKeyword: "book", nodes: 10, lastModified: "2024-02-10" },
  { id: "flow5", name: "Feedback Collector", status: "draft", triggerKeyword: "feedback", nodes: 4, lastModified: "2024-02-25" },
];

// Dashboard stats
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

// Weekly message analytics
export const mockWeeklyAnalytics = [
  { day: "Mon", sent: 245, received: 189 },
  { day: "Tue", sent: 312, received: 267 },
  { day: "Wed", sent: 289, received: 234 },
  { day: "Thu", sent: 356, received: 298 },
  { day: "Fri", sent: 398, received: 345 },
  { day: "Sat", sent: 178, received: 156 },
  { day: "Sun", sent: 134, received: 112 },
];

// Monthly analytics
export const mockMonthlyAnalytics = [
  { month: "Sep", conversations: 320, messages: 4500 },
  { month: "Oct", conversations: 380, messages: 5200 },
  { month: "Nov", conversations: 410, messages: 5800 },
  { month: "Dec", conversations: 490, messages: 6100 },
  { month: "Jan", conversations: 450, messages: 5600 },
  { month: "Feb", conversations: 520, messages: 6400 },
];

// Navigation items
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
  { id: "settings", label: "Settings", icon: "Settings" as const },
];
