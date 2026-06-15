// src/config/nav/phase-2-onboarding.nav.tsx
//
// Phase 2 navigation — Onboarding + People (admin) sections.
// Appended to the registry via the PHASE-2 markers in src/config/navigation.ts.

import { Users, ClipboardList, ListChecks } from 'lucide-react'
import type { NavSection } from './types'

export const phase2OnboardingNav: NavSection[] = [
  {
    id: 'onboarding',
    moduleId: 'profiles',
    order: 20,
    item: {
      key: 'onboarding',
      title: 'Onboarding',
      href: '/dashboard/onboarding',
      icon: ClipboardList,
      description: 'Your onboarding checklist',
    },
  },
  {
    id: 'onboarding-people',
    moduleId: 'profiles',
    order: 21,
    minRole: 'hr',
    item: {
      key: 'onboarding-people',
      title: 'People',
      href: '/dashboard/people',
      icon: Users,
      description: 'Manage staff & onboarding',
      minRole: 'hr',
    },
  },
  {
    id: 'onboarding-flows',
    moduleId: 'profiles',
    order: 22,
    minRole: 'admin',
    item: {
      key: 'onboarding-flows',
      title: 'Onboarding Flows',
      href: '/dashboard/onboarding/manage',
      icon: ListChecks,
      description: 'Edit volunteer & staff onboarding',
      minRole: 'admin',
    },
  },
]
