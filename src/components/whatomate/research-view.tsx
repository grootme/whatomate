'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Microscope,
  Search,
  Play,
  Clock,
  CheckCircle2,
  Loader2,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Brain,
  Terminal,
  Wrench,
  User,
  Bot,
  FileText,
  Sparkles,
  ExternalLink,
  Zap,
  Timer,
  Tag,
} from 'lucide-react';

interface ResearchRun {
  id: string;
  query: string;
  status: 'running' | 'completed' | 'failed' | 'queued';
  model: string;
  startTime: string;
  duration: string;
  result?: string;
  citations?: { title: string; url: string; snippet: string }[];
}

interface DeerFlowAgent {
  id: string;
  name: string;
  type: 'lead' | 'general-purpose' | 'bash';
  status: 'active' | 'idle' | 'busy';
  description: string;
  tasksCompleted: number;
  lastActive: string;
}

interface DeerFlowSkill {
  id: string;
  name: string;
  description: string;
  type: 'skill' | 'tool';
  enabled: boolean;
}

interface DeerFlowData {
  runs: ResearchRun[];
  agents: DeerFlowAgent[];
  skills: DeerFlowSkill[];
  availableModels: string[];
  status: 'online' | 'offline' | 'initializing';
}

const defaultData: DeerFlowData = {
  status: 'online',
  runs: [
    {
      id: 'run-001',
      query: 'Impact of transformer architectures on multi-modal AI systems in 2024',
      status: 'completed',
      model: 'gpt-4o',
      startTime: '2 hours ago',
      duration: '4m 32s',
      result: 'Transformer architectures have fundamentally reshaped multi-modal AI in 2024. Key developments include: (1) Unified transformer models like GPT-4V and Gemini that process text, images, and audio through a single architecture; (2) Cross-attention mechanisms enabling seamless modality fusion; (3) Efficient architectures like Mamba and state-space models challenging transformer dominance; (4) Scaling laws being refined for multi-modal training; (5) Emergent capabilities in spatial reasoning and tool use.',
      citations: [
        { title: 'Scaling Laws for Multi-Modal Models', url: 'https://arxiv.org/abs/2401.xxxx', snippet: 'Comprehensive analysis of scaling behavior in vision-language models...' },
        { title: 'Mamba: Linear-Time Sequence Modeling', url: 'https://arxiv.org/abs/2312.xxxx', snippet: 'Selective state-space models as efficient alternatives to transformers...' },
      ],
    },
    {
      id: 'run-002',
      query: 'Best practices for RAG pipeline optimization with vector databases',
      status: 'completed',
      model: 'claude-3.5-sonnet',
      startTime: '5 hours ago',
      duration: '6m 18s',
      result: 'RAG pipeline optimization in 2024 involves several key strategies: (1) Chunk size optimization - typically 256-512 tokens with overlap; (2) Hybrid search combining dense and sparse retrieval; (3) Reranking with cross-encoder models; (4) Query decomposition for complex questions; (5) Metadata filtering for precise retrieval; (6) Caching strategies for frequent queries; (7) Evaluation frameworks using RAGAS metrics.',
      citations: [
        { title: 'RAGAS: Automated Evaluation of RAG', url: 'https://arxiv.org/abs/2309.xxxx', snippet: 'Framework for evaluating retrieval-augmented generation systems...' },
        { title: 'Hybrid Search in Production', url: 'https://www.pinecone.io/blog/hybrid-search', snippet: 'Combining BM25 and dense retrieval for improved relevance...' },
      ],
    },
    {
      id: 'run-003',
      query: 'Comparison of agent frameworks: LangGraph vs CrewAI vs AutoGen',
      status: 'running',
      model: 'gpt-4o',
      startTime: '12 min ago',
      duration: 'In progress...',
      result: undefined,
      citations: undefined,
    },
    {
      id: 'run-004',
      query: 'Latest developments in RLHF and DPO for LLM alignment',
      status: 'failed',
      model: 'llama-3.1-70b',
      startTime: '1 day ago',
      duration: '2m 15s (timeout)',
      result: undefined,
      citations: undefined,
    },
    {
      id: 'run-005',
      query: 'Edge deployment strategies for LLMs on mobile devices',
      status: 'completed',
      model: 'gpt-4o-mini',
      startTime: '1 day ago',
      duration: '3m 45s',
      result: 'Edge deployment of LLMs has made significant progress in 2024 through: (1) Quantization techniques (GPTQ, AWQ, GGUF) reducing model sizes by 75%+ with minimal quality loss; (2) On-device inference frameworks like MLX, llama.cpp, and MediaPipe; (3) Speculative decoding for faster inference; (4) Mixture-of-experts architectures for efficient routing; (5) Distillation techniques creating smaller capable models.',
      citations: [
        { title: 'AWQ: Activation-aware Weight Quantization', url: 'https://arxiv.org/abs/2306.xxxx', snippet: 'Efficient quantization preserving salient weights identified by activation...' },
      ],
    },
    {
      id: 'run-006',
      query: 'Security vulnerabilities in LLM prompt injection attacks',
      status: 'queued',
      model: 'claude-3-haiku',
      startTime: 'Queued',
      duration: 'Pending',
      result: undefined,
      citations: undefined,
    },
  ],
  agents: [
    { id: 'agent-lead', name: 'Lead Researcher', type: 'lead', status: 'busy', description: 'Orchestrates research workflow, delegates tasks, synthesizes findings', tasksCompleted: 47, lastActive: 'Now' },
    { id: 'agent-gp', name: 'General Purpose Agent', type: 'general-purpose', status: 'active', description: 'Handles web search, content analysis, and summarization tasks', tasksCompleted: 156, lastActive: '12 min ago' },
    { id: 'agent-bash', name: 'Bash Agent', type: 'bash', status: 'idle', description: 'Executes code, runs scripts, processes data files', tasksCompleted: 89, lastActive: '2 hours ago' },
  ],
  skills: [
    { id: 'sk-web-search', name: 'Web Search', description: 'Search the web for relevant information using multiple search engines', type: 'tool', enabled: true },
    { id: 'sk-crawl', name: 'Web Crawler', description: 'Crawl and extract content from web pages and documents', type: 'tool', enabled: true },
    { id: 'sk-code-exec', name: 'Code Execution', description: 'Execute Python code for data analysis and visualization', type: 'tool', enabled: true },
    { id: 'sk-summarize', name: 'Deep Summarization', description: 'Generate comprehensive summaries with multiple passes', type: 'skill', enabled: true },
    { id: 'sk-synthesize', name: 'Cross-Source Synthesis', description: 'Combine findings from multiple sources into coherent narratives', type: 'skill', enabled: true },
    { id: 'sk-fact-check', name: 'Fact Verification', description: 'Verify claims against multiple independent sources', type: 'skill', enabled: true },
    { id: 'sk-citation', name: 'Citation Extraction', description: 'Extract and format citations from research sources', type: 'skill', enabled: true },
    { id: 'sk-compare', name: 'Comparative Analysis', description: 'Structured comparison of technologies, frameworks, or approaches', type: 'skill', enabled: true },
    { id: 'sk-timeline', name: 'Timeline Builder', description: 'Construct chronological timelines from research data', type: 'skill', enabled: false },
    { id: 'sk-report', name: 'Report Generator', description: 'Generate formatted research reports in markdown or PDF', type: 'skill', enabled: true },
  ],
  availableModels: [
    'openai/gpt-4o',
    'openai/gpt-4o-mini',
    'anthropic/claude-3.5-sonnet',
    'anthropic/claude-3-haiku',
    'google/gemini-pro-1.5',
    'meta-llama/llama-3.1-70b-instruct',
    'mistralai/mixtral-8x7b-instruct',
  ],
};

