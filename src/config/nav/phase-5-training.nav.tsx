// src/config/nav/phase-5-training.nav.tsx
//
// Phase 5 (LMS) navigation. Contributed to navRegistry via the PHASE-5 markers
// in src/config/navigation.ts. The "Training" section is gated on the 'training'
// module; the management sub-item is Staff/Admin (minRole 'hr').

import { GraduationCap, BookOpen, BarChart3 } from 'lucide-react'
import type { NavSection } from './types'

export const trainingNav: NavSection[] = [
  {
    id: 'training',
    order: 55,
    moduleId: 'training',
    item: {
      key: 'training',
      titleKey: 'training_module',
      href: '/dashboard/training',
      icon: GraduationCap,
      description: 'Assigned learning & progress',
    },
    items: [
      {
        key: 'manage-training',
        title: 'Manage Training',
        href: '/dashboard/training/manage',
        icon: BookOpen,
        description: 'Build modules & assign',
        minRole: 'hr',
      },
      {
        key: 'training-reports',
        title: 'Training Progress',
        // Canonical report lives under Reports; this entry deep-links to it so the
        // Training section still surfaces progress without a duplicate page.
        href: '/dashboard/reports/training',
        icon: BarChart3,
        description: 'Volunteer progress overview',
        minRole: 'hr',
      },
    ],
  },
]
