// Reviewer (hr+) modal for acting on one certification: view the document,
// adjust the expiry, leave a message, and Validate / Request changes / Reject.
// Posts to /api/certifications/:id/review and embeds the conversation thread so
// the reviewer sees (and can continue) the back-and-forth in one place.
'use client'

import { useState } from 'react'
import { createPortal } from 'react-dom'
import {
  X, FileText, CheckCircle2, AlertTriangle, XCircle, Loader2, CalendarClock,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { VerificationBadge } from '@/components/compliance/verification-badge'
import { CertConversation } from '@/components/compliance/cert-conversation'
import type { VerificationStatus } from '@/types/compliance'
import toast from 'react-hot-toast'

function authHeaders(extra: HeadersInit = {}): HeadersInit {
  const token = typeof window !== 'undefined' ? localStorage.getItem('ess_access_token') : null
  return { ...extra, ...(token ? { Authorization: `Bearer ${token}` } : {}) }
}

export interface ReviewCert {
  id: string
  title: string
  employee_name: string | null
  cert_type_name: string | null
  expiry_date: string | null
  verification_status: VerificationStatus
  file_url: string | null
  file_name: string | null
}

interface Props {
  cert: ReviewCert
  onClose: () => void
  /** Called after a successful review so the parent can refresh the register. */
  onReviewed: () => void
}

export function CertReviewPanel({ cert, onClose, onReviewed }: Props) {
  const [expiry, setExpiry] = useState(cert.expiry_date ?? '')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState<null | 'validate' | 'request_changes' | 'reject'>(null)
  const [status, setStatus] = useState<VerificationStatus>(cert.verification_status)
  const [viewing, setViewing] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  const viewDocument = async () => {
    setViewing(true)
    try {
      const res = await fetch(`/api/certifications/${cert.id}/file`, { headers: authHeaders() })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.url) throw new Error(data?.error ?? 'Could not open the document')
      window.open(data.url as string, '_blank', 'noopener,noreferrer')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not open the document')
    } finally {
      setViewing(false)
    }
  }

  const review = async (action: 'validate' | 'request_changes' | 'reject') => {
    setBusy(action)
    try {
      const payload: Record<string, unknown> = { action }
      // Only send expiry when the reviewer actually changed it.
      const normalized = expiry || null
      if (normalized !== (cert.expiry_date ?? null)) payload.expiry_date = normalized
      if (message.trim()) payload.message = message.trim()

      const res = await fetch(`/api/certifications/${cert.id}/review`, {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(payload),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error ?? 'Review failed')
      const next = (data?.certification?.verification_status as VerificationStatus) ?? statusFor(action)
      setStatus(next)
      setMessage('')
      setReloadKey((k) => k + 1)
      onReviewed()
      toast.success(
        action === 'validate' ? 'Certificate validated' : action === 'reject' ? 'Certificate rejected' : 'Changes requested',
      )
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Review failed')
    } finally {
      setBusy(null)
    }
  }

  const modal = (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:p-8" onClick={onClose}>
      <div
        className="w-full max-w-2xl rounded-xl border bg-background shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b p-4">
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold text-foreground">{cert.title}</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {cert.employee_name ?? '—'}
              {cert.cert_type_name ? ` · ${cert.cert_type_name}` : ''}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <VerificationBadge status={status} />
            <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close"><X className="h-4 w-4" /></Button>
          </div>
        </div>

        <div className="space-y-5 p-4">
          {/* Document */}
          <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/20 px-3 py-2.5">
            <span className="flex min-w-0 items-center gap-2 text-sm">
              <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="truncate text-foreground">{cert.file_name || (cert.file_url ? 'Document' : 'No document attached')}</span>
            </span>
            {cert.file_url ? (
              <Button variant="outline" size="sm" onClick={() => void viewDocument()} disabled={viewing}>
                {viewing ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />} View
              </Button>
            ) : null}
          </div>

          {/* Expiry override */}
          <div className="space-y-1.5">
            <Label className="text-sm">Expiry date</Label>
            <div className="relative max-w-xs">
              <CalendarClock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} className="pl-9" />
            </div>
            <p className="text-xs text-muted-foreground">Adjust if the certificate’s real expiry differs from what was entered.</p>
          </div>

          {/* Decision message */}
          <div className="space-y-1.5">
            <Label className="text-sm">Message to the volunteer <span className="text-muted-foreground">(optional)</span></Label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={2}
              placeholder="e.g. The document is blurry — please re-upload a clearer scan."
              className="w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            />
            <p className="text-xs text-muted-foreground">Sent to their inbox and added to the conversation below.</p>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void review('validate')} disabled={busy !== null} className="bg-green-600 text-white hover:bg-green-700">
              {busy === 'validate' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Validate
            </Button>
            <Button variant="outline" onClick={() => void review('request_changes')} disabled={busy !== null} className="border-amber-300 text-amber-800 hover:bg-amber-50">
              {busy === 'request_changes' ? <Loader2 className="h-4 w-4 animate-spin" /> : <AlertTriangle className="h-4 w-4" />} Request changes
            </Button>
            <Button variant="outline" onClick={() => void review('reject')} disabled={busy !== null} className="border-red-300 text-red-700 hover:bg-red-50">
              {busy === 'reject' ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />} Reject
            </Button>
          </div>

          {/* Conversation */}
          <div className="border-t pt-4">
            <h3 className="mb-2 text-sm font-medium text-foreground">Conversation</h3>
            <CertConversation certId={cert.id} canReply reloadKey={reloadKey} />
          </div>
        </div>
      </div>
    </div>
  )

  if (typeof document === 'undefined') return null
  return createPortal(modal, document.body)
}

function statusFor(action: 'validate' | 'request_changes' | 'reject'): VerificationStatus {
  return action === 'validate' ? 'validated' : action === 'reject' ? 'rejected' : 'changes_requested'
}