const statusConfig = {
  running: { icon: Loader2, color: 'text-blue-500', animate: 'animate-spin', badge: 'bg-blue-500/10 text-blue-600 border-blue-200' },
  completed: { icon: CheckCircle2, color: 'text-emerald-500', animate: '', badge: 'bg-emerald-500/10 text-emerald-600 border-emerald-200' },
  failed: { icon: AlertCircle, color: 'text-red-500', animate: '', badge: 'bg-red-500/10 text-red-600 border-red-200' },
  queued: { icon: Clock, color: 'text-yellow-500', animate: '', badge: 'bg-yellow-500/10 text-yellow-600 border-yellow-200' },
};

const agentTypeConfig = {
  lead: { icon: Brain, color: 'bg-purple-100 dark:bg-purple-900/50 text-purple-600' },
  'general-purpose': { icon: Bot, color: 'bg-blue-100 dark:bg-blue-900/50 text-blue-600' },
  bash: { icon: Terminal, color: 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600' },
};

export function ResearchView() {
  const [data, setData] = useState<DeerFlowData>(defaultData);
  const [loading, setLoading] = useState(true);
  const [newQuery, setNewQuery] = useState('');
  const [selectedModel, setSelectedModel] = useState('openai/gpt-4o');
  const [expandedRuns, setExpandedRuns] = useState<Set<string>>(new Set(['run-001']));
  const [submitting, setSubmitting] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/deerflow');
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

  const toggleRun = (id: string) => {
    setExpandedRuns(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSubmitResearch = async () => {
    if (!newQuery.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/deerflow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: newQuery, model: selectedModel }),
      });
      if (res.ok) {
        const json = await res.json();
        setData(prev => ({
          ...prev,
          runs: [json.run, ...prev.runs],
        }));
        setNewQuery('');
      }
    } catch {
      // Submission failed
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <Card key={i} className="border-0 shadow-sm">
              <CardContent className="p-6">
                <Skeleton className="h-4 w-24 mb-3" />
                <Skeleton className="h-8 w-32 mb-2" />
                <Skeleton className="h-3 w-20" />
              </CardContent>
            </Card>
          ))}
        </div>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-6">
            <Skeleton className="h-6 w-40 mb-4" />
            <Skeleton className="h-64 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-0 shadow-sm bg-gradient-to-br from-purple-50 to-white dark:from-purple-950/30 dark:to-[#0a0a0b]">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium text-muted-foreground">DeerFlow Status</p>
              <Microscope className="w-5 h-5 text-purple-600" />
            </div>
            <div className="flex items-center gap-2">
              <Badge className={`border ${
                data.status === 'online' ? 'bg-emerald-500/10 text-emerald-600 border-emerald-200' :
                data.status === 'initializing' ? 'bg-yellow-500/10 text-yellow-600 border-yellow-200' :
                'bg-red-500/10 text-red-600 border-red-200'
              }`}>
                {data.status === 'online' ? '● Online' : data.status === 'initializing' ? '● Initializing' : '● Offline'}
              </Badge>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm bg-gradient-to-br from-blue-50 to-white dark:from-blue-950/30 dark:to-[#0a0a0b]">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium text-muted-foreground">Total Research Runs</p>
              <FileText className="w-5 h-5 text-blue-600" />
            </div>
            <p className="text-2xl font-bold">{data.runs.length}</p>
            <p className="text-xs text-muted-foreground">{data.runs.filter(r => r.status === 'completed').length} completed</p>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm bg-gradient-to-br from-emerald-50 to-white dark:from-emerald-950/30 dark:to-[#0a0a0b]">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium text-muted-foreground">Active Agents</p>
              <Bot className="w-5 h-5 text-emerald-600" />
            </div>
            <p className="text-2xl font-bold">{data.agents.filter(a => a.status !== 'idle').length} / {data.agents.length}</p>
            <p className="text-xs text-muted-foreground">{data.agents.reduce((acc, a) => acc + a.tasksCompleted, 0)} tasks completed</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Research Runs + New Research */}
        <div className="lg:col-span-2 space-y-6">
          {/* New Research Form */}
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Sparkles className="w-4 h-4" /> New Research Run
              </CardTitle>
              <CardDescription>Submit a deep research query to DeerFlow</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Enter your research query..."
                    value={newQuery}
                    onChange={(e) => setNewQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSubmitResearch()}
                    className="pl-9"
                  />
                </div>
                <Select value={selectedModel} onValueChange={setSelectedModel}>
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="Select model" />
                  </SelectTrigger>
                  <SelectContent>
                    {data.availableModels.map(model => (
                      <SelectItem key={model} value={model}>
                        {model.split('/').pop()}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  onClick={handleSubmitResearch}
                  disabled={submitting || !newQuery.trim()}
                  className="bg-purple-600 hover:bg-purple-700 text-white gap-2 shrink-0"
                >
                  {submitting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Play className="w-4 h-4" />
                  )}
                  Research
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Active Research Runs */}
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">Research Runs</CardTitle>
                  <CardDescription>Track and review deep research tasks</CardDescription>
                </div>
                <div className="flex gap-2">
                  <Badge variant="outline" className="text-xs">
                    {data.runs.filter(r => r.status === 'running').length} active
                  </Badge>
                  <Badge variant="outline" className="text-xs">
                    {data.runs.filter(r => r.status === 'completed').length} completed
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {data.runs.map((run) => {
                  const config = statusConfig[run.status];
                  const StatusIcon = config.icon;
                  const isExpanded = expandedRuns.has(run.id);

                  return (
                    <Collapsible
                      key={run.id}
                      open={isExpanded}
                      onOpenChange={() => toggleRun(run.id)}
                    >
                      <div className={`rounded-lg border transition-colors ${
                        run.status === 'running' ? 'border-blue-200 bg-blue-50/30 dark:border-blue-900/50 dark:bg-blue-950/20' :
                        run.status === 'failed' ? 'border-red-200 bg-red-50/30 dark:border-red-900/50 dark:bg-red-950/20' :
                        'hover:bg-muted/20'
                      }`}>
                        <CollapsibleTrigger className="w-full">
                          <div className="flex items-center gap-3 p-4">
                            <StatusIcon className={`w-4 h-4 shrink-0 ${config.color} ${config.animate}`} />
                            <div className="flex-1 min-w-0 text-left">
                              <p className="text-sm font-medium truncate">{run.query}</p>
                              <div className="flex items-center gap-3 mt-0.5">
                                <span className="text-xs text-muted-foreground flex items-center gap-1">
                                  <Timer className="w-3 h-3" /> {run.duration}
                                </span>
                                <span className="text-xs text-muted-foreground">{run.startTime}</span>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <Badge variant="secondary" className="text-[10px]">{run.model.split('/').pop()}</Badge>
                              <Badge className={`text-[10px] border ${config.badge}`}>{run.status}</Badge>
                              {isExpanded ? (
                                <ChevronDown className="w-4 h-4 text-muted-foreground" />
                              ) : (
                                <ChevronRight className="w-4 h-4 text-muted-foreground" />
                              )}
                            </div>
                          </div>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <div className="px-4 pb-4 pt-0">
                            <Separator className="mb-3" />
                            {run.result && (
                              <div className="mb-3">
                                <p className="text-xs font-medium text-muted-foreground mb-1.5">FINDINGS</p>
                                <p className="text-sm leading-relaxed text-foreground/90">{run.result}</p>
                              </div>
                            )}
                            {run.citations && run.citations.length > 0 && (
                              <div>
                                <p className="text-xs font-medium text-muted-foreground mb-1.5">CITATIONS</p>
                                <div className="space-y-2">
                                  {run.citations.map((citation, idx) => (
                                    <div key={idx} className="flex gap-2 p-2 bg-muted/30 rounded-md">
                                      <FileText className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                                      <div>
                                        <a
                                          href={citation.url}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="text-sm font-medium text-purple-600 hover:underline flex items-center gap-1"
                                        >
                                          {citation.title}
                                          <ExternalLink className="w-3 h-3" />
                                        </a>
                                        <p className="text-xs text-muted-foreground mt-0.5">{citation.snippet}</p>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                            {run.status === 'failed' && (
                              <div className="bg-red-50 dark:bg-red-950/30 p-3 rounded-md">
                                <p className="text-sm text-red-700 dark:text-red-400">Research run failed due to timeout. Try again with a simpler query or different model.</p>
                              </div>
                            )}
                            {run.status === 'running' && (
                              <div className="bg-blue-50 dark:bg-blue-950/30 p-3 rounded-md">
                                <p className="text-sm text-blue-700 dark:text-blue-400">Research in progress. The lead agent is coordinating sub-agents for this query...</p>
                              </div>
                            )}
                          </div>
                        </CollapsibleContent>
                      </div>
                    </Collapsible>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right: Agents + Skills */}
        <div className="space-y-6">
          {/* Available Agents */}
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Sub-Agents</CardTitle>
              <CardDescription>DeerFlow research agents</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {data.agents.map((agent) => {
                const typeConfig = agentTypeConfig[agent.type];
                const TypeIcon = typeConfig.icon;

                return (
                  <div key={agent.id} className="p-4 rounded-lg border bg-card hover:bg-muted/10 transition-colors">
                    <div className="flex items-start gap-3">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${typeConfig.color}`}>
                        <TypeIcon className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium">{agent.name}</p>
                          <Badge className={`text-[10px] border ${
                            agent.status === 'active' ? 'bg-emerald-500/10 text-emerald-600 border-emerald-200' :
                            agent.status === 'busy' ? 'bg-blue-500/10 text-blue-600 border-blue-200' :
                            'bg-gray-500/10 text-gray-600 border-gray-200'
                          }`}>
                            {agent.status}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">{agent.description}</p>
                        <div className="flex items-center gap-3 mt-1.5">
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" /> {agent.tasksCompleted} tasks
                          </span>
                          <span className="text-xs text-muted-foreground">{agent.lastActive}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {/* Skills & Tools */}
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">Skills & Tools</CardTitle>
                  <CardDescription>Available research capabilities</CardDescription>
                </div>
                <Badge variant="outline" className="text-xs">
                  {data.skills.filter(s => s.type === 'tool').length} tools · {data.skills.filter(s => s.type === 'skill').length} skills
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {data.skills.map((skill) => (
                  <div
                    key={skill.id}
                    className={`flex items-start gap-2.5 p-3 rounded-md transition-colors ${
                      skill.enabled ? 'bg-card hover:bg-muted/10' : 'bg-muted/5 opacity-60'
                    }`}
                  >
                    <div className={`w-7 h-7 rounded flex items-center justify-center shrink-0 ${
                      skill.type === 'tool' ? 'bg-orange-100 dark:bg-orange-900/50' : 'bg-purple-100 dark:bg-purple-900/50'
                    }`}>
                      {skill.type === 'tool' ? (
                        <Wrench className="w-3.5 h-3.5 text-orange-600" />
                      ) : (
                        <Zap className="w-3.5 h-3.5 text-purple-600" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm font-medium">{skill.name}</p>
                        <Badge variant="secondary" className="text-[9px] px-1 py-0">
                          {skill.type}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{skill.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Model Configuration */}
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Tag className="w-4 h-4" /> Model Config
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">Lead Agent Model</label>
                <Select defaultValue="openai/gpt-4o">
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {data.availableModels.map(m => (
                      <SelectItem key={m} value={m}>{m.split('/').pop()}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">Research Agent Model</label>
                <Select defaultValue="anthropic/claude-3.5-sonnet">
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {data.availableModels.map(m => (
                      <SelectItem key={m} value={m}>{m.split('/').pop()}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">Bash Agent Model</label>
                <Select defaultValue="meta-llama/llama-3.1-70b-instruct">
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {data.availableModels.map(m => (
                      <SelectItem key={m} value={m}>{m.split('/').pop()}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button className="w-full bg-purple-600 hover:bg-purple-700 text-white gap-2 mt-2" size="sm">
                <User className="w-3.5 h-3.5" /> Save Model Config
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
