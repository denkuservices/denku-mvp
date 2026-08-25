import React from 'react';
import {
  LayoutDashboard,
  Phone,
  Instagram,
  History,
  Ticket,
  Calendar,
  Activity,
  BarChart3,
  Settings,
  Users,
  Contact,
  Inbox,
} from 'lucide-react';
import { NavRoute } from './types';

/**
 * Flat dashboard sidebar navigation. No nested menus. Uses 'dashboard' layout.
 * Instagram (Sprint 1.5) sits alongside Phone Lines as a first-class channel.
 *
 * LEGACY (voice-first) nav — served when PLATFORM_UX_ENABLED is OFF.
 */
export const horizonNavRoutes: NavRoute[] = [
  { name: 'Dashboard', layout: 'dashboard', path: '', icon: <LayoutDashboard className="h-6 w-6" /> },
  { name: 'Phone Lines', layout: 'dashboard', path: 'phone-lines', icon: <Phone className="h-6 w-6" /> },
  { name: 'Instagram', layout: 'dashboard', path: 'instagram', icon: <Instagram className="h-6 w-6" /> },
  { name: 'Calls', layout: 'dashboard', path: 'calls', icon: <History className="h-6 w-6" /> },
  { name: 'Tickets', layout: 'dashboard', path: 'tickets', icon: <Ticket className="h-6 w-6" /> },
  { name: 'Appointments', layout: 'dashboard', path: 'appointments', icon: <Calendar className="h-6 w-6" /> },
  { name: 'Usage', layout: 'dashboard', path: 'usage', icon: <Activity className="h-6 w-6" /> },
  { name: 'Analytics', layout: 'dashboard', path: 'analytics', icon: <BarChart3 className="h-6 w-6" /> },
  { name: 'Settings', layout: 'dashboard', path: 'settings', icon: <Settings className="h-6 w-6" /> },
];

/**
 * PLATFORM nav — served when PLATFORM_UX_ENABLED is ON. Restructured in the Phase 2 IA
 * consolidation to the four-surface model:
 *
 *   Home     — the outcome layer: what did my AI team accomplish?
 *   Inbox    — the communication workspace: every conversation, every channel
 *   CRM      — the shared memory: contacts, their timeline, and their open requests
 *   AI Team  — the control plane: who works here, and how are they doing?
 *
 * plus Analytics (depth) and Settings (configuration).
 *
 * **Channels is deliberately NOT here.** Connecting a channel is configuration you do once,
 * not a place you visit; it lives at Settings → Channels (`/dashboard/channels`). Channel
 * presence surfaces where it matters — as badges and filters inside Inbox and CRM. This is
 * what keeps the sidebar flat as WhatsApp/Telegram/Email arrive: a new channel adds a
 * registry line, never a nav item.
 *
 * Contacts and Requests are grouped under CRM (one customer-shaped hub with its own internal
 * nav) rather than competing for top-level slots. Old links keep working via
 * `lib/platform/routeRedirects.ts`; no capability is hidden.
 */
export const platformNavRoutes: NavRoute[] = [
  { name: 'Home', layout: 'dashboard', path: '', icon: <LayoutDashboard className="h-6 w-6" /> },
  { name: 'Inbox', layout: 'dashboard', path: 'inbox', icon: <Inbox className="h-6 w-6" /> },
  // "Customers", not "CRM" (Sprint 9 · T8 / decision D6): the surface's own subtitle already
  // says "everyone your AI team has talked to". CRM is category jargon a small-business owner
  // has to translate; the route stays /dashboard/crm so every shipped link still resolves.
  { name: 'Customers', layout: 'dashboard', path: 'crm', icon: <Contact className="h-6 w-6" /> },
  { name: 'AI Team', layout: 'dashboard', path: 'team', icon: <Users className="h-6 w-6" /> },
  { name: 'Analytics', layout: 'dashboard', path: 'analytics', icon: <BarChart3 className="h-6 w-6" /> },
  { name: 'Settings', layout: 'dashboard', path: 'settings', icon: <Settings className="h-6 w-6" /> },
];
