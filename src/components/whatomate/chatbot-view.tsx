'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Plus,
  Bot,
  MoreVertical,
  Play,
  Pause,
  Edit,
  Trash2,
  Copy,
  Workflow,
  GitBranch,
  Zap,
  ArrowRight,
  Loader2,
} from 'lucide-react';

interface ChatbotFlow {
  id: string;
  name: string;
  status: 'active' | 'inactive' | 'draft';
  triggerKeyword: string;
  nodes: number;
  lastModified: string;
}

export function ChatbotView() {
  const [flows, setFlows] = useState<ChatbotFlow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/hermes/chatbot')
      .then((res) => res.json())
      .then((data) => setFlows(data.flows || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge className="bg-green-100 text-green-700 border-0 gap-1"><Play className="w-3 h-3" /> Active</Badge>;
      case 'inactive':
        return <Badge className="bg-gray-100 text-gray-600 border-0 gap-1"><Pause className="w-3 h-3" /> Inactive</Badge>;
      case 'draft':
        return <Badge className="bg-yellow-100 text-yellow-700 border-0 gap-1"><Edit className="w-3 h-3" /> Draft</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const quickStats = [
    { label: 'Active Flows', value: flows.filter(f => f.status === 'active').length, icon: Zap, color: 'bg-[#25D366]/10 text-[#25D366]' },
    { label: 'Total Nodes', value: flows.reduce((acc, f) => acc + f.nodes, 0), icon: GitBranch, color: 'bg-blue-500/10 text-blue-500' },
    { label: 'Total Flows', value: flows.length, icon: Bot, color: 'bg-purple-500/10 text-purple-500' },
    { label: 'Draft Flows', value: flows.filter(f => f.status === 'draft').length, icon: Workflow, color: 'bg-orange-500/10 text-orange-500' },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-[#25D366]" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {quickStats.map((stat) => (
          <Card key={stat.label} className="border-0 shadow-sm">
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${stat.color}`}>
                <stat.icon className="w-5 h-5" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stat.value}</p>
                <p className="text-xs text-muted-foreground">{stat.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Flow Builder CTA */}
      <Card className="border-0 shadow-sm bg-gradient-to-r from-[#075E54] to-[#128C7E] text-white">
        <CardContent className="p-6 flex flex-col sm:flex-row items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-white/20 flex items-center justify-center shrink-0">
            <Workflow className="w-8 h-8" />
          </div>
          <div className="flex-1 text-center sm:text-left">
            <h3 className="text-lg font-semibold">Flow Builder</h3>
            <p className="text-white/80 text-sm mt-1">
              Create powerful conversational flows with our visual drag-and-drop builder.
              Design multi-step automations with conditions, API calls, and agent transfers.
            </p>
          </div>
          <Button className="bg-white text-[#075E54] hover:bg-white/90 shrink-0">
            Open Builder <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </CardContent>
      </Card>

      {/* Flows Table */}
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Chatbot Flows</h3>
        <Button className="bg-[#25D366] hover:bg-[#128C7E] text-white">
          <Plus className="w-4 h-4 mr-2" />
          New Flow
        </Button>
      </div>

      <Card className="border-0 shadow-sm">
        <CardContent className="p-0">
          {flows.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Flow Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden sm:table-cell">Trigger</TableHead>
                  <TableHead className="hidden md:table-cell">Nodes</TableHead>
                  <TableHead className="hidden lg:table-cell">Last Modified</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {flows.map((flow) => (
                  <TableRow key={flow.id} className="hover:bg-muted/30">
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-[#25D366]/10 flex items-center justify-center">
                          <Bot className="w-4 h-4 text-[#25D366]" />
                        </div>
                        <div>
                          <p className="font-medium text-sm">{flow.name}</p>
                          <p className="text-xs text-muted-foreground sm:hidden">
                            Trigger: {flow.triggerKeyword}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>{getStatusBadge(flow.status)}</TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <Badge variant="outline" className="font-mono text-xs">
                        {flow.triggerKeyword}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                      {flow.nodes} nodes
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                      {flow.lastModified}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreVertical className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem>
                            <Edit className="w-4 h-4 mr-2" />
                            Edit Flow
                          </DropdownMenuItem>
                          <DropdownMenuItem>
                            <Copy className="w-4 h-4 mr-2" />
                            Duplicate
                          </DropdownMenuItem>
                          {flow.status === 'active' ? (
                            <DropdownMenuItem>
                              <Pause className="w-4 h-4 mr-2" />
                              Deactivate
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem>
                              <Play className="w-4 h-4 mr-2" />
                              Activate
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem className="text-destructive">
                            <Trash2 className="w-4 h-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="py-12 text-center text-muted-foreground text-sm">
              No chatbot flows found. Connect Hermes to manage WhatsApp chatbot flows.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
