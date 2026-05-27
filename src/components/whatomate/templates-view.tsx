'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Search,
  Plus,
  FileText,
  Clock,
  CheckCircle2,
  XCircle,
  Copy,
  Eye,
  Loader2,
} from 'lucide-react';

interface Template {
  id: string;
  name: string;
  category: 'marketing' | 'utility' | 'authentication';
  status: 'approved' | 'pending' | 'rejected';
  language: string;
  body: string;
  createdAt: string;
}

export function TemplatesView() {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('all');
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/hermes/templates')
      .then((res) => res.json())
      .then((data) => setTemplates(data.templates || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const filteredTemplates = templates.filter(t => {
    const matchesSearch =
      t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.body.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesTab = activeTab === 'all' || t.category === activeTab || (activeTab === 'status' && true);
    return matchesSearch && matchesTab;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved':
        return (
          <Badge className="bg-green-100 text-green-700 border-0 gap-1">
            <CheckCircle2 className="w-3 h-3" />
            Approved
          </Badge>
        );
      case 'pending':
        return (
          <Badge className="bg-yellow-100 text-yellow-700 border-0 gap-1">
            <Clock className="w-3 h-3" />
            Pending
          </Badge>
        );
      case 'rejected':
        return (
          <Badge className="bg-red-100 text-red-700 border-0 gap-1">
            <XCircle className="w-3 h-3" />
            Rejected
          </Badge>
        );
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'marketing':
        return 'bg-blue-100 text-blue-700 border-0';
      case 'utility':
        return 'bg-green-100 text-green-700 border-0';
      case 'authentication':
        return 'bg-purple-100 text-purple-700 border-0';
      default:
        return 'bg-gray-100 text-gray-700 border-0';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-[#25D366]" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search templates..."
            className="pl-9"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <Button className="bg-[#25D366] hover:bg-[#128C7E] text-white">
          <Plus className="w-4 h-4 mr-2" />
          Create Template
        </Button>
      </div>

      {/* Category Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="all">All ({templates.length})</TabsTrigger>
          <TabsTrigger value="marketing">Marketing ({templates.filter(t => t.category === 'marketing').length})</TabsTrigger>
          <TabsTrigger value="utility">Utility ({templates.filter(t => t.category === 'utility').length})</TabsTrigger>
          <TabsTrigger value="authentication">Auth ({templates.filter(t => t.category === 'authentication').length})</TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="mt-4">
          {filteredTemplates.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredTemplates.map((template) => (
                <Card key={template.id} className="border-0 shadow-sm hover:shadow-md transition-shadow group">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-[#25D366]/10 flex items-center justify-center">
                          <FileText className="w-4 h-4 text-[#25D366]" />
                        </div>
                        <div>
                          <CardTitle className="text-sm font-mono">{template.name}</CardTitle>
                        </div>
                      </div>
                      {getStatusBadge(template.status)}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <CardDescription className="text-xs line-clamp-3 leading-relaxed">
                      &quot;{template.body}&quot;
                    </CardDescription>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="secondary" className={getCategoryColor(template.category)}>
                        {template.category}
                      </Badge>
                      <Badge variant="secondary" className="text-[10px]">
                        {template.language?.toUpperCase() || 'EN'}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between pt-2 border-t">
                      <span className="text-[11px] text-muted-foreground">
                        Created: {template.createdAt}
                      </span>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button variant="ghost" size="icon" className="h-7 w-7">
                          <Copy className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7">
                          <Eye className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="py-12 text-center text-muted-foreground text-sm">
              No templates found. Connect Hermes to access WhatsApp Business templates.
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
