'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Users,
  MessageSquare,
  Send,
  FileText,
  TrendingUp,
  TrendingDown,
  Plus,
  Zap,
  ArrowRight,
} from 'lucide-react';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { Bar, BarChart, XAxis, YAxis, CartesianGrid } from 'recharts';
import {
  mockDashboardStats,
  mockConversations,
  mockWeeklyAnalytics,
} from '@/lib/mock-data';

const chartConfig = {
  sent: {
    label: 'Sent',
    color: '#25D366',
  },
  received: {
    label: 'Received',
    color: '#128C7E',
  },
} satisfies ChartConfig;

export function DashboardView() {
  const stats = [
    {
      title: 'Total Contacts',
      value: mockDashboardStats.totalContacts.toLocaleString(),
      change: `+${mockDashboardStats.contactGrowth}%`,
      trend: 'up' as const,
      icon: Users,
      color: 'bg-[#25D366]/10 text-[#25D366]',
    },
    {
      title: 'Active Conversations',
      value: mockDashboardStats.activeConversations.toLocaleString(),
      change: `${mockDashboardStats.conversationGrowth}%`,
      trend: 'down' as const,
      icon: MessageSquare,
      color: 'bg-blue-500/10 text-blue-500',
    },
    {
      title: 'Messages Sent',
      value: mockDashboardStats.messagesSent.toLocaleString(),
      change: `+${mockDashboardStats.messageGrowth}%`,
      trend: 'up' as const,
      icon: Send,
      color: 'bg-orange-500/10 text-orange-500',
    },
    {
      title: 'Templates',
      value: mockDashboardStats.templates.toString(),
      change: `+${mockDashboardStats.templateGrowth}%`,
      trend: 'up' as const,
      icon: FileText,
      color: 'bg-purple-500/10 text-purple-500',
    },
  ];

  const quickActions = [
    { label: 'New Message', icon: Send, color: 'bg-[#25D366] hover:bg-[#128C7E]' },
    { label: 'Add Contact', icon: Plus, color: 'bg-[#075E54] hover:bg-[#128C7E]' },
    { label: 'Create Template', icon: FileText, color: 'bg-[#128C7E] hover:bg-[#075E54]' },
    { label: 'Start Campaign', icon: Zap, color: 'bg-[#25D366] hover:bg-[#128C7E]' },
  ];

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <Card key={stat.title} className="border-0 shadow-sm hover:shadow-md transition-shadow">
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-muted-foreground font-medium">{stat.title}</p>
                  <p className="text-2xl font-bold mt-1">{stat.value}</p>
                </div>
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${stat.color}`}>
                  <stat.icon className="w-5 h-5" />
                </div>
              </div>
              <div className="flex items-center gap-1 mt-2">
                {stat.trend === 'up' ? (
                  <TrendingUp className="w-3.5 h-3.5 text-green-500" />
                ) : (
                  <TrendingDown className="w-3.5 h-3.5 text-red-500" />
                )}
                <span className={`text-xs font-medium ${stat.trend === 'up' ? 'text-green-500' : 'text-red-500'}`}>
                  {stat.change}
                </span>
                <span className="text-xs text-muted-foreground">vs last month</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Message Analytics Chart */}
        <Card className="lg:col-span-2 border-0 shadow-sm">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Message Analytics</CardTitle>
              <Badge variant="secondary" className="text-xs">This Week</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig} className="h-[280px] w-full">
              <BarChart data={mockWeeklyAnalytics} barGap={4}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                <XAxis
                  dataKey="day"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  fontSize={12}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  fontSize={12}
                />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="sent" fill="var(--color-sent)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="received" fill="var(--color-received)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {quickActions.map((action) => (
              <Button
                key={action.label}
                className={`w-full justify-start text-white ${action.color}`}
                variant="default"
              >
                <action.icon className="w-4 h-4 mr-2" />
                {action.label}
              </Button>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Recent Conversations */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Recent Conversations</CardTitle>
            <Button variant="ghost" size="sm" className="text-[#25D366] hover:text-[#128C7E]">
              View all <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-1">
            {mockConversations.map((conv) => (
              <div
                key={conv.id}
                className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer"
              >
                <Avatar className="h-10 w-10 shrink-0">
                  <AvatarFallback className="bg-[#25D366]/10 text-[#25D366] text-sm font-semibold">
                    {conv.contactName.split(' ').map(n => n[0]).join('')}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-sm truncate">{conv.contactName}</p>
                    <span className="text-xs text-muted-foreground whitespace-nowrap ml-2">
                      {conv.lastMessageTime}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">
                    {conv.lastMessage}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge
                    variant={
                      conv.status === 'active' ? 'default' :
                      conv.status === 'pending' ? 'secondary' : 'outline'
                    }
                    className={`text-[10px] ${
                      conv.status === 'active' ? 'bg-[#25D366] text-white border-0' :
                      conv.status === 'pending' ? 'bg-orange-100 text-orange-700 border-0' :
                      'bg-gray-100 text-gray-600 border-0'
                    }`}
                  >
                    {conv.status}
                  </Badge>
                  {conv.unreadCount > 0 && (
                    <span className="bg-[#25D366] text-white text-[10px] font-bold w-5 h-5 flex items-center justify-center rounded-full">
                      {conv.unreadCount}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
