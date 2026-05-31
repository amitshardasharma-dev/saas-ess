// Phase 3 navigation (compliance module). Contributed to the central registry
// under the PHASE-3 markers in src/config/navigation.ts. Gated on the
// 'compliance' module + manager role; the dashboard itself enforces hr+ for the
// org-wide view server-side.
import { ShieldCheck } from 'lucide-react'
import type { NavSection } from './types'

export const phase3ComplianceNav: NavSection[] = [
  {
    id: 'compliance',
    order: 65,
    moduleId: 'compliance',
    minRole: 'manager',
    item: {
      key: 'compliance',
      // Title resolved from terminology (plural certification term).
      titleKey: 'certification',
      href: '/dashboard/compliance',
      icon: ShieldCheck,
      description: 'Certification compliance register',
      minRole: 'manager',
    },
  },
]
