// Per-profile certification status badge (valid / expiring / expired).
// Traffic-light tones; reusable on profiles, the compliance dashboard, and the
// volunteer "My certifications" view. Built on the shared Badge primitive so it
// matches the document status chips (neutral tokens, lucide icons).
'use client'

import { Badge } from '@/components/ui/badge'
import { CheckCircle2, Clock, AlertTriangle } from 'lucide-react'
import type { CertStatus } from '@/lib/compliance/expiry'

const STATUS_STYLES: Record<
  CertStatus,
  { className: string; label: string; Icon: React.ComponentType<{ className?: string }> }
> = {
  valid: {
    className: 'bg-green-100 text-green-800 hover:bg-green-100',
    label: 'Valid',
    Icon: CheckCircle2,
  },
  expiring: {
    className: 'bg-amber-100 text-amber-800 hover:bg-amber-100',
    label: 'Expiring',
    Icon: Clock,
  },
  expired: {
    className: 'bg-red-100 text-red-800 hover:bg-red-100',
    label: 'Expired',
    Icon: AlertTriangle,
  },
}

export interface CertBadgeProps {
  status: CertStatus
  /** Optional override text (e.g. a localized status label). */
  text?: string
}

export function CertBadge({ status, text }: CertBadgeProps) {
  const style = STATUS_STYLES[status] ?? STATUS_STYLES.valid
  const { Icon } = style
  return (
    <Badge variant="secondary" className={style.className}>
      <Icon className="h-3.5 w-3.5" />
      {text ?? style.label}
    </Badge>
  )
}
