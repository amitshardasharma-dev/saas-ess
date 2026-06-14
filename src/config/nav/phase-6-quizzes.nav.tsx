// src/config/nav/phase-6-quizzes.nav.tsx
//
// Phase 6 (Quiz & Assessment Engine) navigation. Contributed to navRegistry via
// the PHASE-6 markers in src/config/navigation.ts. Both sections are gated on the
// 'quizzes' module; all items require Staff/Admin (minRole 'hr') since quizzes are
// built/graded by staff and TAKEN from inside a training item (not a top-level
// volunteer nav entry).

import { ClipboardList, PencilRuler } from 'lucide-react'
import type { NavSection } from './types'

export const quizzesNav: NavSection[] = [
  {
    id: 'quizzes',
    order: 56,
    moduleId: 'quizzes',
    minRole: 'hr',
    item: {
      key: 'quizzes',
      title: 'Quizzes',
      href: '/dashboard/quizzes',
      icon: PencilRuler,
      description: 'Build & manage assessments',
      minRole: 'hr',
    },
  },
  {
    id: 'grading',
    order: 57,
    moduleId: 'quizzes',
    minRole: 'hr',
    item: {
      key: 'grading',
      title: 'Grading Queue',
      href: '/dashboard/grading',
      icon: ClipboardList,
      description: 'Grade essays & short answers',
      minRole: 'hr',
    },
  },
]
