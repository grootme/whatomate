import { NextRequest, NextResponse } from 'next/server';

// Cognitive Full-Text Search API
export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get('q')?.toLowerCase() || '';

  if (!query) {
    return NextResponse.json({ results: [] });
  }

  // Mock search across all messages and knowledge
  const allMessages = [
    { id: 'km1', from: 'Sarah Johnson', text: 'We need to prioritize the API integration for the Q2 launch. The deadline is April 15th.', timestamp: '5 min ago', channel: 'WhatsApp', entities: 3 },
    { id: 'km2', from: 'Michael Chen', text: 'I\'ve completed the security audit for the new microservice. Found 2 critical issues that need immediate attention.', timestamp: '12 min ago', channel: 'WhatsApp', entities: 4 },
    { id: 'km3', from: 'Emily Rodriguez', text: 'The client meeting went well. They agreed to the revised timeline and want to proceed with the enterprise tier.', timestamp: '30 min ago', channel: 'WhatsApp', entities: 3 },
    { id: 'km4', from: 'James Wilson', text: 'Can we schedule a design review for the dashboard redesign? I have the mockups ready.', timestamp: '1 hour ago', channel: 'WhatsApp', entities: 2 },
    { id: 'km5', from: 'Priya Patel', text: 'Updated the documentation for the new REST endpoints. Please review when you get a chance.', timestamp: '2 hours ago', channel: 'WhatsApp', entities: 2 },
    { id: 'km6', from: 'David Kim', text: 'The performance benchmarks show a 40% improvement after the database optimization.', timestamp: '3 hours ago', channel: 'WhatsApp', entities: 3 },
    { id: 'km7', from: 'Lisa Wang', text: 'We should consider migrating to the new caching layer before the traffic spike next month.', timestamp: '4 hours ago', channel: 'WhatsApp', entities: 2 },
    { id: 'km8', from: 'Alex Turner', text: 'The third-party API is returning intermittent 503 errors. I\'ve added retry logic as a temporary fix.', timestamp: '5 hours ago', channel: 'WhatsApp', entities: 3 },
    { id: 'km9', from: 'Rachel Green', text: 'Finished the onboarding flow for new users. It includes interactive tutorials and a progress tracker.', timestamp: '6 hours ago', channel: 'WhatsApp', entities: 2 },
    { id: 'km10', from: 'Tom Bradley', text: 'Budget approved for the new ML infrastructure. We can start procurement next week.', timestamp: '8 hours ago', channel: 'WhatsApp', entities: 2 },
  ];

  // Simple text search
  const results = allMessages.filter(
    msg =>
      msg.text.toLowerCase().includes(query) ||
      msg.from.toLowerCase().includes(query)
  );

  return NextResponse.json({ results, query, total: results.length });
}
