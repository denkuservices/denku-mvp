import React from 'react';
import {
  LayoutDashboard,
  Phone,
  History,
  Ticket,
  Calendar,
  Activity,
  BarChart3,
  Settings,
} from 'lucide-react';
import { NavRoute } from './types';

/**
 * Flat dashboard sidebar navigation (8 items only).
 * No nested menus. No Integrations. Uses 'dashboard' layout.
 */
export const horizonNavRoutes: NavRoute[] = [
  { name: 'Dashboard', layout: 'dashboard', path: '', icon: <LayoutDashboard className="h-6 w-6" /> },
  { name: 'Phone Lines', layout: 'dashboard', path: 'phone-lines', icon: <Phone className="h-6 w-6" /> },
  { name: 'Calls', layout: 'dashboard', path: 'calls', icon: <History className="h-6 w-6" /> },
  { name: 'Tickets', layout: 'dashboard', path: 'tickets', icon: <Ticket className="h-6 w-6" /> },
  { name: 'Appointments', layout: 'dashboard', path: 'appointments', icon: <Calendar className="h-6 w-6" /> },
  { name: 'Usage', layout: 'dashboard', path: 'usage', icon: <Activity className="h-6 w-6" /> },
  { name: 'Analytics', layout: 'dashboard', path: 'analytics', icon: <BarChart3 className="h-6 w-6" /> },
  { name: 'Settings', layout: 'dashboard', path: 'settings', icon: <Settings className="h-6 w-6" /> },
];
