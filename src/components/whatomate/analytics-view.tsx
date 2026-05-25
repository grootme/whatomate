'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from '@/components/ui/chart';
import {
  Bar,
  BarChart,
  Line,
  LineChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Area,
  AreaChart,
} from 'recharts';
import {
  TrendingUp,
  Users,
  MessageSquare,
  Clock,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react';
import { mockMonthlyAnalytics, mockWeeklyAnalytics } from '@/lib/mock-data';

const weeklyChartConfig = {
  sent: { label: 'Sent', color: '#25D366' },
  received: { label: 'Received', color: '#128C7E' },
} satisfies ChartConfig;

const monthlyChartConfig = {
  conversations: { label: 'Conversations', color: '#25D366' },
  messages: { label: 'Messages', color: '#128C7E' },
} satisfies ChartConfig;

const responseTimeData = [
  { hour: '6AM', avg: 2.1 },
  { hour: '8AM', avg: 3.4 },
  { hour: '10AM', avg: 4.2 },
  { hour: '12PM', avg: 3.8 },
  { hour: '2PM', avg: 2.9 },
  { hour: '4PM', avg: 3.1 },
  { hour: '6PM', avg: 2.5 },
  { hour: '8PM', avg: 1.8 },
];

const responseChartConfig = {
  avg: { label: 'Avg Response (min)', color: '#25D366' },
} satisfies ChartConfig;

export function AnalyticsView() {
  const kpiCards = [
    {
      title: 'Total Conversations',
      value: '2,570',
      change: '+12.3%',
      trend: 'up',
      icon: MessageSquare,
      color: 'bg-[#25D366]/10 text-[#25D366]',
    },
    {
      title: 'Response Rate',
      value: '94.2%',
      change: '+2.1%',
      trend: 'up',
      icon: TrendingUp,
      color: 'bg-blue-500/10 text-blue-500',
    },
    {
      title: 'Avg Response Time',
      value: '3.2 min',
      change: '-0.5 min',
      trend: 'up',
      icon: Clock,
      color: 'bg-purple-500/10 text-purple-500',
    },
    {
      title: 'Active Users',
      value: '1,847',
      change: '+8.7%',
      trend: 'up',
      icon: Users,
      color: 'bg-orange-500/10 text-orange-500',
    },
  ];

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpiCards.map((kpi) => (
          <Card key={kpi.title} className="border-0 shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{kpi.title}</p>
                  <p className="text-2xl font-bold mt-1">{kpi.value}</p>
                </div>
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${kpi.color}`}>
                  <kpi.icon className="w-5 h-5" />
                </div>
              </div>
              <div className="flex items-center gap-1 mt-2">
                {kpi.trend === 'up' ? (
                  <ArrowUpRight className="w-3.5 h-3.5 text-green-500" />
                ) : (
                  <ArrowDownRight className="w-3.5 h-3.5 text-red-500" />
                )}
                <span className="text-xs font-medium text-green-500">{kpi.change}</span>
                <span className="text-xs text-muted-foreground">vs last period</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="weekly">
        <TabsList>
          <TabsTrigger value="weekly">Weekly</TabsTrigger>
          <TabsTrigger value="monthly">Monthly</TabsTrigger>
        </TabsList>

        <TabsContent value="weekly" className="mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Weekly Message Volume */}
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Message Volume</CardTitle>
                  <Badge variant="secondary" className="text-xs">This Week</Badge>
                </div>
              </CardHeader>
              <CardContent>
                <ChartContainer config={weeklyChartConfig} className="h-[300px] w-full">
                  <BarChart data={mockWeeklyAnalytics} barGap={4}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                    <XAxis dataKey="day" tickLine={false} axisLine={false} fontSize={12} />
                    <YAxis tickLine={false} axisLine={false} fontSize={12} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <ChartLegend content={<ChartLegendContent />} />
                    <Bar dataKey="sent" fill="var(--color-sent)" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="received" fill="var(--color-received)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ChartContainer>
              </CardContent>
            </Card>

            {/* Response Time */}
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Avg Response Time</CardTitle>
                  <Badge variant="secondary" className="text-xs">Today</Badge>
                </div>
              </CardHeader>
              <CardContent>
                <ChartContainer config={responseChartConfig} className="h-[300px] w-full">
                  <AreaChart data={responseTimeData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                    <XAxis dataKey="hour" tickLine={false} axisLine={false} fontSize={12} />
                    <YAxis tickLine={false} axisLine={false} fontSize={12} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <defs>
                      <linearGradient id="fillAvg" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--color-avg)" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="var(--color-avg)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <Area
                      type="monotone"
                      dataKey="avg"
                      stroke="var(--color-avg)"
                      fill="url(#fillAvg)"
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ChartContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="monthly" className="mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Monthly Conversations */}
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Conversations Trend</CardTitle>
                  <Badge variant="secondary" className="text-xs">6 Months</Badge>
                </div>
              </CardHeader>
              <CardContent>
                <ChartContainer config={monthlyChartConfig} className="h-[300px] w-full">
                  <LineChart data={mockMonthlyAnalytics}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                    <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={12} />
                    <YAxis tickLine={false} axisLine={false} fontSize={12} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <ChartLegend content={<ChartLegendContent />} />
                    <Line
                      type="monotone"
                      dataKey="conversations"
                      stroke="var(--color-conversations)"
                      strokeWidth={2}
                      dot={{ fill: 'var(--color-conversations)', r: 4 }}
                    />
                  </LineChart>
                </ChartContainer>
              </CardContent>
            </Card>

            {/* Monthly Messages */}
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Messages Trend</CardTitle>
                  <Badge variant="secondary" className="text-xs">6 Months</Badge>
                </div>
              </CardHeader>
              <CardContent>
                <ChartContainer config={monthlyChartConfig} className="h-[300px] w-full">
                  <AreaChart data={mockMonthlyAnalytics}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                    <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={12} />
                    <YAxis tickLine={false} axisLine={false} fontSize={12} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <defs>
                      <linearGradient id="fillMessages" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--color-messages)" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="var(--color-messages)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <Area
                      type="monotone"
                      dataKey="messages"
                      stroke="var(--color-messages)"
                      fill="url(#fillMessages)"
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ChartContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
