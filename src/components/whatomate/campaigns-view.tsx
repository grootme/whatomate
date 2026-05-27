'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
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
  Play,
  Pause,
  MoreVertical,
  Send,
  Eye,
  Calendar,
  Clock,
  CheckCircle2,
  Edit,
  Trash2,
  BarChart3,
  Loader2,
} from 'lucide-react';

interface Campaign {
  id: string;
  name: string;
  status: 'draft' | 'scheduled' | 'running' | 'completed' | 'paused';
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

export function CampaignsView() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/hermes/campaigns')
      .then((res) => res.json())
      .then((data) => setCampaigns(data.campaigns || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { className: string; icon: React.ReactNode }> = {
      completed: { className: 'bg-green-100 text-green-700 border-0', icon: <CheckCircle2 className="w-3 h-3" /> },
      running: { className: 'bg-blue-100 text-blue-700 border-0', icon: <Play className="w-3 h-3" /> },
      scheduled: { className: 'bg-yellow-100 text-yellow-700 border-0', icon: <Clock className="w-3 h-3" /> },
      draft: { className: 'bg-gray-100 text-gray-600 border-0', icon: <Edit className="w-3 h-3" /> },
      paused: { className: 'bg-orange-100 text-orange-700 border-0', icon: <Pause className="w-3 h-3" /> },
    };
    const variant = variants[status] || variants.draft;
    return (
      <Badge className={`${variant.className} gap-1`}>
        {variant.icon}
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    );
  };

  const getProgress = (campaign: Campaign) => {
    if (campaign.totalRecipients === 0) return 0;
    return Math.round((campaign.sent / campaign.totalRecipients) * 100);
  };

  const campaignStats = [
    { label: 'Total Campaigns', value: campaigns.length, icon: BarChart3, color: 'text-[#25D366]' },
    { label: 'Active', value: campaigns.filter(c => c.status === 'running').length, icon: Play, color: 'text-blue-500' },
    { label: 'Completed', value: campaigns.filter(c => c.status === 'completed').length, icon: CheckCircle2, color: 'text-green-500' },
    { label: 'Scheduled', value: campaigns.filter(c => c.status === 'scheduled').length, icon: Calendar, color: 'text-yellow-500' },
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
        {campaignStats.map((stat) => (
          <Card key={stat.label} className="border-0 shadow-sm">
            <CardContent className="p-4 flex items-center gap-3">
              <stat.icon className={`w-8 h-8 ${stat.color}`} />
              <div>
                <p className="text-2xl font-bold">{stat.value}</p>
                <p className="text-xs text-muted-foreground">{stat.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">All Campaigns</h3>
        <Button className="bg-[#25D366] hover:bg-[#128C7E] text-white">
          <Plus className="w-4 h-4 mr-2" />
          New Campaign
        </Button>
      </div>

      {/* Campaigns Table */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-0">
          {campaigns.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Campaign</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden sm:table-cell">Template</TableHead>
                  <TableHead className="hidden md:table-cell">Progress</TableHead>
                  <TableHead className="hidden lg:table-cell">Stats</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {campaigns.map((campaign) => (
                  <TableRow key={campaign.id} className="hover:bg-muted/30">
                    <TableCell>
                      <div>
                        <p className="font-medium text-sm">{campaign.name}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {campaign.totalRecipients.toLocaleString()} recipients
                          {campaign.scheduledAt && ` · Scheduled: ${new Date(campaign.scheduledAt).toLocaleDateString()}`}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>{getStatusBadge(campaign.status)}</TableCell>
                    <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">
                      {campaign.templateName}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <div className="w-32">
                        <Progress value={getProgress(campaign)} className="h-2" />
                        <p className="text-[11px] text-muted-foreground mt-1">
                          {getProgress(campaign)}% sent
                        </p>
                      </div>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <div className="flex items-center gap-3 text-xs">
                        <span className="flex items-center gap-1" title="Sent">
                          <Send className="w-3 h-3 text-muted-foreground" />
                          {campaign.sent.toLocaleString()}
                        </span>
                        <span className="flex items-center gap-1" title="Delivered">
                          <Eye className="w-3 h-3 text-muted-foreground" />
                          {campaign.delivered.toLocaleString()}
                        </span>
                      </div>
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
                            <BarChart3 className="w-4 h-4 mr-2" />
                            View Report
                          </DropdownMenuItem>
                          {campaign.status === 'running' && (
                            <DropdownMenuItem>
                              <Pause className="w-4 h-4 mr-2" />
                              Pause
                            </DropdownMenuItem>
                          )}
                          {campaign.status === 'paused' && (
                            <DropdownMenuItem>
                              <Play className="w-4 h-4 mr-2" />
                              Resume
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem>
                            <Edit className="w-4 h-4 mr-2" />
                            Edit
                          </DropdownMenuItem>
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
              No campaigns found. Connect Hermes to manage WhatsApp campaigns.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
