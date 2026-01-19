import React from 'react';
import {
  LayoutDashboard,
  Users,
  Phone,
  UserPlus,
  Ticket,
  Calendar,
  BarChart3,
  Settings,
} from 'lucide-react';
import { NavRoute } from './types';

/**
 * Horizon navigation routes for our app routes.
 * Uses 'dashboard' layout (no leading slash) - Links.tsx will normalize to absolute paths.
 */
export const horizonNavRoutes: NavRoute[] = [
  {
    name: 'Dashboard',
    layout: 'dashboard',
    path: '',
    icon: <LayoutDashboard className="h-6 w-6" />,
  },
  {
    name: 'Agents',
    layout: 'dashboard',
    path: 'agents',
    icon: <Users className="h-6 w-6" />,
  },
  {
    name: 'Calls',
    layout: 'dashboard',
    path: 'calls',
    icon: <Phone className="h-6 w-6" />,
  },
  {
    name: 'Leads',
    layout: 'dashboard',
    path: 'leads',
    icon: <UserPlus className="h-6 w-6" />,
  },
  {
    name: 'Tickets',
    layout: 'dashboard',
    path: 'tickets',
    icon: <Ticket className="h-6 w-6" />,
  },
  {
    name: 'Appointments',
    layout: 'dashboard',
    path: 'appointments',
    icon: <Calendar className="h-6 w-6" />,
  },
  {
    name: 'Analytics',
    layout: 'dashboard',
    path: 'analytics',
    icon: <BarChart3 className="h-6 w-6" />,
  },
  {
    name: 'Settings',
    layout: 'dashboard',
    path: 'settings',
    icon: <Settings className="h-6 w-6" />,
  },
];
