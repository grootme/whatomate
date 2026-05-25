'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Brain,
  Search,
  MessageSquare,
  Users,
  GitBranch,
  ClipboardList,
  Sparkles,
  TrendingUp,
  Calendar,
  ArrowRight,
  FileText,
  Hash,
  Star,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Target,
  Lightbulb,
  BarChart3,
  Database,
  Layers,
  Eye,
  ArrowUpRight,
  UserCheck,
  Briefcase,
  Bookmark,
  Zap,
} from 'lucide-react';

interface KnowledgeStats {
  totalMessages: number;
  totalEntities: number;
  totalDecisions: number;
  totalPatterns: number;
  totalResearchTasks: number;
  messagesGrowth: number;
  entitiesGrowth: number;
}

interface KnowledgeMessage {
  id: string;
  from: string;
  text: string;
  timestamp: string;
  channel: string;
  entities: number;
}

interface KnowledgeEntity {
  id: string;
  name: string;
  type: 'person' | 'topic' | 'decision' | 'action_item' | 'project' | 'concept';
  relevance: number;
  mentions: number;
  lastSeen: string;
  properties: string[];
}

interface Relationship {
  id: string;
  source: string;
  target: string;
  type: string;
  strength: number;
}

interface Decision {
  id: string;
  title: string;
  maker: string;
  status: 'implemented' | 'pending' | 'overdue';
  priority: 'high' | 'medium' | 'low';
  date: string;
  context: string;
}

interface Pattern {
  id: string;
  name: string;
  description: string;
  confidence: number;
  occurrences: number;
  category: string;
}

interface CognitiveSummary {
  id: string;
  period: 'daily' | 'weekly';
  date: string;
  insights: string[];
  actionItems: string[];
}

interface CognitiveData {
  stats: KnowledgeStats;
  messages: KnowledgeMessage[];
  entities: KnowledgeEntity[];
  relationships: Relationship[];
  decisions: Decision[];
  patterns: Pattern[];
  summaries: CognitiveSummary[];
}

