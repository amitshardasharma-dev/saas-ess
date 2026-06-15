// Phase 3 navigation (compliance module). Contributed to the central registry
// under the PHASE-3 markers in src/config/navigation.ts. Gated on the
// 'compliance' module and visible to every authenticated user: the dashboard is
// role-aware — volunteers get a self-service "My certifications" view (add +
// upload their own certificate documents), while hr+ get the org-wide register
// (enforced server-side via scope=all).
import { ShieldCheck } from 'lucide-react'
import type { NavSection } from './types'

export const phase3ComplianceNav: NavSection[] = [
  {
    id: 'compliance',
    order: 65,
    moduleId: 'compliance',
    minRole: 'employee',
    item: {
      key: 'compliance',
      // Title resolved from terminology (plural certification term).
      titleKey: 'certification',
      href: '/dashboard/compliance',
      icon: ShieldCheck,
      description: 'Certifications & expiry tracking',
      minRole: 'employee',
    },
  },
]
