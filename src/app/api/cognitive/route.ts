import { NextResponse } from 'next/server';

// Cognitive Capital API - Knowledge base statistics and data
export async function GET() {
  const data = {
    stats: {
      totalMessages: 14782,
      totalEntities: 342,
      totalDecisions: 89,
      totalPatterns: 47,
      totalResearchTasks: 23,
      messagesGrowth: 15.3,
      entitiesGrowth: 8.7,
    },
    messages: [
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
    ],
    entities: [
      { id: 'e1', name: 'API Integration', type: 'project', relevance: 0.96, mentions: 47, lastSeen: '5 min ago', properties: ['Q2 Launch', 'Priority: High', 'Deadline: April 15'] },
      { id: 'e2', name: 'Sarah Johnson', type: 'person', relevance: 0.94, mentions: 89, lastSeen: '5 min ago', properties: ['Product Manager', 'API Lead'] },
      { id: 'e3', name: 'Security Audit', type: 'action_item', relevance: 0.92, mentions: 23, lastSeen: '12 min ago', properties: ['Critical', '2 Issues Found'] },
      { id: 'e4', name: 'Enterprise Tier', type: 'concept', relevance: 0.89, mentions: 34, lastSeen: '30 min ago', properties: ['Pricing', 'Client Approved'] },
      { id: 'e5', name: 'Michael Chen', type: 'person', relevance: 0.88, mentions: 67, lastSeen: '12 min ago', properties: ['Security Engineer', 'Audit Lead'] },
      { id: 'e6', name: 'Dashboard Redesign', type: 'project', relevance: 0.85, mentions: 18, lastSeen: '1 hour ago', properties: ['Design Review', 'Mockups Ready'] },
      { id: 'e7', name: 'Database Optimization', type: 'topic', relevance: 0.83, mentions: 29, lastSeen: '3 hours ago', properties: ['40% Performance Gain', 'Completed'] },
      { id: 'e8', name: 'ML Infrastructure', type: 'project', relevance: 0.81, mentions: 15, lastSeen: '8 hours ago', properties: ['Budget Approved', 'Procurement Pending'] },
      { id: 'e9', name: 'Caching Migration', type: 'decision', relevance: 0.79, mentions: 12, lastSeen: '4 hours ago', properties: ['Traffic Spike Prep', 'Pending'] },
      { id: 'e10', name: 'Emily Rodriguez', type: 'person', relevance: 0.77, mentions: 45, lastSeen: '30 min ago', properties: ['Account Executive', 'Enterprise Deals'] },
      { id: 'e11', name: 'Onboarding Flow', type: 'project', relevance: 0.75, mentions: 11, lastSeen: '6 hours ago', properties: ['Interactive Tutorials', 'Progress Tracker'] },
      { id: 'e12', name: 'Third-Party API', type: 'topic', relevance: 0.73, mentions: 21, lastSeen: '5 hours ago', properties: ['503 Errors', 'Retry Logic Added'] },
    ],
    relationships: [
      { id: 'r1', source: 'Sarah Johnson', target: 'API Integration', type: 'leads', strength: 0.95 },
      { id: 'r2', source: 'Michael Chen', target: 'Security Audit', type: 'performs', strength: 0.93 },
      { id: 'r3', source: 'API Integration', target: 'Q2 Launch', type: 'part_of', strength: 0.91 },
      { id: 'r4', source: 'Emily Rodriguez', target: 'Enterprise Tier', type: 'sells', strength: 0.88 },
      { id: 'r5', source: 'Database Optimization', target: 'API Integration', type: 'supports', strength: 0.85 },
      { id: 'r6', source: 'Caching Migration', target: 'ML Infrastructure', type: 'depends_on', strength: 0.82 },
      { id: 'r7', source: 'James Wilson', target: 'Dashboard Redesign', type: 'designs', strength: 0.90 },
      { id: 'r8', source: 'Third-Party API', target: 'Security Audit', type: 'flagged_in', strength: 0.78 },
      { id: 'r9', source: 'Priya Patel', target: 'REST Endpoints', type: 'documents', strength: 0.80 },
      { id: 'r10', source: 'ML Infrastructure', target: 'Database Optimization', type: 'benefits_from', strength: 0.76 },
    ],
    decisions: [
      { id: 'd1', title: 'Adopt microservices architecture for v3', maker: 'Sarah Johnson', status: 'implemented', priority: 'high', date: '2024-02-15', context: 'Migration from monolith approved for Q2' },
      { id: 'd2', title: 'Implement real-time caching layer', maker: 'Lisa Wang', status: 'pending', priority: 'high', date: '2024-02-20', context: 'Redis cluster for handling traffic spikes' },
      { id: 'd3', title: 'Upgrade to GPT-4o for all agents', maker: 'Admin', status: 'implemented', priority: 'medium', date: '2024-02-10', context: 'Better reasoning and reduced hallucinations' },
      { id: 'd4', title: 'Launch enterprise pricing tier', maker: 'Emily Rodriguez', status: 'implemented', priority: 'high', date: '2024-02-08', context: 'Client demand for premium features' },
      { id: 'd5', title: 'Schedule security audit cadence', maker: 'Michael Chen', status: 'pending', priority: 'medium', date: '2024-02-22', context: 'Quarterly security reviews required' },
      { id: 'd6', title: 'Migrate database to PostgreSQL 16', maker: 'David Kim', status: 'pending', priority: 'medium', date: '2024-02-18', context: 'Performance improvements needed for scale' },
      { id: 'd7', title: 'Approve ML infrastructure budget', maker: 'Tom Bradley', status: 'implemented', priority: 'high', date: '2024-02-12', context: '$50K budget for GPU cluster' },
      { id: 'd8', title: 'Integrate DeerFlow for deep research', maker: 'Admin', status: 'overdue', priority: 'low', date: '2024-01-28', context: 'Auto-research on trending topics' },
    ],
    patterns: [
      { id: 'p1', name: 'Morning Spike Pattern', description: 'Message volume peaks between 9-10 AM on weekdays, primarily customer support queries', confidence: 0.94, occurrences: 42, category: 'Communication' },
      { id: 'p2', name: 'Decision Deferral Loop', description: 'High-priority decisions are discussed 3.2x on average before implementation', confidence: 0.87, occurrences: 28, category: 'Decision' },
      { id: 'p3', name: 'Cross-team Dependency Chain', description: 'API changes trigger cascading updates across 4.7 teams on average', confidence: 0.82, occurrences: 19, category: 'Workflow' },
      { id: 'p4', name: 'Feature Request Clustering', description: 'Related feature requests appear in clusters within 48-hour windows', confidence: 0.79, occurrences: 15, category: 'Product' },
      { id: 'p5', name: 'Escalation Pattern', description: 'Unresolved queries escalate to human agents after 2.3 automated attempts', confidence: 0.76, occurrences: 34, category: 'Support' },
      { id: 'p6', name: 'Weekly Review Cycle', description: 'Team members review metrics and progress every Friday afternoon', confidence: 0.91, occurrences: 52, category: 'Workflow' },
    ],
    summaries: [
      {
        id: 's1',
        period: 'daily',
        date: 'Today',
        insights: [
          'API Integration project is on track but needs additional QA resources',
          'Security audit found 2 critical vulnerabilities requiring immediate patches',
          'Enterprise tier client signed — projected $45K ARR increase',
          'Dashboard redesign mockups ready for stakeholder review',
        ],
        actionItems: [
          'Assign QA engineer to API Integration testing by EOD',
          'Patch critical security vulnerabilities within 24 hours',
          'Schedule dashboard design review for Thursday 2PM',
          'Update project timeline to reflect enterprise onboarding',
        ],
      },
      {
        id: 's2',
        period: 'weekly',
        date: 'This Week',
        insights: [
          'Message volume up 15% compared to last week — driven by new campaign launches',
          '3 new action items created from conversations, 2 remain pending',
          'Cross-team coordination improving — average response time down 22%',
          'Database optimization delivered 40% performance gain across key queries',
        ],
        actionItems: [
          'Complete caching migration before month-end traffic spike',
          'Follow up on overdue DeerFlow integration decision',
          'Review and close pending security audit items',
          'Prepare Q2 roadmap presentation with updated timelines',
        ],
      },
    ],
  };

  return NextResponse.json(data);
}
