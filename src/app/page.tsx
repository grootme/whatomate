'use client';

import React, { useState, useCallback, useSyncExternalStore } from 'react';
import { LoginView } from '@/components/whatomate/login-view';
import { Sidebar } from '@/components/whatomate/sidebar';
import { Header } from '@/components/whatomate/header';
import { DashboardView } from '@/components/whatomate/dashboard-view';
import { ChatView } from '@/components/whatomate/chat-view';
import { ContactsView } from '@/components/whatomate/contacts-view';
import { TemplatesView } from '@/components/whatomate/templates-view';
import { CampaignsView } from '@/components/whatomate/campaigns-view';
import { ChatbotView } from '@/components/whatomate/chatbot-view';
import { AnalyticsView } from '@/components/whatomate/analytics-view';
import { SettingsView } from '@/components/whatomate/settings-view';
import { CognitiveView } from '@/components/whatomate/cognitive-view';
import { ResearchView } from '@/components/whatomate/research-view';
import { HermesView } from '@/components/whatomate/hermes-view';
import { MultiagentView } from '@/components/whatomate/multiagent-view';
import { StrategiesView } from '@/components/whatomate/strategies-view';
import { MonitoringView } from '@/components/whatomate/monitoring-view';
import { ReportsView } from '@/components/whatomate/reports-view';

const emptySubscribe = () => () => {};

function useAuthToken() {
  const token = useSyncExternalStore(
    emptySubscribe,
    () => localStorage.getItem('whatomate_token'),
    () => null
  );
  return token;
}

export default function Home() {
  const token = useAuthToken();
  const isAuthenticated = !!token;
  const [authOverride, setAuthOverride] = useState<boolean | null>(null);
  const effectiveAuth = authOverride !== null ? authOverride : isAuthenticated;
  const [activeView, setActiveView] = useState('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleLogin = useCallback((_token: string) => {
    setAuthOverride(true);
  }, []);

  const handleLogout = useCallback(() => {
    localStorage.removeItem('whatomate_token');
    setAuthOverride(false);
    setActiveView('dashboard');
  }, []);

  // Login view
  if (!effectiveAuth) {
    return <LoginView onLogin={handleLogin} />;
  }

  // Render active view content
  const renderView = () => {
    switch (activeView) {
      case 'dashboard':
        return <DashboardView />;
      case 'chat':
        return <ChatView />;
      case 'contacts':
        return <ContactsView />;
      case 'templates':
        return <TemplatesView />;
      case 'campaigns':
        return <CampaignsView />;
      case 'chatbot':
        return <ChatbotView />;
      case 'analytics':
        return <AnalyticsView />;
      case 'settings':
        return <SettingsView />;
      case 'cognitive':
        return <CognitiveView />;
      case 'research':
        return <ResearchView />;
      case 'hermes':
        return <HermesView />;
      case 'multiagent':
        return <MultiagentView />;
      case 'strategies':
        return <StrategiesView />;
      case 'monitoring':
        return <MonitoringView />;
      case 'reports':
        return <ReportsView />;
      default:
        return <DashboardView />;
    }
  };

  // Main Dashboard Layout
  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar */}
      <Sidebar
        activeView={activeView}
        onViewChange={setActiveView}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header */}
        <Header
          activeView={activeView}
          onMenuToggle={() => setSidebarOpen(true)}
          onLogout={handleLogout}
        />

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          {renderView()}
        </main>
      </div>
    </div>
  );
}
