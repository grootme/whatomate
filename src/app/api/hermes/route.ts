import { NextResponse } from 'next/server';

// Hermes Gateway Status API
export async function GET() {
  // Try to read from the Baileys bridge health endpoint
  let bridgeHealth = false;
  try {
    const res = await fetch('http://127.0.0.1:3001/health', { signal: AbortSignal.timeout(3000) });
    bridgeHealth = res.ok;
  } catch {
    bridgeHealth = false;
  }

  const data = {
    connectionStatus: bridgeHealth ? 'connected' as const : 'disconnected' as const,
    phoneNumber: '+1 (555) 987-6543',
    lastSync: bridgeHealth ? '2 minutes ago' : 'Unavailable',
    gatewayRunning: true,
    activePlatforms: ['WhatsApp', 'Telegram'],
    uptime: '14d 7h 32m',
    agentModel: 'openai/gpt-4o',
    temperature: 0.7,
    maxIterations: 10,
    messages: [
      { id: 'hm1', from: '+1 (555) 123-4567', to: '+1 (555) 987-6543', text: 'Hey, can you help me with my order status?', timestamp: '2 min ago', direction: 'incoming' as const, status: 'read' as const },
      { id: 'hm2', from: '+1 (555) 987-6543', to: '+1 (555) 123-4567', text: 'Of course! Let me look up your order. Could you share your order number?', timestamp: '2 min ago', direction: 'outgoing' as const, status: 'delivered' as const },
      { id: 'hm3', from: '+1 (555) 123-4567', to: '+1 (555) 987-6543', text: 'Sure, it\'s #ORD-2024-5847', timestamp: '1 min ago', direction: 'incoming' as const, status: 'read' as const },
      { id: 'hm4', from: '+1 (555) 987-6543', to: '+1 (555) 123-4567', text: 'Your order #ORD-2024-5847 is currently in transit and expected to arrive by Friday.', timestamp: '1 min ago', direction: 'outgoing' as const, status: 'sent' as const },
      { id: 'hm5', from: '+1 (555) 234-5678', to: '+1 (555) 987-6543', text: 'I need to reschedule my appointment', timestamp: '5 min ago', direction: 'incoming' as const, status: 'read' as const },
      { id: 'hm6', from: '+1 (555) 987-6543', to: '+1 (555) 234-5678', text: 'I\'d be happy to help reschedule. What date and time works better for you?', timestamp: '5 min ago', direction: 'outgoing' as const, status: 'read' as const },
      { id: 'hm7', from: '+1 (555) 345-6789', to: '+1 (555) 987-6543', text: 'What are your business hours?', timestamp: '12 min ago', direction: 'incoming' as const, status: 'read' as const },
      { id: 'hm8', from: '+1 (555) 987-6543', to: '+1 (555) 345-6789', text: 'Our business hours are Mon-Fri 9AM-6PM EST. We also have weekend support from 10AM-4PM.', timestamp: '12 min ago', direction: 'outgoing' as const, status: 'delivered' as const },
      { id: 'hm9', from: '+1 (555) 456-7890', to: '+1 (555) 987-6543', text: 'Is the premium plan worth it?', timestamp: '25 min ago', direction: 'incoming' as const, status: 'read' as const },
      { id: 'hm10', from: '+1 (555) 987-6543', to: '+1 (555) 456-7890', text: 'The Premium plan includes priority support, unlimited chatbots, and advanced analytics. Many of our enterprise clients find great value in it!', timestamp: '25 min ago', direction: 'outgoing' as const, status: 'read' as const },
      { id: 'hm11', from: '+1 (555) 567-8901', to: '+1 (555) 987-6543', text: 'How do I export my contacts?', timestamp: '1 hour ago', direction: 'incoming' as const, status: 'read' as const },
      { id: 'hm12', from: '+1 (555) 987-6543', to: '+1 (555) 567-8901', text: 'You can export contacts from Settings > Data Management > Export. We support CSV and Excel formats.', timestamp: '1 hour ago', direction: 'outgoing' as const, status: 'read' as const },
      { id: 'hm13', from: '+1 (555) 678-9012', to: '+1 (555) 987-6543', text: 'Thanks for the quick help earlier!', timestamp: '2 hours ago', direction: 'incoming' as const, status: 'read' as const },
      { id: 'hm14', from: '+1 (555) 987-6543', to: '+1 (555) 678-9012', text: 'You\'re welcome! Don\'t hesitate to reach out anytime. 😊', timestamp: '2 hours ago', direction: 'outgoing' as const, status: 'delivered' as const },
      { id: 'hm15', from: '+1 (555) 789-0123', to: '+1 (555) 987-6543', text: 'Can I integrate with Slack?', timestamp: '3 hours ago', direction: 'incoming' as const, status: 'read' as const },
      { id: 'hm16', from: '+1 (555) 987-6543', to: '+1 (555) 789-0123', text: 'Yes! We have a native Slack integration. You can set it up from the Integrations page in your dashboard.', timestamp: '3 hours ago', direction: 'outgoing' as const, status: 'read' as const },
      { id: 'hm17', from: '+1 (555) 890-1234', to: '+1 (555) 987-6543', text: 'My chatbot is not responding', timestamp: '4 hours ago', direction: 'incoming' as const, status: 'read' as const },
      { id: 'hm18', from: '+1 (555) 987-6543', to: '+1 (555) 890-1234', text: 'I\'m sorry about that. Let me check your chatbot configuration. Could you tell me which flow is affected?', timestamp: '4 hours ago', direction: 'outgoing' as const, status: 'delivered' as const },
      { id: 'hm19', from: '+1 (555) 901-2345', to: '+1 (555) 987-6543', text: 'Do you offer API access?', timestamp: '5 hours ago', direction: 'incoming' as const, status: 'read' as const },
      { id: 'hm20', from: '+1 (555) 987-6543', to: '+1 (555) 901-2345', text: 'Absolutely! Our REST API is available on Business and Enterprise plans. Full documentation is at docs.whatomate.com/api', timestamp: '5 hours ago', direction: 'outgoing' as const, status: 'read' as const },
    ],
    skills: [
      { id: 'sk1', name: 'Auto-Reply', description: 'Automatically respond to common queries using AI', enabled: true, category: 'Messaging' },
      { id: 'sk2', name: 'Contact Enrichment', description: 'Automatically enrich contact data from conversations', enabled: true, category: 'CRM' },
      { id: 'sk3', name: 'Sentiment Analysis', description: 'Analyze message sentiment and flag negative interactions', enabled: true, category: 'Analytics' },
      { id: 'sk4', name: 'Appointment Scheduler', description: 'Schedule and manage appointments via WhatsApp', enabled: false, category: 'Scheduling' },
      { id: 'sk5', name: 'Order Tracker', description: 'Track order status and provide real-time updates', enabled: true, category: 'E-Commerce' },
      { id: 'sk6', name: 'Lead Qualifier', description: 'Qualify leads automatically through structured questions', enabled: true, category: 'Sales' },
      { id: 'sk7', name: 'Language Detection', description: 'Detect message language and route to appropriate agent', enabled: false, category: 'Routing' },
      { id: 'sk8', name: 'Cognitive Extraction', description: 'Extract entities, decisions, and patterns from messages', enabled: true, category: 'Knowledge' },
      { id: 'sk9', name: 'Escalation Handler', description: 'Auto-escalate complex issues to human agents', enabled: true, category: 'Support' },
      { id: 'sk10', name: 'Follow-up Scheduler', description: 'Schedule automatic follow-ups for pending conversations', enabled: false, category: 'Messaging' },
    ],
    cronJobs: [
      { id: 'cj1', name: 'Daily Report Generation', schedule: '0 8 * * *', status: 'active' as const, lastRun: 'Today 8:00 AM', nextRun: 'Tomorrow 8:00 AM' },
      { id: 'cj2', name: 'Contact Sync', schedule: '*/30 * * * *', status: 'active' as const, lastRun: '10 min ago', nextRun: 'In 20 min' },
      { id: 'cj3', name: 'Stale Conversation Cleanup', schedule: '0 2 * * *', status: 'active' as const, lastRun: 'Today 2:00 AM', nextRun: 'Tomorrow 2:00 AM' },
      { id: 'cj4', name: 'Knowledge Base Indexing', schedule: '0 */6 * * *', status: 'active' as const, lastRun: '4 hours ago', nextRun: 'In 2 hours' },
      { id: 'cj5', name: 'Lead Score Recalculation', schedule: '0 9 * * 1', status: 'paused' as const, lastRun: 'Last Monday 9:00 AM', nextRun: 'Paused' },
      { id: 'cj6', name: 'Weekly Analytics Export', schedule: '0 6 * * 1', status: 'error' as const, lastRun: 'Failed - 2 days ago', nextRun: 'Next Monday 6:00 AM' },
    ],
  };

  return NextResponse.json(data);
}
