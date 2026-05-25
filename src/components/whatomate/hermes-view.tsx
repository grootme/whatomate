'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Smartphone,
  Wifi,
  WifiOff,
  QrCode,
  Zap,
  Clock,
  RefreshCw,
  Send,
  Receive,
  Settings2,
  Brain,
  Timer,
  Play,
  Pause,
  CheckCircle2,
  XCircle,
  AlertCircle,
  MessageSquare,
  ArrowUpRight,
  ArrowDownLeft,
  Activity,
  Cpu,
  Globe,
  Server,
  Hash,
} from 'lucide-react';

interface WhatsAppMessage {
  id: string;
  from: string;
  to: string;
  text: string;
  timestamp: string;
  direction: 'incoming' | 'outgoing';
  status: 'sent' | 'delivered' | 'read' | 'pending';
}

interface HermesSkill {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  category: string;
}

interface CronJob {
  id: string;
  name: string;
  schedule: string;
  status: 'active' | 'paused' | 'error';
  lastRun: string;
  nextRun: string;
}

interface HermesData {
  connectionStatus: 'connected' | 'disconnected' | 'pairing';
  phoneNumber: string;
  lastSync: string;
  gatewayRunning: boolean;
  activePlatforms: string[];
  uptime: string;
  agentModel: string;
  temperature: number;
  maxIterations: number;
  messages: WhatsAppMessage[];
  skills: HermesSkill[];
  cronJobs: CronJob[];
}