const defaultData: CognitiveData = {
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

const entityTypeConfig: Record<string, { icon: React.ElementType; color: string; badge: string }> = {
  person: { icon: Users, color: 'bg-blue-100 dark:bg-blue-900/50 text-blue-600', badge: 'bg-blue-500/10 text-blue-600 border-blue-200' },
  topic: { icon: Hash, color: 'bg-purple-100 dark:bg-purple-900/50 text-purple-600', badge: 'bg-purple-500/10 text-purple-600 border-purple-200' },
  decision: { icon: ClipboardList, color: 'bg-orange-100 dark:bg-orange-900/50 text-orange-600', badge: 'bg-orange-500/10 text-orange-600 border-orange-200' },
  action_item: { icon: Target, color: 'bg-red-100 dark:bg-red-900/50 text-red-600', badge: 'bg-red-500/10 text-red-600 border-red-200' },
  project: { icon: Briefcase, color: 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600', badge: 'bg-emerald-500/10 text-emerald-600 border-emerald-200' },
  concept: { icon: Lightbulb, color: 'bg-yellow-100 dark:bg-yellow-900/50 text-yellow-600', badge: 'bg-yellow-500/10 text-yellow-600 border-yellow-200' },
};

const decisionStatusConfig = {
  implemented: { icon: CheckCircle2, badge: 'bg-emerald-500/10 text-emerald-600 border-emerald-200' },
  pending: { icon: Clock, badge: 'bg-yellow-500/10 text-yellow-600 border-yellow-200' },
  overdue: { icon: AlertTriangle, badge: 'bg-red-500/10 text-red-600 border-red-200' },
};

const priorityConfig = {
  high: 'bg-red-500/10 text-red-600 border-red-200',
  medium: 'bg-yellow-500/10 text-yellow-600 border-yellow-200',
  low: 'bg-gray-500/10 text-gray-600 border-gray-200',
};

export function CognitiveView() {
  const [data, setData] = useState<CognitiveData>(defaultData);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<KnowledgeMessage[]>([]);
  const [searching, setSearching] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/cognitive');
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch {
      // Use default data
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    try {
      const res = await fetch(`/api/cognitive/search?q=${encodeURIComponent(searchQuery)}`);
      if (res.ok) {
        const json = await res.json();
        setSearchResults(json.results || []);
      }
    } catch {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }, [searchQuery]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {[1, 2, 3, 4, 5].map(i => (
            <Card key={i} className="border-0 shadow-sm">
              <CardContent className="p-6">
                <Skeleton className="h-4 w-20 mb-3" />
                <Skeleton className="h-8 w-24 mb-2" />
                <Skeleton className="h-3 w-16" />
              </CardContent>
            </Card>
          ))}
        </div>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-6">
            <Skeleton className="h-6 w-40 mb-4" />
            <Skeleton className="h-48 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Knowledge Statistics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card className="border-0 shadow-sm bg-gradient-to-br from-emerald-50 to-white dark:from-emerald-950/30 dark:to-[#0a0a0b]">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium text-muted-foreground">Total Messages</p>
              <MessageSquare className="w-4 h-4 text-emerald-600" />
            </div>
            <p className="text-xl font-bold">{data.stats.totalMessages.toLocaleString()}</p>
            <div className="flex items-center gap-1 mt-1">
              <TrendingUp className="w-3 h-3 text-emerald-500" />
              <span className="text-xs text-emerald-600 font-medium">+{data.stats.messagesGrowth}%</span>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm bg-gradient-to-br from-blue-50 to-white dark:from-blue-950/30 dark:to-[#0a0a0b]">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium text-muted-foreground">Entities</p>
              <Users className="w-4 h-4 text-blue-600" />
            </div>
            <p className="text-xl font-bold">{data.stats.totalEntities}</p>
            <div className="flex items-center gap-1 mt-1">
              <TrendingUp className="w-3 h-3 text-blue-500" />
              <span className="text-xs text-blue-600 font-medium">+{data.stats.entitiesGrowth}%</span>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm bg-gradient-to-br from-orange-50 to-white dark:from-orange-950/30 dark:to-[#0a0a0b]">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium text-muted-foreground">Decisions</p>
              <ClipboardList className="w-4 h-4 text-orange-600" />
            </div>
            <p className="text-xl font-bold">{data.stats.totalDecisions}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {data.decisions.filter(d => d.status === 'pending').length} pending
            </p>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm bg-gradient-to-br from-purple-50 to-white dark:from-purple-950/30 dark:to-[#0a0a0b]">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium text-muted-foreground">Patterns</p>
              <Sparkles className="w-4 h-4 text-purple-600" />
            </div>
            <p className="text-xl font-bold">{data.stats.totalPatterns}</p>
            <p className="text-xs text-muted-foreground mt-1">
              Avg confidence: {(data.patterns.reduce((a, p) => a + p.confidence, 0) / data.patterns.length * 100).toFixed(0)}%
            </p>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm bg-gradient-to-br from-red-50 to-white dark:from-red-950/30 dark:to-[#0a0a0b]">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium text-muted-foreground">Research Tasks</p>
              <Database className="w-4 h-4 text-red-600" />
            </div>
            <p className="text-xl font-bold">{data.stats.totalResearchTasks}</p>
            <p className="text-xs text-muted-foreground mt-1">Active deep research</p>
          </CardContent>
        </Card>
      </div>

      {/* Search Bar */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-4">
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search across all messages and knowledge..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                className="pl-9"
              />
            </div>
            <Button
              onClick={handleSearch}
              disabled={searching}
              className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
            >
              {searching ? (
                <span className="animate-pulse">Searching...</span>
              ) : (
                <>
                  <Search className="w-4 h-4" /> Search
                </>
              )}
            </Button>
          </div>
          {searchResults.length > 0 && (
            <div className="mt-3 space-y-2">
              <p className="text-xs font-medium text-muted-foreground">{searchResults.length} results found</p>
              {searchResults.map((msg) => (
                <div key={msg.id} className="flex gap-3 p-3 bg-muted/30 rounded-lg">
                  <MessageSquare className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium">{msg.from}</p>
                    <p className="text-sm text-muted-foreground">{msg.text}</p>
                    <span className="text-xs text-muted-foreground">{msg.timestamp} · {msg.channel}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Main Content Tabs */}
      <Tabs defaultValue="messages" className="w-full">
        <TabsList className="bg-muted/50 p-1 flex-wrap h-auto">
          <TabsTrigger value="messages" className="gap-1.5 text-xs sm:text-sm">
            <MessageSquare className="w-4 h-4" /> Messages
          </TabsTrigger>
          <TabsTrigger value="entities" className="gap-1.5 text-xs sm:text-sm">
            <Users className="w-4 h-4" /> Entities
          </TabsTrigger>
          <TabsTrigger value="relationships" className="gap-1.5 text-xs sm:text-sm">
            <GitBranch className="w-4 h-4" /> Relations
          </TabsTrigger>
          <TabsTrigger value="decisions" className="gap-1.5 text-xs sm:text-sm">
            <ClipboardList className="w-4 h-4" /> Decisions
          </TabsTrigger>
          <TabsTrigger value="patterns" className="gap-1.5 text-xs sm:text-sm">
            <Sparkles className="w-4 h-4" /> Patterns
          </TabsTrigger>
          <TabsTrigger value="summaries" className="gap-1.5 text-xs sm:text-sm">
            <Calendar className="w-4 h-4" /> Summaries
          </TabsTrigger>
        </TabsList>

        {/* Messages Tab */}
        <TabsContent value="messages" className="mt-4">
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">Recent Message Feed</CardTitle>
                  <CardDescription>Ingested WhatsApp messages with extracted entities</CardDescription>
                </div>
                <Badge variant="outline" className="text-xs">{data.messages.length} recent</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[520px] pr-4">
                <div className="space-y-2">
                  {data.messages.map((msg) => (
                    <div key={msg.id} className="flex gap-3 p-3 rounded-lg border bg-card hover:bg-muted/10 transition-colors">
                      <div className="w-9 h-9 rounded-full bg-emerald-100 dark:bg-emerald-900/50 flex items-center justify-center shrink-0">
                        <MessageSquare className="w-4 h-4 text-emerald-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-sm font-medium">{msg.from}</span>
                          <Badge variant="secondary" className="text-[9px]">{msg.channel}</Badge>
                          <span className="text-xs text-muted-foreground ml-auto">{msg.timestamp}</span>
                        </div>
                        <p className="text-sm text-muted-foreground leading-relaxed">{msg.text}</p>
                        <div className="flex items-center gap-1 mt-1.5">
                          <Eye className="w-3 h-3 text-muted-foreground" />
                          <span className="text-xs text-muted-foreground">{msg.entities} entities extracted</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Entities Tab */}
        <TabsContent value="entities" className="mt-4">
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">Knowledge Entities</CardTitle>
                  <CardDescription>Extracted people, topics, decisions, and action items</CardDescription>
                </div>
                <div className="flex gap-1.5">
                  {Object.entries(entityTypeConfig).map(([type, config]) => (
                    <Badge key={type} className={`text-[10px] border ${config.badge}`}>
                      {type.replace('_', ' ')}
                    </Badge>
                  ))}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">Type</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead className="text-center">Relevance</TableHead>
                    <TableHead className="text-center">Mentions</TableHead>
                    <TableHead>Last Seen</TableHead>
                    <TableHead>Properties</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.entities.map((entity) => {
                    const typeConfig = entityTypeConfig[entity.type];
                    const TypeIcon = typeConfig.icon;

                    return (
                      <TableRow key={entity.id} className="hover:bg-muted/30">
                        <TableCell>
                          <div className={`w-8 h-8 rounded flex items-center justify-center ${typeConfig.color}`}>
                            <TypeIcon className="w-4 h-4" />
                          </div>
                        </TableCell>
                        <TableCell>
                          <p className="text-sm font-medium">{entity.name}</p>
                          <Badge className={`text-[9px] border mt-0.5 ${typeConfig.badge}`}>
                            {entity.type.replace('_', ' ')}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex flex-col items-center gap-1">
                            <Progress value={entity.relevance * 100} className="w-16 h-2" />
                            <span className="text-xs text-muted-foreground">{(entity.relevance * 100).toFixed(0)}%</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <span className="text-sm font-medium">{entity.mentions}</span>
                        </TableCell>
                        <TableCell>
                          <span className="text-xs text-muted-foreground">{entity.lastSeen}</span>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {entity.properties.map((prop, idx) => (
                              <Badge key={idx} variant="secondary" className="text-[10px]">{prop}</Badge>
                            ))}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Relationships Tab */}
        <TabsContent value="relationships" className="mt-4">
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">Entity Relationships</CardTitle>
                  <CardDescription>Connections between knowledge entities</CardDescription>
                </div>
                <Badge variant="outline" className="text-xs">{data.relationships.length} relationships</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {data.relationships.map((rel) => (
                  <div key={rel.id} className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-muted/10 transition-colors">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <Badge variant="secondary" className="text-xs shrink-0">{rel.source}</Badge>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <ArrowRight className="w-4 h-4 text-muted-foreground" />
                        <Badge className="bg-purple-500/10 text-purple-600 border-purple-200 border text-[10px]">{rel.type}</Badge>
                        <ArrowRight className="w-4 h-4 text-muted-foreground" />
                      </div>
                      <Badge variant="secondary" className="text-xs shrink-0">{rel.target}</Badge>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="flex items-center gap-1">
                        <Star className="w-3 h-3 text-yellow-500" />
                        <span className="text-xs font-medium">{(rel.strength * 100).toFixed(0)}%</span>
                      </div>
                      <Progress value={rel.strength * 100} className="w-20 h-2" />
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Decisions Tab */}
        <TabsContent value="decisions" className="mt-4">
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">Decisions Log</CardTitle>
                  <CardDescription>Extracted decisions with status tracking</CardDescription>
                </div>
                <div className="flex gap-1.5">
                  <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-200 border text-[10px]">
                    {data.decisions.filter(d => d.status === 'implemented').length} implemented
                  </Badge>
                  <Badge className="bg-yellow-500/10 text-yellow-600 border-yellow-200 border text-[10px]">
                    {data.decisions.filter(d => d.status === 'pending').length} pending
                  </Badge>
                  <Badge className="bg-red-500/10 text-red-600 border-red-200 border text-[10px]">
                    {data.decisions.filter(d => d.status === 'overdue').length} overdue
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Status</TableHead>
                    <TableHead>Decision</TableHead>
                    <TableHead>Maker</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Context</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.decisions.map((decision) => {
                    const statusConfig = decisionStatusConfig[decision.status];
                    const StatusIcon = statusConfig.icon;

                    return (
                      <TableRow key={decision.id} className="hover:bg-muted/30">
                        <TableCell>
                          <Badge className={`text-[10px] border ${statusConfig.badge} gap-1`}>
                            <StatusIcon className="w-3 h-3" />
                            {decision.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <p className="text-sm font-medium">{decision.title}</p>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center">
                              <UserCheck className="w-3 h-3 text-muted-foreground" />
                            </div>
                            <span className="text-sm">{decision.maker}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge className={`text-[10px] border ${priorityConfig[decision.priority]}`}>
                            {decision.priority}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <span className="text-xs text-muted-foreground">{decision.date}</span>
                        </TableCell>
                        <TableCell>
                          <p className="text-xs text-muted-foreground max-w-48 truncate">{decision.context}</p>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Patterns Tab */}
        <TabsContent value="patterns" className="mt-4">
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">Detected Patterns</CardTitle>
                  <CardDescription>Behavioral patterns identified from message analysis</CardDescription>
                </div>
                <Badge variant="outline" className="text-xs">{data.patterns.length} patterns</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {data.patterns.map((pattern) => (
                  <div key={pattern.id} className="p-4 rounded-lg border bg-card hover:bg-muted/10 transition-colors">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-lg bg-purple-100 dark:bg-purple-900/50 flex items-center justify-center shrink-0">
                        <BarChart3 className="w-5 h-5 text-purple-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <p className="text-sm font-medium">{pattern.name}</p>
                          <Badge variant="secondary" className="text-[10px]">{pattern.category}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed mb-2">{pattern.description}</p>
                        <div className="flex items-center gap-4">
                          <div className="flex items-center gap-1.5">
                            <Sparkles className="w-3 h-3 text-yellow-500" />
                            <span className="text-xs font-medium">{(pattern.confidence * 100).toFixed(0)}%</span>
                            <span className="text-xs text-muted-foreground">confidence</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Layers className="w-3 h-3 text-blue-500" />
                            <span className="text-xs font-medium">{pattern.occurrences}</span>
                            <span className="text-xs text-muted-foreground">occurrences</span>
                          </div>
                        </div>
                        <Progress value={pattern.confidence * 100} className="w-full h-1.5 mt-2" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Summaries Tab */}
        <TabsContent value="summaries" className="mt-4">
          <div className="space-y-4">
            {data.summaries.map((summary) => (
              <Card key={summary.id} className="border-0 shadow-sm">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Calendar className="w-4 h-4" />
                        {summary.period === 'daily' ? 'Daily' : 'Weekly'} Summary
                      </CardTitle>
                      <Badge variant="secondary" className="text-xs">{summary.date}</Badge>
                    </div>
                    <Badge className={`border ${
                      summary.period === 'daily'
                        ? 'bg-blue-500/10 text-blue-600 border-blue-200'
                        : 'bg-purple-500/10 text-purple-600 border-purple-200'
                    }`}>
                      {summary.period}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Key Insights */}
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
                        <Lightbulb className="w-3 h-3" /> KEY INSIGHTS
                      </p>
                      <div className="space-y-2">
                        {summary.insights.map((insight, idx) => (
                          <div key={idx} className="flex gap-2 p-2.5 bg-muted/30 rounded-md">
                            <div className="w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center shrink-0 mt-0.5">
                              <span className="text-[10px] font-bold text-blue-600">{idx + 1}</span>
                            </div>
                            <p className="text-sm text-foreground/90">{insight}</p>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Action Items */}
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
                        <Zap className="w-3 h-3" /> ACTION ITEMS
                      </p>
                      <div className="space-y-2">
                        {summary.actionItems.map((item, idx) => (
                          <div key={idx} className="flex gap-2 p-2.5 bg-muted/30 rounded-md">
                            <div className="w-5 h-5 rounded-full bg-emerald-100 dark:bg-emerald-900/50 flex items-center justify-center shrink-0 mt-0.5">
                              <Bookmark className="w-3 h-3 text-emerald-600" />
                            </div>
                            <p className="text-sm text-foreground/90">{item}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
