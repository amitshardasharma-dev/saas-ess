// src/config/nav/phase-4-esign.nav.tsx
//
// Phase 4 (E-Signatures) navigation. Gated by the `documents_esign` module. The
// section header links to the staff-facing signing dashboard; the "Signature
// Status" sub-item (who has/hasn't signed) is hr+ only. The per-document signing
// experience is reached from a document's page, so it is not a top-level entry.

import { FileSignature, ListChecks } from 'lucide-react'
import type { NavSection } from './types'

export const phase4EsignNav: NavSection[] = [
  {
    id: 'documents-esign',
    order: 45, // just after Documents (40)
    moduleId: 'documents_esign',
    item: {
      key: 'documents-esign',
      title: 'E-Signatures',
      href: '/dashboard/documents/sign',
      icon: FileSignature,
      description: 'Complete and sign documents',
    },
    items: [
      {
        key: 'signature-status',
        title: 'Signature Status',
        href: '/dashboard/documents/sign/status',
        icon: ListChecks,
        description: 'Who has and has not signed',
        minRole: 'hr',
      },
    ],
  },
]