const defaultHermesData: HermesData = {
  connectionStatus: 'connected',
  phoneNumber: '+1 (555) 987-6543',
  lastSync: '2 minutes ago',
  gatewayRunning: true,
  activePlatforms: ['WhatsApp', 'Telegram'],
  uptime: '14d 7h 32m',
  agentModel: 'openai/gpt-4o',
  temperature: 0.7,
  maxIterations: 10,
  messages: [
    { id: 'hm1', from: '+1 (555) 123-4567', to: '+1 (555) 987-6543', text: 'Hey, can you help me with my order status?', timestamp: '2 min ago', direction: 'incoming', status: 'read' },
    { id: 'hm2', from: '+1 (555) 987-6543', to: '+1 (555) 123-4567', text: 'Of course! Let me look up your order. Could you share your order number?', timestamp: '2 min ago', direction: 'outgoing', status: 'delivered' },
    { id: 'hm3', from: '+1 (555) 123-4567', to: '+1 (555) 987-6543', text: 'Sure, it\'s #ORD-2024-5847', timestamp: '1 min ago', direction: 'incoming', status: 'read' },
    { id: 'hm4', from: '+1 (555) 987-6543', to: '+1 (555) 123-4567', text: 'Your order #ORD-2024-5847 is currently in transit and expected to arrive by Friday.', timestamp: '1 min ago', direction: 'outgoing', status: 'sent' },
    { id: 'hm5', from: '+1 (555) 234-5678', to: '+1 (555) 987-6543', text: 'I need to reschedule my appointment', timestamp: '5 min ago', direction: 'incoming', status: 'read' },
    { id: 'hm6', from: '+1 (555) 987-6543', to: '+1 (555) 234-5678', text: 'I\'d be happy to help reschedule. What date and time works better for you?', timestamp: '5 min ago', direction: 'outgoing', status: 'read' },
    { id: 'hm7', from: '+1 (555) 345-6789', to: '+1 (555) 987-6543', text: 'What are your business hours?', timestamp: '12 min ago', direction: 'incoming', status: 'read' },
    { id: 'hm8', from: '+1 (555) 987-6543', to: '+1 (555) 345-6789', text: 'Our business hours are Mon-Fri 9AM-6PM EST. We also have weekend support from 10AM-4PM.', timestamp: '12 min ago', direction: 'outgoing', status: 'delivered' },
    { id: 'hm9', from: '+1 (555) 456-7890', to: '+1 (555) 987-6543', text: 'Is the premium plan worth it?', timestamp: '25 min ago', direction: 'incoming', status: 'read' },
    { id: 'hm10', from: '+1 (555) 987-6543', to: '+1 (555) 456-7890', text: 'The Premium plan includes priority support, unlimited chatbots, and advanced analytics. Many of our enterprise clients find great value in it!', timestamp: '25 min ago', direction: 'outgoing', status: 'read' },
    { id: 'hm11', from: '+1 (555) 567-8901', to: '+1 (555) 987-6543', text: 'How do I export my contacts?', timestamp: '1 hour ago', direction: 'incoming', status: 'read' },
    { id: 'hm12', from: '+1 (555) 987-6543', to: '+1 (555) 567-8901', text: 'You can export contacts from Settings > Data Management > Export. We support CSV and Excel formats.', timestamp: '1 hour ago', direction: 'outgoing', status: 'read' },
    { id: 'hm13', from: '+1 (555) 678-9012', to: '+1 (555) 987-6543', text: 'Thanks for the quick help earlier!', timestamp: '2 hours ago', direction: 'incoming', status: 'read' },
    { id: 'hm14', from: '+1 (555) 987-6543', to: '+1 (555) 678-9012', text: 'You\'re welcome! Don\'t hesitate to reach out anytime. 😊', timestamp: '2 hours ago', direction: 'outgoing', status: 'delivered' },
    { id: 'hm15', from: '+1 (555) 789-0123', to: '+1 (555) 987-6543', text: 'Can I integrate with Slack?', timestamp: '3 hours ago', direction: 'incoming', status: 'read' },
    { id: 'hm16', from: '+1 (555) 987-6543', to: '+1 (555) 789-0123', text: 'Yes! We have a native Slack integration. You can set it up from the Integrations page in your dashboard.', timestamp: '3 hours ago', direction: 'outgoing', status: 'read' },
    { id: 'hm17', from: '+1 (555) 890-1234', to: '+1 (555) 987-6543', text: 'My chatbot is not responding', timestamp: '4 hours ago', direction: 'incoming', status: 'read' },
    { id: 'hm18', from: '+1 (555) 987-6543', to: '+1 (555) 890-1234', text: 'I\'m sorry about that. Let me check your chatbot configuration. Could you tell me which flow is affected?', timestamp: '4 hours ago', direction: 'outgoing', status: 'delivered' },
    { id: 'hm19', from: '+1 (555) 901-2345', to: '+1 (555) 987-6543', text: 'Do you offer API access?', timestamp: '5 hours ago', direction: 'incoming', status: 'read' },
    { id: 'hm20', from: '+1 (555) 987-6543', to: '+1 (555) 901-2345', text: 'Absolutely! Our REST API is available on Business and Enterprise plans. Full documentation is at docs.whatomate.com/api', timestamp: '5 hours ago', direction: 'outgoing', status: 'read' },
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
    { id: 'cj1', name: 'Daily Report Generation', schedule: '0 8 * * *', status: 'active', lastRun: 'Today 8:00 AM', nextRun: 'Tomorrow 8:00 AM' },
    { id: 'cj2', name: 'Contact Sync', schedule: '*/30 * * * *', status: 'active', lastRun: '10 min ago', nextRun: 'In 20 min' },
    { id: 'cj3', name: 'Stale Conversation Cleanup', schedule: '0 2 * * *', status: 'active', lastRun: 'Today 2:00 AM', nextRun: 'Tomorrow 2:00 AM' },
    { id: 'cj4', name: 'Knowledge Base Indexing', schedule: '0 */6 * * *', status: 'active', lastRun: '4 hours ago', nextRun: 'In 2 hours' },
    { id: 'cj5', name: 'Lead Score Recalculation', schedule: '0 9 * * 1', status: 'paused', lastRun: 'Last Monday 9:00 AM', nextRun: 'Paused' },
    { id: 'cj6', name: 'Weekly Analytics Export', schedule: '0 6 * * 1', status: 'error', lastRun: 'Failed - 2 days ago', nextRun: 'Next Monday 6:00 AM' },
  ],
};

const statusColorMap = {
  connected: 'bg-emerald-500',
  disconnected: 'bg-red-500',
  pairing: 'bg-yellow-500',
};

const statusBadgeMap = {
  connected: 'bg-emerald-500/10 text-emerald-600 border-emerald-200',
  disconnected: 'bg-red-500/10 text-red-600 border-red-200',
  pairing: 'bg-yellow-500/10 text-yellow-600 border-yellow-200',
};

