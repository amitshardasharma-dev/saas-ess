// Review-status chip for a certification (Pending review / Validated / Changes
// requested / Rejected). Distinct from CertBadge, which shows expiry health.
// Built on the shared Badge primitive so tones match the rest of the app.
'use client'

import { Badge } from '@/components/ui/badge'
import { Clock, CheckCircle2, AlertTriangle, XCircle, FileEdit } from 'lucide-react'
import type { VerificationStatus } from '@/types/compliance'

const STYLES: Record<
  VerificationStatus,
  { className: string; label: string; Icon: React.ComponentType<{ className?: string }> }
> = {
  pending: { className: 'bg-muted text-muted-foreground hover:bg-muted', label: 'Not submitted', Icon: FileEdit },
  submitted: { className: 'bg-blue-100 text-blue-800 hover:bg-blue-100', label: 'Pending review', Icon: Clock },
  validated: { className: 'bg-green-100 text-green-800 hover:bg-green-100', label: 'Validated', Icon: CheckCircle2 },
  changes_requested: { className: 'bg-amber-100 text-amber-800 hover:bg-amber-100', label: 'Changes requested', Icon: AlertTriangle },
  rejected: { className: 'bg-red-100 text-red-800 hover:bg-red-100', label: 'Rejected', Icon: XCircle },
}

export function VerificationBadge({ status }: { status: VerificationStatus }) {
  const style = STYLES[status] ?? STYLES.pending
  const { Icon } = style
  return (
    <Badge variant="secondary" className={style.className}>
      <Icon className="h-3.5 w-3.5" />
      {style.label}
    </Badge>
  )
}
