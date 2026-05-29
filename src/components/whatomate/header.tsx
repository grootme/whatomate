'use client';

import React from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
  Menu,
  Search,
  Bell,
  LogOut,
  User,
  HelpCircle,
  ChevronDown,
} from 'lucide-react';

interface HeaderProps {
  activeView: string;
  onMenuToggle: () => void;
  onLogout: () => void;
}

const viewTitles: Record<string, string> = {
  dashboard: 'Dashboard',
  chat: 'Chat',
  contacts: 'Contacts',
  templates: 'Message Templates',
  campaigns: 'Campaigns',
  chatbot: 'Chatbot',
  analytics: 'Analytics',
  cognitive: 'Cognitive Capital',
  research: 'DeerFlow Research',
  hermes: 'Hermes Gateway',
  multiagent: 'Multi-Agente OSINT',
  missions: 'Misiones Especializadas',
  strategies: 'Estrategias de Decisión',
  monitoring: 'Monitoreo en Tiempo Real',
  reports: 'Centro de Reportes',
  settings: 'Settings',
};

export function Header({ activeView, onMenuToggle, onLogout }: HeaderProps) {
  return (
    <header className="h-16 border-b bg-white flex items-center px-4 gap-4 shrink-0">
      {/* Mobile menu button */}
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden"
        onClick={onMenuToggle}
      >
        <Menu className="w-5 h-5" />
      </Button>

      {/* Page title */}
      <h2 className="text-lg font-semibold hidden sm:block">
        {viewTitles[activeView] || 'Dashboard'}
      </h2>

      {/* Search */}
      <div className="flex-1 max-w-md ml-auto sm:ml-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar alertas, agentes, reportes..."
            className="pl-9 h-9 bg-muted/50 border-0 focus-visible:bg-background focus-visible:border"
          />
        </div>
      </div>

      {/* Right section */}
      <div className="flex items-center gap-2">
        {/* Notifications */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="relative">
              <Bell className="w-5 h-5" />
              <Badge className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-[10px] bg-red-500 border-0">
                5
              </Badge>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80">
            <DropdownMenuLabel className="flex items-center justify-between">
              <span>Notificaciones</span>
              <Badge variant="secondary" className="text-xs">5 nuevas</Badge>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="flex flex-col items-start gap-1 p-3">
              <span className="font-medium text-sm">Pico de fraude financiero detectado</span>
              <span className="text-xs text-muted-foreground">Hace 2 minutos</span>
            </DropdownMenuItem>
            <DropdownMenuItem className="flex flex-col items-start gap-1 p-3">
              <span className="font-medium text-sm">Agente Cross-Platform en estado warning</span>
              <span className="text-xs text-muted-foreground">Hace 15 minutos</span>
            </DropdownMenuItem>
            <DropdownMenuItem className="flex flex-col items-start gap-1 p-3">
              <span className="font-medium text-sm">Reporte diario generado exitosamente</span>
              <span className="text-xs text-muted-foreground">Hace 1 hora</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-center justify-center text-[#25D366] font-medium">
              Ver todas las notificaciones
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Help */}
        <Button variant="ghost" size="icon" className="hidden sm:flex">
          <HelpCircle className="w-5 h-5" />
        </Button>

        {/* User menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="flex items-center gap-2 px-2">
              <Avatar className="h-8 w-8">
                <AvatarFallback className="bg-[#25D366] text-white text-xs font-bold">
                  AU
                </AvatarFallback>
              </Avatar>
              <span className="hidden md:block text-sm font-medium">Admin</span>
              <ChevronDown className="w-4 h-4 text-muted-foreground hidden md:block" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <div className="flex flex-col">
                <span>Admin User</span>
                <span className="text-xs font-normal text-muted-foreground">admin@whatomate.com</span>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem>
              <User className="w-4 h-4 mr-2" />
              Perfil
            </DropdownMenuItem>
            <DropdownMenuItem>
              <HelpCircle className="w-4 h-4 mr-2" />
              Ayuda y Soporte
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onLogout} className="text-destructive">
              <LogOut className="w-4 h-4 mr-2" />
              Cerrar sesión
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