const messageStatusIcon = {
  sent: <Send className="w-3 h-3 text-gray-400" />,
  delivered: <CheckCircle2 className="w-3 h-3 text-gray-400" />,
  read: <CheckCircle2 className="w-3 h-3 text-emerald-500" />,
  pending: <Clock className="w-3 h-3 text-yellow-500" />,
};

export function HermesView() {
  const [data, setData] = useState<HermesData>(defaultHermesData);
  const [loading, setLoading] = useState(true);
  const [qrLoading, setQrLoading] = useState(false);
  const [qrImage, setQrImage] = useState<string | null>(null);
  const [agentModel, setAgentModel] = useState(data.agentModel);
  const [temperature, setTemperature] = useState(data.temperature);
  const [maxIterations, setMaxIterations] = useState(data.maxIterations);
  const [skills, setSkills] = useState(data.skills);

  const fetchHermesData = useCallback(async () => {
    try {
      const res = await fetch('/api/hermes');
      if (res.ok) {
        const json = await res.json();
        setData(json);
        setAgentModel(json.agentModel || defaultHermesData.agentModel);
        setTemperature(json.temperature ?? defaultHermesData.temperature);
        setMaxIterations(json.maxIterations ?? defaultHermesData.maxIterations);
        setSkills(json.skills || defaultHermesData.skills);
      }
    } catch {
      // Use default data
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHermesData();
  }, [fetchHermesData]);

  const handleGenerateQR = async () => {
    setQrLoading(true);
    try {
      const res = await fetch('/api/hermes/qr');
      if (res.ok) {
        const json = await res.json();
        if (json.qr) {
          setQrImage(json.qr);
        }
      }
    } catch {
      // QR generation failed
    } finally {
      setQrLoading(false);
    }
  };

  const toggleSkill = (skillId: string) => {
    setSkills(prev =>
      prev.map(s => s.id === skillId ? { ...s, enabled: !s.enabled } : s)
    );
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <Card key={i} className="border-0 shadow-sm">
              <CardContent className="p-6">
                <Skeleton className="h-4 w-24 mb-3" />
                <Skeleton className="h-8 w-32 mb-2" />
                <Skeleton className="h-3 w-20" />
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {[1, 2, 3, 4].map(i => (
            <Card key={i} className="border-0 shadow-sm">
              <CardContent className="p-6">
                <Skeleton className="h-6 w-40 mb-4" />
                <Skeleton className="h-32 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Status Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Connection Status Card */}
        <Card className="border-0 shadow-sm bg-gradient-to-br from-emerald-50 to-white dark:from-emerald-950/30 dark:to-[#0a0a0b]">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-medium text-muted-foreground">WhatsApp Status</p>
              <Smartphone className="w-5 h-5 text-emerald-600" />
            </div>
            <div className="flex items-center gap-2 mb-1">
              <div className={`w-2.5 h-2.5 rounded-full ${statusColorMap[data.connectionStatus]} animate-pulse`} />
              <p className="text-lg font-bold capitalize">{data.connectionStatus}</p>
            </div>
            <p className="text-xs text-muted-foreground">{data.phoneNumber}</p>
          </CardContent>
        </Card>

        {/* Gateway Status Card */}
        <Card className="border-0 shadow-sm bg-gradient-to-br from-blue-50 to-white dark:from-blue-950/30 dark:to-[#0a0a0b]">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-medium text-muted-foreground">Hermes Gateway</p>
              {data.gatewayRunning ? (
                <Server className="w-5 h-5 text-emerald-600" />
              ) : (
                <WifiOff className="w-5 h-5 text-red-500" />
              )}
            </div>
            <div className="flex items-center gap-2 mb-1">
              <Badge className={`${data.gatewayRunning ? 'bg-emerald-500/10 text-emerald-600 border-emerald-200' : 'bg-red-500/10 text-red-600 border-red-200'} border`}>
                {data.gatewayRunning ? 'Running' : 'Stopped'}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">Uptime: {data.uptime}</p>
          </CardContent>
        </Card>

        {/* Active Platforms Card */}
        <Card className="border-0 shadow-sm bg-gradient-to-br from-purple-50 to-white dark:from-purple-950/30 dark:to-[#0a0a0b]">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-medium text-muted-foreground">Active Platforms</p>
              <Globe className="w-5 h-5 text-purple-600" />
            </div>
            <p className="text-2xl font-bold mb-1">{data.activePlatforms.length}</p>
            <div className="flex gap-1.5 flex-wrap">
              {data.activePlatforms.map(p => (
                <Badge key={p} variant="secondary" className="text-xs">{p}</Badge>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Last Sync Card */}
        <Card className="border-0 shadow-sm bg-gradient-to-br from-orange-50 to-white dark:from-orange-950/30 dark:to-[#0a0a0b]">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-medium text-muted-foreground">Last Sync</p>
              <Clock className="w-5 h-5 text-orange-600" />
            </div>
            <p className="text-lg font-bold mb-1">{data.lastSync}</p>
            <Button variant="ghost" size="sm" className="text-xs h-7 px-2 text-orange-600">
              <RefreshCw className="w-3 h-3 mr-1" /> Sync Now
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Tabs */}
      <Tabs defaultValue="messages" className="w-full">
        <TabsList className="bg-muted/50 p-1">
          <TabsTrigger value="messages" className="gap-1.5 text-xs sm:text-sm">
            <MessageSquare className="w-4 h-4" /> Messages
          </TabsTrigger>
          <TabsTrigger value="pairing" className="gap-1.5 text-xs sm:text-sm">
            <QrCode className="w-4 h-4" /> Pairing
          </TabsTrigger>
          <TabsTrigger value="skills" className="gap-1.5 text-xs sm:text-sm">
            <Zap className="w-4 h-4" /> Skills
          </TabsTrigger>
          <TabsTrigger value="cron" className="gap-1.5 text-xs sm:text-sm">
            <Timer className="w-4 h-4" /> Cron Jobs
          </TabsTrigger>
          <TabsTrigger value="config" className="gap-1.5 text-xs sm:text-sm">
            <Settings2 className="w-4 h-4" /> Config
          </TabsTrigger>
        </TabsList>

        {/* Messages Tab */}
        <TabsContent value="messages" className="mt-4">
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">Recent WhatsApp Messages</CardTitle>
                  <CardDescription>Last {data.messages.length} messages received and sent</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">
                    <ArrowDownLeft className="w-3 h-3 mr-1 text-emerald-500" />
                    {data.messages.filter(m => m.direction === 'incoming').length} in
                  </Badge>
                  <Badge variant="outline" className="text-xs">
                    <ArrowUpRight className="w-3 h-3 mr-1 text-blue-500" />
                    {data.messages.filter(m => m.direction === 'outgoing').length} out
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[520px] pr-4">
                <div className="space-y-2">
                  {data.messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`flex gap-3 p-3 rounded-lg transition-colors ${
                        msg.direction === 'incoming'
                          ? 'bg-emerald-50/50 dark:bg-emerald-950/20 hover:bg-emerald-50 dark:hover:bg-emerald-950/30'
                          : 'bg-blue-50/50 dark:bg-blue-950/20 hover:bg-blue-50 dark:hover:bg-blue-950/30'
                      }`}
                    >
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                        msg.direction === 'incoming'
                          ? 'bg-emerald-100 dark:bg-emerald-900/50'
                          : 'bg-blue-100 dark:bg-blue-900/50'
                      }`}>
                        {msg.direction === 'incoming' ? (
                          <ArrowDownLeft className="w-4 h-4 text-emerald-600" />
                        ) : (
                          <ArrowUpRight className="w-4 h-4 text-blue-600" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-sm font-medium truncate">
                            {msg.direction === 'incoming' ? msg.from : 'Hermes Agent'}
                          </span>
                          <span className="text-xs text-muted-foreground">{msg.timestamp}</span>
                          <span className="ml-auto shrink-0">{messageStatusIcon[msg.status]}</span>
                        </div>
                        <p className="text-sm text-muted-foreground leading-relaxed">{msg.text}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Pairing Tab */}
        <TabsContent value="pairing" className="mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* QR Code Card */}
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">QR Code Pairing</CardTitle>
                <CardDescription>Scan with WhatsApp to link your device</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col items-center gap-4">
                <div className="w-64 h-64 border-2 border-dashed border-muted-foreground/20 rounded-xl flex items-center justify-center bg-white dark:bg-[#111]">
                  {qrImage ? (
                    <img src={qrImage} alt="WhatsApp QR Code" className="w-full h-full p-4" />
                  ) : (
                    <div className="text-center p-6">
                      <QrCode className="w-16 h-16 text-muted-foreground/30 mx-auto mb-3" />
                      <p className="text-sm text-muted-foreground">Click Generate QR to start pairing</p>
                    </div>
                  )}
                </div>
                <Button
                  onClick={handleGenerateQR}
                  disabled={qrLoading}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
                >
                  {qrLoading ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <QrCode className="w-4 h-4" />
                  )}
                  {qrLoading ? 'Generating...' : 'Generate QR Code'}
                </Button>
              </CardContent>
            </Card>

            {/* Connection Details Card */}
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Connection Details</CardTitle>
                <CardDescription>WhatsApp connection status and information</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                    <div className="flex items-center gap-2">
                      <Wifi className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm font-medium">Connection Status</span>
                    </div>
                    <Badge className={`border ${statusBadgeMap[data.connectionStatus]}`}>
                      {data.connectionStatus}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                    <div className="flex items-center gap-2">
                      <Smartphone className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm font-medium">Phone Number</span>
                    </div>
                    <span className="text-sm font-mono">{data.phoneNumber}</span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm font-medium">Last Sync</span>
                    </div>
                    <span className="text-sm">{data.lastSync}</span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                    <div className="flex items-center gap-2">
                      <Activity className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm font-medium">Bridge Health</span>
                    </div>
                    <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-200 border">Healthy</Badge>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                    <div className="flex items-center gap-2">
                      <Server className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm font-medium">Baileys Bridge</span>
                    </div>
                    <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-200 border">Running :3001</Badge>
                  </div>
                </div>

                <Separator />

                <div className="bg-amber-50 dark:bg-amber-950/30 p-3 rounded-lg">
                  <div className="flex gap-2">
                    <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-amber-800 dark:text-amber-400">Pairing Instructions</p>
                      <p className="text-xs text-amber-700 dark:text-amber-500 mt-1">
                        1. Open WhatsApp on your phone<br />
                        2. Go to Settings → Linked Devices<br />
                        3. Tap &quot;Link a Device&quot;<br />
                        4. Scan the QR code shown above
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Skills Tab */}
        <TabsContent value="skills" className="mt-4">
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">Hermes Skills</CardTitle>
                  <CardDescription>Configure active skills and capabilities</CardDescription>
                </div>
                <Badge variant="outline" className="text-xs">
                  {skills.filter(s => s.enabled).length} / {skills.length} active
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {skills.map((skill) => (
                  <div
                    key={skill.id}
                    className={`flex items-start gap-3 p-4 rounded-lg border transition-colors ${
                      skill.enabled
                        ? 'border-emerald-200 bg-emerald-50/30 dark:border-emerald-900/50 dark:bg-emerald-950/20'
                        : 'border-muted bg-muted/10'
                    }`}
                  >
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                      skill.enabled
                        ? 'bg-emerald-100 dark:bg-emerald-900/50'
                        : 'bg-muted'
                    }`}>
                      <Zap className={`w-4 h-4 ${skill.enabled ? 'text-emerald-600' : 'text-muted-foreground'}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium">{skill.name}</p>
                        <Switch
                          checked={skill.enabled}
                          onCheckedChange={() => toggleSkill(skill.id)}
                        />
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{skill.description}</p>
                      <Badge variant="secondary" className="text-[10px] mt-1.5">{skill.category}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Cron Jobs Tab */}
        <TabsContent value="cron" className="mt-4">
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">Scheduled Tasks</CardTitle>
                  <CardDescription>Cron jobs and automated tasks</CardDescription>
                </div>
                <Button size="sm" className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white">
                  <Play className="w-3.5 h-3.5" /> Add Task
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {data.cronJobs.map((job) => (
                  <div
                    key={job.id}
                    className="flex items-center gap-4 p-4 rounded-lg border bg-card hover:bg-muted/20 transition-colors"
                  >
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                      job.status === 'active' ? 'bg-emerald-100 dark:bg-emerald-900/50' :
                      job.status === 'paused' ? 'bg-yellow-100 dark:bg-yellow-900/50' :
                      'bg-red-100 dark:bg-red-900/50'
                    }`}>
                      {job.status === 'active' ? (
                        <Play className="w-4 h-4 text-emerald-600" />
                      ) : job.status === 'paused' ? (
                        <Pause className="w-4 h-4 text-yellow-600" />
                      ) : (
                        <XCircle className="w-4 h-4 text-red-600" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium">{job.name}</p>
                        <Badge
                          className={`text-[10px] border ${
                            job.status === 'active' ? 'bg-emerald-500/10 text-emerald-600 border-emerald-200' :
                            job.status === 'paused' ? 'bg-yellow-500/10 text-yellow-600 border-yellow-200' :
                            'bg-red-500/10 text-red-600 border-red-200'
                          }`}
                        >
                          {job.status}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Hash className="w-3 h-3" /> {job.schedule}
                        </span>
                        <span className="text-xs text-muted-foreground">Last: {job.lastRun}</span>
                        <span className="text-xs text-muted-foreground">Next: {job.nextRun}</span>
                      </div>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      {job.status === 'active' ? (
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <Pause className="w-4 h-4" />
                        </Button>
                      ) : (
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <Play className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Config Tab */}
        <TabsContent value="config" className="mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Model Configuration */}
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Brain className="w-4 h-4" /> Agent Configuration
                </CardTitle>
                <CardDescription>Configure the AI model and parameters</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Model</label>
                  <Select value={agentModel} onValueChange={setAgentModel}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select model" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="openai/gpt-4o">GPT-4o</SelectItem>
                      <SelectItem value="openai/gpt-4o-mini">GPT-4o Mini</SelectItem>
                      <SelectItem value="anthropic/claude-3.5-sonnet">Claude 3.5 Sonnet</SelectItem>
                      <SelectItem value="anthropic/claude-3-haiku">Claude 3 Haiku</SelectItem>
                      <SelectItem value="google/gemini-pro-1.5">Gemini Pro 1.5</SelectItem>
                      <SelectItem value="meta-llama/llama-3.1-70b-instruct">Llama 3.1 70B</SelectItem>
                      <SelectItem value="mistralai/mixtral-8x7b-instruct">Mixtral 8x7B</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">OpenRouter model identifier for the agent</p>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium">Temperature</label>
                    <span className="text-sm font-mono text-muted-foreground">{temperature.toFixed(1)}</span>
                  </div>
                  <Slider
                    value={[temperature]}
                    onValueChange={([v]) => setTemperature(v)}
                    min={0}
                    max={2}
                    step={0.1}
                    className="w-full"
                  />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Precise</span>
                    <span>Creative</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium">Max Iterations</label>
                    <span className="text-sm font-mono text-muted-foreground">{maxIterations}</span>
                  </div>
                  <Slider
                    value={[maxIterations]}
                    onValueChange={([v]) => setMaxIterations(v)}
                    min={1}
                    max={50}
                    step={1}
                    className="w-full"
                  />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Quick</span>
                    <span>Thorough</span>
                  </div>
                </div>

                <Button className="w-full bg-emerald-600 hover:bg-emerald-700 text-white gap-2">
                  <Cpu className="w-4 h-4" /> Save Configuration
                </Button>
              </CardContent>
            </Card>

            {/* Gateway Info */}
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Server className="w-4 h-4" /> Gateway Information
                </CardTitle>
                <CardDescription>Hermes gateway runtime details</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  {[
                    { label: 'Gateway Version', value: 'v2.4.1' },
                    { label: 'Runtime', value: 'Node.js 20.x' },
                    { label: 'Baileys Version', value: 'v6.7.8' },
                    { label: 'Protocol', value: 'WebSocket' },
                    { label: 'Bridge Endpoint', value: '127.0.0.1:3001' },
                    { label: 'API Endpoint', value: '127.0.0.1:3002' },
                    { label: 'Memory Usage', value: '128 MB' },
                    { label: 'Uptime', value: data.uptime },
                  ].map((item) => (
                    <div key={item.label} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                      <span className="text-sm text-muted-foreground">{item.label}</span>
                      <span className="text-sm font-medium font-mono">{item.value}</span>
                    </div>
                  ))}
                </div>

                <Separator />

                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1 gap-2">
                    <RefreshCw className="w-4 h-4" /> Restart Gateway
                  </Button>
                  <Button variant="outline" className="flex-1 gap-2">
                    <Activity className="w-4 h-4" /> View Logs
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
