/**
 * Navigation configuration for the Whatomate platform.
 * Derived from VIEW_REGISTRY in @/lib/registries — single source of truth.
 */

import { VIEW_REGISTRY, type ViewId } from '@/lib/registries';

// Icons that the sidebar maps from VIEW_REGISTRY icon references
// (kept here because sidebar uses string-based icon lookup from navItems)
const ICON_NAMES: Record<string, string> = {
  dashboard: 'LayoutDashboard',
  chat: 'MessageSquare',
  contacts: 'Users',
  templates: 'FileText',
  campaigns: 'Megaphone',
  chatbot: 'Bot',
  analytics: 'BarChart3',
  settings: 'Settings',
  cognitive: 'Brain',
  research: 'Microscope',
  hermes: 'Zap',
  multiagent: 'Radar',
  missions: 'Crosshair',
  strategies: 'GitBranch',
  monitoring: 'Activity',
  reports: 'FileOutput',
};

export const navItems = (Object.entries(VIEW_REGISTRY) as [ViewId, typeof VIEW_REGISTRY[ViewId]][]).map(
  ([id, config]) => ({
    id,
    label: config.label,
    icon: (ICON_NAMES[id] || 'LayoutDashboard') as const,
  })
);
