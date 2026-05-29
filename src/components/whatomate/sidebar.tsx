'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { navItems } from '@/lib/nav-config';
import {
  LayoutDashboard,
  MessageSquare,
  Users,
  FileText,
  Megaphone,
  Bot,
  BarChart3,
  Settings,
  Brain,
  Microscope,
  Zap,
  Radar,
  GitBranch,
  Activity,
  FileOutput,
  Crosshair,
  X,
} from 'lucide-react';

const iconMap: Record<string, React.ElementType> = {
  LayoutDashboard,
  MessageSquare,
  Users,
  FileText,
  Megaphone,
  Bot,
  BarChart3,
  Settings,
  Brain,
  Microscope,
  Zap,
  Radar,
  GitBranch,
  Activity,
  FileOutput,
  Crosshair,
};

interface SidebarProps {
  activeView: string;
  onViewChange: (view: string) => void;
  isOpen: boolean;
  onClose: () => void;
}

export function Sidebar({ activeView, onViewChange, isOpen, onClose }: SidebarProps) {
  // Group nav items: main, OSINT, settings
  const mainItems = navItems.filter((i) => !['multiagent', 'missions', 'strategies', 'monitoring', 'reports', 'settings'].includes(i.id));
  const osintItems = navItems.filter((i) => ['multiagent', 'missions', 'strategies', 'monitoring', 'reports'].includes(i.id));
  const settingsItems = navItems.filter((i) => i.id === 'settings');

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed lg:static inset-y-0 left-0 z-50 w-64 bg-[#075E54] text-white flex flex-col transition-transform duration-300 ease-in-out',
          isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        )}
      >
        {/* Logo */}
        <div className="flex items-center gap-3 px-5 py-5 border-b border-white/10">
          <div className="w-9 h-9 bg-[#25D366] rounded-lg flex items-center justify-center">
            <MessageSquare className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="font-bold text-lg leading-none">Whatomate</h1>
            <p className="text-xs text-white/60 mt-0.5">OSINT Platform</p>
          </div>
          <button
            onClick={onClose}
            className="ml-auto lg:hidden p-1 hover:bg-white/10 rounded"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto custom-scrollbar">
          {/* Main Nav */}
          {mainItems.map((item) => {
            const Icon = iconMap[item.icon] || LayoutDashboard;
            const isActive = activeView === item.id;

            return (
              <button
                key={item.id}
                onClick={() => {
                  onViewChange(item.id);
                  onClose();
                }}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150',
                  isActive
                    ? 'bg-[#25D366] text-white shadow-lg shadow-[#25D366]/30'
                    : 'text-white/70 hover:bg-white/10 hover:text-white'
                )}
              >
                <Icon className="w-5 h-5 shrink-0" />
                <span>{item.label}</span>
                {item.id === 'chat' && (
                  <span className="ml-auto bg-red-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full">
                    3
                  </span>
                )}
              </button>
            );
          })}

          {/* OSINT Section */}
          <div className="pt-4 pb-2">
            <div className="px-3 mb-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-white/40">
                Inteligencia OSINT
              </span>
            </div>
          </div>

          {osintItems.map((item) => {
            const Icon = iconMap[item.icon] || LayoutDashboard;
            const isActive = activeView === item.id;

            return (
              <button
                key={item.id}
                onClick={() => {
                  onViewChange(item.id);
                  onClose();
                }}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150',
                  isActive
                    ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/30'
                    : 'text-white/70 hover:bg-white/10 hover:text-white'
                )}
              >
                <Icon className="w-5 h-5 shrink-0" />
                <span>{item.label}</span>
                {item.id === 'monitoring' && (
                  <span className="ml-auto w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                )}
              </button>
            );
          })}

          {/* Settings */}
          <div className="pt-4 pb-2">
            <div className="px-3 mb-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-white/40">
                Sistema
              </span>
            </div>
          </div>

          {settingsItems.map((item) => {
            const Icon = iconMap[item.icon] || LayoutDashboard;
            const isActive = activeView === item.id;

            return (
              <button
                key={item.id}
                onClick={() => {
                  onViewChange(item.id);
                  onClose();
                }}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150',
                  isActive
                    ? 'bg-[#25D366] text-white shadow-lg shadow-[#25D366]/30'
                    : 'text-white/70 hover:bg-white/10 hover:text-white'
                )}
              >
                <Icon className="w-5 h-5 shrink-0" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Bottom section */}
        <div className="p-4 border-t border-white/10">
          <div className="flex items-center gap-3 px-2">
            <div className="w-8 h-8 bg-[#25D366] rounded-full flex items-center justify-center text-sm font-bold">
              A
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">Admin User</p>
              <p className="text-xs text-white/50 truncate">admin@whatomate.com</p>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
