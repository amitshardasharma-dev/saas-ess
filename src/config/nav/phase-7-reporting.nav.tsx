// src/config/nav/phase-7-reporting.nav.tsx
//
// Phase 7 navigation. Contributed to navRegistry via the PHASE-7 markers in
// src/config/navigation.ts (one import + one spread). Mirrors the shape used by
// phase-5-training.nav.tsx. Sections are module-gated; management items are
// Staff/Admin (minRole 'hr') or Admin where noted.

import { BarChart3, Megaphone, BellRing, RefreshCw, FileSpreadsheet, Inbox, ShieldCheck } from 'lucide-react'
import type { NavSection } from './types'

export const phase7ReportingNav: NavSection[] = [
  {
    id: 'reporting',
    order: 70,
    moduleId: 'reporting',
    item: {
      key: 'reports',
      title: 'Reports',
      href: '/dashboard/reports',
      icon: BarChart3,
      description: 'Training & compliance reporting',
    },
    items: [
      {
        key: 'training-report',
        title: 'Training Report',
        href: '/dashboard/reports/training',
        icon: FileSpreadsheet,
        description: 'Progress overview & export',
        minRole: 'hr',
      },
      {
        key: 'compliance-report',
        title: 'Compliance Report',
        href: '/dashboard/reports/compliance',
        icon: ShieldCheck,
        description: 'Board-ready cert & recert status',
        minRole: 'hr',
      },
    ],
  },
  {
    id: 'communications',
    order: 71,
    moduleId: 'communications',
    item: {
      key: 'communications',
      title: 'Communications',
      href: '/dashboard/communications',
      icon: Megaphone,
      description: 'Memos & announcements',
    },
    items: [
      {
        key: 'compose-message',
        title: 'Compose',
        href: '/dashboard/communications/compose',
        icon: Megaphone,
        description: 'Send a targeted memo',
        minRole: 'hr',
      },
      {
        key: 'inbox',
        title: 'Inbox',
        href: '/dashboard/communications/inbox',
        icon: Inbox,
        description: 'Messages addressed to you',
      },
    ],
  },
  {
    id: 'expiry_reminders',
    order: 72,
    moduleId: 'expiry_reminders',
    item: {
      key: 'reminders',
      title: 'Expiry Reminders',
      href: '/dashboard/reminders',
      icon: BellRing,
      description: 'Reminder timing & escalation',
    },
    items: [
      {
        key: 'reminder-configs',
        title: 'Reminder Settings',
        href: '/dashboard/reminders',
        icon: BellRing,
        description: 'Configure offsets & escalation',
        minRole: 'admin',
      },
    ],
  },
  {
    id: 'recertification',
    order: 73,
    moduleId: 'recertification',
    item: {
      key: 'recertification',
      title: 'Recertification',
      href: '/dashboard/recertification',
      icon: RefreshCw,
      description: 'Track expired-cert recert loops',
    },
    items: [
      {
        key: 'recert-list',
        title: 'Recertifications',
        href: '/dashboard/recertification',
        icon: RefreshCw,
        description: 'Open & completed recerts',
        minRole: 'hr',
      },
    ],
  },
]
