'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import {
  User,
  Bell,
  Shield,
  Globe,
  Key,
  Webhook,
  Phone,
  Save,
  MessageSquare,
} from 'lucide-react';

export function SettingsView() {
  const [notifications, setNotifications] = useState({
    newMessage: true,
    campaignComplete: true,
    templateApproved: false,
    weeklyReport: true,
  });

  return (
    <div className="space-y-6">
      <Tabs defaultValue="profile" className="space-y-4">
        <TabsList className="flex-wrap">
          <TabsTrigger value="profile" className="gap-1.5">
            <User className="w-4 h-4" />
            <span className="hidden sm:inline">Profile</span>
          </TabsTrigger>
          <TabsTrigger value="notifications" className="gap-1.5">
            <Bell className="w-4 h-4" />
            <span className="hidden sm:inline">Notifications</span>
          </TabsTrigger>
          <TabsTrigger value="whatsapp" className="gap-1.5">
            <Phone className="w-4 h-4" />
            <span className="hidden sm:inline">WhatsApp</span>
          </TabsTrigger>
          <TabsTrigger value="api" className="gap-1.5">
            <Key className="w-4 h-4" />
            <span className="hidden sm:inline">API</span>
          </TabsTrigger>
          <TabsTrigger value="security" className="gap-1.5">
            <Shield className="w-4 h-4" />
            <span className="hidden sm:inline">Security</span>
          </TabsTrigger>
        </TabsList>

        {/* Profile Settings */}
        <TabsContent value="profile">
          <Card className="border-0 shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">Profile Settings</CardTitle>
              <CardDescription>Manage your account information</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-full bg-[#25D366] flex items-center justify-center text-white text-xl font-bold">
                  AU
                </div>
                <div>
                  <Button variant="outline" size="sm">Change Avatar</Button>
                  <p className="text-xs text-muted-foreground mt-1">JPG, PNG up to 5MB</p>
                </div>
              </div>
              <Separator />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="firstName">First Name</Label>
                  <Input id="firstName" defaultValue="Admin" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">Last Name</Label>
                  <Input id="lastName" defaultValue="User" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" defaultValue="admin@whatomate.com" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone</Label>
                  <Input id="phone" defaultValue="+1 (555) 000-0000" />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="timezone">Timezone</Label>
                <Input id="timezone" defaultValue="America/New_York (UTC-5)" />
              </div>
              <div className="flex justify-end">
                <Button className="bg-[#25D366] hover:bg-[#128C7E] text-white">
                  <Save className="w-4 h-4 mr-2" />
                  Save Changes
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Notifications Settings */}
        <TabsContent value="notifications">
          <Card className="border-0 shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">Notification Preferences</CardTitle>
              <CardDescription>Choose what notifications you want to receive</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {[
                { key: 'newMessage', label: 'New Messages', desc: 'Get notified when you receive a new message' },
                { key: 'campaignComplete', label: 'Campaign Completed', desc: 'Get notified when a campaign finishes' },
                { key: 'templateApproved', label: 'Template Approved', desc: 'Get notified when a template is approved' },
                { key: 'weeklyReport', label: 'Weekly Report', desc: 'Receive a weekly summary via email' },
              ].map((item) => (
                <div key={item.key} className="flex items-center justify-between py-2">
                  <div>
                    <p className="font-medium text-sm">{item.label}</p>
                    <p className="text-xs text-muted-foreground">{item.desc}</p>
                  </div>
                  <Switch
                    checked={notifications[item.key as keyof typeof notifications]}
                    onCheckedChange={(checked) =>
                      setNotifications(prev => ({ ...prev, [item.key]: checked }))
                    }
                  />
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* WhatsApp Settings */}
        <TabsContent value="whatsapp">
          <Card className="border-0 shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">WhatsApp Business Account</CardTitle>
              <CardDescription>Manage your WhatsApp Business configuration</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between p-4 bg-green-50 rounded-lg border border-green-200">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-[#25D366] flex items-center justify-center">
                    <MessageSquare className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">WhatsApp Business API</p>
                    <p className="text-xs text-green-600">Connected</p>
                  </div>
                </div>
                <Badge className="bg-green-100 text-green-700 border-0">Active</Badge>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Business Name</Label>
                  <Input defaultValue="Whatomate Inc." />
                </div>
                <div className="space-y-2">
                  <Label>Phone Number</Label>
                  <Input defaultValue="+1 (555) 000-0000" />
                </div>
                <div className="space-y-2">
                  <Label>WhatsApp Business ID</Label>
                  <Input defaultValue="1234567890" readOnly className="bg-muted" />
                </div>
                <div className="space-y-2">
                  <Label>Phone Number ID</Label>
                  <Input defaultValue="9876543210" readOnly className="bg-muted" />
                </div>
              </div>
              <Separator />
              <div className="space-y-2">
                <Label>Webhook URL</Label>
                <Input defaultValue="https://api.whatomate.com/webhooks/whatsapp" readOnly className="bg-muted font-mono text-sm" />
              </div>
              <div className="space-y-2">
                <Label>Webhook Verify Token</Label>
                <div className="flex gap-2">
                  <Input defaultValue="••••••••••••" readOnly className="bg-muted" type="password" />
                  <Button variant="outline">Show</Button>
                </div>
              </div>
              <div className="flex justify-end">
                <Button className="bg-[#25D366] hover:bg-[#128C7E] text-white">
                  <Save className="w-4 h-4 mr-2" />
                  Save Changes
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* API Settings */}
        <TabsContent value="api">
          <Card className="border-0 shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">API Keys</CardTitle>
              <CardDescription>Manage your API keys for external integrations</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div>
                  <p className="font-medium text-sm">Production API Key</p>
                  <p className="text-xs text-muted-foreground font-mono mt-1">whm_prod_••••••••••••••••</p>
                  <p className="text-xs text-muted-foreground mt-1">Created: Jan 15, 2024</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm">Copy</Button>
                  <Button variant="outline" size="sm" className="text-destructive">Revoke</Button>
                </div>
              </div>
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div>
                  <p className="font-medium text-sm">Test API Key</p>
                  <p className="text-xs text-muted-foreground font-mono mt-1">whm_test_••••••••••••••••</p>
                  <p className="text-xs text-muted-foreground mt-1">Created: Feb 1, 2024</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm">Copy</Button>
                  <Button variant="outline" size="sm" className="text-destructive">Revoke</Button>
                </div>
              </div>
              <Button className="bg-[#25D366] hover:bg-[#128C7E] text-white">
                <Key className="w-4 h-4 mr-2" />
                Generate New Key
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Security Settings */}
        <TabsContent value="security">
          <Card className="border-0 shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">Security Settings</CardTitle>
              <CardDescription>Manage your account security preferences</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <h4 className="font-medium text-sm">Change Password</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Current Password</Label>
                    <Input type="password" placeholder="••••••••" />
                  </div>
                  <div></div>
                  <div className="space-y-2">
                    <Label>New Password</Label>
                    <Input type="password" placeholder="••••••••" />
                  </div>
                  <div className="space-y-2">
                    <Label>Confirm Password</Label>
                    <Input type="password" placeholder="••••••••" />
                  </div>
                </div>
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-sm">Two-Factor Authentication</p>
                  <p className="text-xs text-muted-foreground">Add an extra layer of security to your account</p>
                </div>
                <Switch />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-sm">Session Timeout</p>
                  <p className="text-xs text-muted-foreground">Auto-logout after inactivity</p>
                </div>
                <Input className="w-24 text-center" defaultValue="30 min" />
              </div>
              <div className="flex justify-end">
                <Button className="bg-[#25D366] hover:bg-[#128C7E] text-white">
                  <Save className="w-4 h-4 mr-2" />
                  Save Changes
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
