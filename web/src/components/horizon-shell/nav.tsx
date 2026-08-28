import React from 'react';
import { SiInstagram } from 'react-icons/si';
import {
  LayoutDashboard,
  Phone,
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
import {
  SETTINGS_ITEMS,
  SETTINGS_ELSEWHERE,
  SETTINGS_LANDING,
} from '@/app/(app)/dashboard/_platform/settings/nav';

/**
 * Settings' own sections, as a sidebar sub-menu.
 *
 * They were a vertical rail rendered into every settings page — the sections listed once in the
 * page and nowhere in the sidebar, which pushed the forms into a narrow column and made Settings
 * the one surface whose navigation lived somewhere different from every other surface's. Same
 * destinations, same source of truth (`_platform/settings/nav`, which the settings-nav contract
 * test holds to real routes); only the place they are drawn has changed.
 *
 * **Labels only.** The one-line descriptions ("Your details and how you sign in.") are page copy,
 * not nav copy — a sidebar that explains each item is a sidebar you read instead of scan.
 *
 * Channels is here even though it routes outside `/dashboard/settings`: connecting a channel is
 * configuration you do once, so it never earned a top-level slot, and the settings rail was its
 * only entry point in the product. AI Employees is deliberately NOT repeated — it is the "AI Team"
 * item two rows up.
 */
const settingsChildren: NavRoute[] = [...SETTINGS_ITEMS, ...SETTINGS_ELSEWHERE]
  .filter((item) => item.href !== '/dashboard/team')
  .map((item) => ({
    name: item.label,
    layout: 'dashboard',
    path: item.href.replace(/^\/dashboard\/?/, ''),
  }));

/**
 * Flat dashboard sidebar navigation. No nested menus. Uses 'dashboard' layout.
 * Instagram (Sprint 1.5) sits alongside Phone Lines as a first-class channel.
 *
 * LEGACY (voice-first) nav — served when PLATFORM_UX_ENABLED is OFF.
 */
export const horizonNavRoutes: NavRoute[] = [
  { name: 'Dashboard', layout: 'dashboard', path: '', icon: <LayoutDashboard className="h-6 w-6" /> },
  { name: 'Phone Lines', layout: 'dashboard', path: 'phone-lines', icon: <Phone className="h-6 w-6" /> },
  // The real brand mark, like everywhere else a channel is drawn. Monochrome here on purpose:
  // sidebar icons take the nav's own active/inactive colour, and one magenta item in a grey
  // column would read as an error rather than as Instagram.
  { name: 'Instagram', layout: 'dashboard', path: 'instagram', icon: <SiInstagram className="h-6 w-6" /> },
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
 * plus Settings (configuration). Analytics is a tab on Home rather than a sixth item.
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
  // Analytics is a TAB on Home, not a nav item: Home already leads with outcomes, so a sixth
  // item repeating the same numbers one click away was the sidebar answering one question twice.
  // Every capability Sprint 12 restored lives there, and /dashboard/analytics still redirects.
  //
  // Settings is the only item with a sub-menu, and it opens only while you are inside Settings —
  // the sidebar stays a five-item list everywhere else. It navigates straight to the first
  // section: `/dashboard/settings` has no page of its own, only a redirect, and routing the click
  // through it shows an empty frame on the way.
  {
    name: 'Settings',
    layout: 'dashboard',
    path: 'settings',
    href: SETTINGS_LANDING,
    icon: <Settings className="h-6 w-6" />,
    items: settingsChildren,
  },
];
