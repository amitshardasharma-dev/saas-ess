// Per-profile certification status badge (valid / expiring / expired).
// Traffic-light colors; reusable on profiles and in the compliance dashboard.
'use client'

import type { CertStatus } from '@/lib/compliance/expiry'

const STATUS_STYLES: Record<CertStatus, { bg: string; fg: string; label: string }> = {
  valid: { bg: '#dcfce7', fg: '#166534', label: 'Valid' },
  expiring: { bg: '#fef9c3', fg: '#854d0e', label: 'Expiring' },
  expired: { bg: '#fee2e2', fg: '#991b1b', label: 'Expired' },
}

export interface CertBadgeProps {
  status: CertStatus
  /** Optional override text (e.g. a localized status label). */
  text?: string
}

export function CertBadge({ status, text }: CertBadgeProps) {
  const style = STATUS_STYLES[status] ?? STATUS_STYLES.valid
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: 9999,
        fontSize: 12,
        fontWeight: 600,
        backgroundColor: style.bg,
        color: style.fg,
      }}
    >
      {text ?? style.label}
    </span>
  )
}
