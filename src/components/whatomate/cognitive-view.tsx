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

const emptyData: CognitiveData = {
  stats: {
    totalMessages: 0,
    totalEntities: 0,
    totalDecisions: 0,
    totalPatterns: 0,
    totalResearchTasks: 0,
    messagesGrowth: 0,
    entitiesGrowth: 0,
  },
  messages: [],
  entities: [],
  relationships: [],
  decisions: [],
  patterns: [],
  summaries: [],
};

/** Format an ISO timestamp into a human-readable relative time string */
function formatRelativeTimestamp(ts: string): string {
  try {
    const d = new Date(ts);
    if (isNaN(d.getTime())) return ts;
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins} min ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  } catch {
    return ts;
  }
}

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
  const [data, setData] = useState<CognitiveData>(emptyData);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<KnowledgeMessage[]>([]);
  const [searching, setSearching] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/cognitive');
      if (res.ok) {
        const json = await res.json();
        // Map API response to component data shape, formatting timestamps for display
        const mapped: CognitiveData = {
          stats: json.stats ?? emptyData.stats,
          messages: (json.messages ?? []).map((m: KnowledgeMessage) => ({
            ...m,
            timestamp: formatRelativeTimestamp(m.timestamp),
          })),
          entities: json.entities ?? [],
          relationships: json.relationships ?? [],
          decisions: json.decisions ?? [],
          patterns: json.patterns ?? [],
          summaries: json.summaries ?? [],
        };
        setData(mapped);
      }
    } catch {
      // API unavailable — keep empty data
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
              Avg confidence: {data.patterns.length > 0 ? (data.patterns.reduce((a, p) => a + p.confidence, 0) / data.patterns.length * 100).toFixed(0) : 0}%
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
