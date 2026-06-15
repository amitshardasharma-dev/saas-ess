// /dashboard/compliance — role-aware compliance experience.
//
//  • Volunteers (role 'employee') get a self-service "My certifications" view:
//    their own certs as cards (CertBadge + days-until) plus an "Add certificate"
//    form that posts to the self-scoped /api/profile/certifications. This closes
//    the onboarding "Add certificate" CTA, which previously had nowhere to submit
//    (the hr POST is role-gated).
//
//  • Staff/Admin (hr+) keep the company-wide register: every certification with
//    overdue/expiring surfaced first, summary counts, and traffic-light status.
//    Access is enforced server-side (scope=all requires hr+); a 403 renders a
//    friendly message.
//
// Client Component (bearer token from localStorage, fetch the API). Styling
// matches the document library: max-w-5xl shell, Card/Badge primitives, lucide
// icons, neutral tokens, real loading/empty/error states.
'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { useAuthStore } from '@/stores/auth'
import { useLabels } from '@/hooks/use-labels'
import { hasMinRole } from '@/types/roles'
import { calcStatus, daysUntil, type CertStatus } from '@/lib/compliance/expiry'
import { CertBadge } from '@/components/compliance/cert-badge'
import { AddCertificate, type CertTypeOption } from '@/components/compliance/add-certificate'
import { Card, CardContent } from '@/components/ui/card'
import {
  ShieldCheck,
  AlertCircle,
  CalendarClock,
  CheckCircle2,
  Loader2,
  Award,
  Ban,
  FileText,
  Upload,
} from 'lucide-react'

function authHeaders(extra: HeadersInit = {}): HeadersInit {
  const token = typeof window !== 'undefined' ? localStorage.getItem('ess_access_token') : null
  return { ...extra, ...(token ? { Authorization: `Bearer ${token}` } : {}) }
}

function rank(status: CertStatus): number {
  return status === 'expired' ? 0 : status === 'expiring' ? 1 : 2
}

/** Friendly "x days" phrasing from a signed days-until-expiry. */
function expiryHint(status: CertStatus, days: number | null): string {
  if (days === null) return 'No expiry'
  if (status === 'expired') {
    const ago = Math.abs(days)
    return `Expired ${ago} day${ago === 1 ? '' : 's'} ago`
  }
  if (days === 0) return 'Expires today'
  return `Expires in ${days} day${days === 1 ? '' : 's'}`
}

export default function ComplianceDashboardPage() {
  const { user, isAuthenticated, checkAuth } = useAuthStore()

  useEffect(() => {
    checkAuth()
  }, [checkAuth])

  if (!isAuthenticated || !user) {
    return (
      <div className="mx-auto w-full max-w-5xl p-6">
        <Card>
          <CardContent className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </CardContent>
        </Card>
      </div>
    )
  }

  // hr+ get the company-wide register; everyone else gets their own certs.
  return hasMinRole(user.role, 'hr') ? <StaffRegister /> : <MyCertifications />
}

/* ============================ Volunteer view ============================ */

interface MyCert {
  id: string
  cert_type_name: string | null
  title: string
  completion_date: string | null
  expiry_date: string | null
  status: CertStatus
  days_until_expiry: number | null
  file_url: string | null
  file_name: string | null
}

type MyState =
  | { kind: 'loading' }
  | { kind: 'forbidden' }
  | { kind: 'error' }
  | { kind: 'ok'; certs: MyCert[]; certTypes: CertTypeOption[] }

function MyCertifications() {
  const { t } = useLabels()
  const [state, setState] = useState<MyState>({ kind: 'loading' })

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/profile/certifications', { headers: authHeaders() })
      if (res.status === 403) {
        setState({ kind: 'forbidden' })
        return
      }
      if (!res.ok) {
        setState({ kind: 'error' })
        return
      }
      const data = await res.json()
      const certs: MyCert[] = (data.certifications || []).map((c: Record<string, unknown>) => {
        const expiry = (c.expiry_date as string | null) ?? null
        const status = (c.status as CertStatus) ?? calcStatus(expiry)
        return {
          id: c.id as string,
          cert_type_name: (c.cert_type_name as string | null) ?? null,
          title: (c.title as string) ?? '',
          completion_date: (c.completion_date as string | null) ?? null,
          expiry_date: expiry,
          status,
          days_until_expiry: (c.days_until_expiry as number | null) ?? daysUntil(expiry),
          file_url: (c.file_url as string | null) ?? null,
          file_name: (c.file_name as string | null) ?? null,
        }
      })
      const certTypes: CertTypeOption[] = (data.cert_types || []).map((tp: Record<string, unknown>) => ({
        id: tp.id as string,
        name: (tp.name as string) ?? '',
        validity_months: (tp.validity_months as number | null) ?? null,
        requires_file: Boolean(tp.requires_file),
      }))
      setState({ kind: 'ok', certs, certTypes })
    } catch {
      setState({ kind: 'error' })
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const certNoun = t('certification').toLowerCase()
  const certNounPlural = t('certification', { plural: true }).toLowerCase()

  const sorted = useMemo(() => {
    if (state.kind !== 'ok') return []
    return [...state.certs].sort((a, b) => {
      if (rank(a.status) !== rank(b.status)) return rank(a.status) - rank(b.status)
      const da = a.days_until_expiry ?? Number.POSITIVE_INFINITY
      const db = b.days_until_expiry ?? Number.POSITIVE_INFINITY
      return da - db
    })
  }, [state])

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">My {certNounPlural}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your {certNounPlural} and their expiry. Add new ones as you complete them.
        </p>
      </div>

      {state.kind === 'forbidden' ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-16 text-center text-sm text-muted-foreground">
            <Ban className="h-10 w-10 opacity-30" />
            {capitalize(certNoun)} tracking isn&apos;t enabled for your organisation.
          </CardContent>
        </Card>
      ) : state.kind === 'loading' ? (
        <Card>
          <CardContent className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading your {certNounPlural}…
          </CardContent>
        </Card>
      ) : state.kind === 'error' ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-16 text-center text-sm text-muted-foreground">
            <AlertCircle className="h-10 w-10 opacity-30" /> Could not load your {certNounPlural}.
          </CardContent>
        </Card>
      ) : (
        <>
          {sorted.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-2 py-12 text-center text-sm text-muted-foreground">
                <Award className="h-10 w-10 opacity-30" />
                You haven&apos;t added any {certNounPlural} yet. Add your first one below.
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {sorted.map((c) => (
                <MyCertCard key={c.id} cert={c} onChanged={load} />
              ))}
            </div>
          )}

          <AddCertificate certTypes={state.certTypes} onCreated={load} certNoun={certNoun} />
        </>
      )}
    </div>
  )
}

function MyCertCard({ cert, onChanged }: { cert: MyCert; onChanged: () => void }) {
  const amber = cert.status === 'expiring'
  const red = cert.status === 'expired'
  const iconWrap = red ? 'bg-red-100' : amber ? 'bg-amber-100' : 'bg-primary/10'
  const iconColor = red ? 'text-red-600' : amber ? 'text-amber-600' : 'text-primary'

  const [viewing, setViewing] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Fetch a short-lived signed URL for the caller's own evidence and open it.
  const viewFile = async () => {
    setViewing(true)
    try {
      const res = await fetch(`/api/profile/certifications/${cert.id}/file`, { headers: authHeaders() })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.url) throw new Error(data?.error ?? 'Could not open the file')
      window.open(data.url as string, '_blank', 'noopener,noreferrer')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not open the file')
    } finally {
      setViewing(false)
    }
  }

  const onAttach = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 20 * 1024 * 1024) {
      toast.error('File must be under 20MB')
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch(`/api/profile/certifications/${cert.id}/file`, {
        method: 'POST',
        headers: authHeaders(),
        body: fd,
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error ?? 'Upload failed')
      toast.success('Document attached')
      onChanged()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  return (
    <Card className={red ? 'border-red-200' : amber ? 'border-amber-200' : 'border-border/60'}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className={`shrink-0 rounded-lg p-2 ${iconWrap}`}>
            <Award className={`h-5 w-5 ${iconColor}`} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <h3 className="truncate text-sm font-semibold text-foreground">{cert.title}</h3>
              <CertBadge status={cert.status} />
            </div>
            {cert.cert_type_name ? (
              <p className="mt-0.5 truncate text-xs text-muted-foreground">{cert.cert_type_name}</p>
            ) : null}
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <CalendarClock className="h-3.5 w-3.5" />
                {expiryHint(cert.status, cert.days_until_expiry)}
              </span>
              {cert.expiry_date ? <span>· {formatDate(cert.expiry_date)}</span> : null}
            </div>

            {/* Document: view it if present, otherwise offer to attach one. */}
            <div className="mt-3 border-t pt-3">
              {cert.file_url ? (
                <button
                  type="button"
                  onClick={viewFile}
                  disabled={viewing}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline disabled:opacity-60"
                >
                  {viewing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
                  <span className="max-w-[12rem] truncate">{cert.file_name || 'View document'}</span>
                </button>
              ) : (
                <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground">
                  {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                  {uploading ? 'Uploading…' : 'Attach document'}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/*"
                    onChange={onAttach}
                    disabled={uploading}
                    className="sr-only"
                  />
                </label>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

/* ============================== Staff view ============================== */

interface Row {
  id: string
  employee_name: string | null
  cert_type_name: string | null
  title: string
  expiry_date: string | null
  status: CertStatus
  days_until_expiry: number | null
}

type StaffState =
  | { kind: 'loading' }
  | { kind: 'forbidden' }
  | { kind: 'error' }
  | { kind: 'ok'; rows: Row[] }

function StaffRegister() {
  const { t } = useLabels()
  const [state, setState] = useState<StaffState>({ kind: 'loading' })

  useEffect(() => {
    let active = true
    fetch('/api/certifications?scope=all', { headers: authHeaders() })
      .then(async (res) => {
        if (!active) return
        if (res.status === 403) {
          setState({ kind: 'forbidden' })
          return
        }
        if (!res.ok) {
          setState({ kind: 'error' })
          return
        }
        const data = await res.json()
        const rows: Row[] = (data.certifications || []).map((c: Record<string, unknown>) => {
          const expiry = (c.expiry_date as string | null) ?? null
          const status = (c.status as CertStatus) ?? calcStatus(expiry)
          return {
            id: c.id as string,
            employee_name: (c.employee_name as string | null) ?? null,
            cert_type_name: (c.cert_type_name as string | null) ?? null,
            title: (c.title as string) ?? '',
            expiry_date: expiry,
            status,
            days_until_expiry: (c.days_until_expiry as number | null) ?? daysUntil(expiry),
          }
        })
        setState({ kind: 'ok', rows })
      })
      .catch(() => {
        if (active) setState({ kind: 'error' })
      })
    return () => {
      active = false
    }
  }, [])

  const sorted = useMemo(() => {
    if (state.kind !== 'ok') return []
    return [...state.rows].sort((a, b) => {
      if (rank(a.status) !== rank(b.status)) return rank(a.status) - rank(b.status)
      const da = a.days_until_expiry ?? Number.POSITIVE_INFINITY
      const db = b.days_until_expiry ?? Number.POSITIVE_INFINITY
      return da - db
    })
  }, [state])

  const counts = useMemo(() => {
    if (state.kind !== 'ok') return { expired: 0, expiring: 0, valid: 0 }
    return {
      expired: state.rows.filter((r) => r.status === 'expired').length,
      expiring: state.rows.filter((r) => r.status === 'expiring').length,
      valid: state.rows.filter((r) => r.status === 'valid').length,
    }
  }, [state])

  const certNounPlural = t('certification', { plural: true }).toLowerCase()

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Compliance</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every {t('certification').toLowerCase()} across your organisation, with overdue and expiring surfaced first.
        </p>
      </div>

      {state.kind === 'forbidden' ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-16 text-center text-sm text-muted-foreground">
            <Ban className="h-10 w-10 opacity-30" /> You do not have access to the compliance register.
          </CardContent>
        </Card>
      ) : state.kind === 'loading' ? (
        <Card>
          <CardContent className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading compliance data…
          </CardContent>
        </Card>
      ) : state.kind === 'error' ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-16 text-center text-sm text-muted-foreground">
            <AlertCircle className="h-10 w-10 opacity-30" /> Could not load compliance data.
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <SummaryCard label="Overdue" value={counts.expired} tone="red" Icon={AlertCircle} />
            <SummaryCard label="Expiring soon" value={counts.expiring} tone="amber" Icon={CalendarClock} />
            <SummaryCard label="Valid" value={counts.valid} tone="green" Icon={CheckCircle2} />
          </div>

          <Card>
            <CardContent className="p-0">
              {sorted.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-16 text-center text-sm text-muted-foreground">
                  <ShieldCheck className="h-10 w-10 opacity-30" /> No {certNounPlural} found.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="px-4 py-3 font-medium">{t('person')}</th>
                        <th className="px-4 py-3 font-medium">{t('certification')}</th>
                        <th className="px-4 py-3 font-medium">Expiry</th>
                        <th className="px-4 py-3 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sorted.map((row) => (
                        <tr key={row.id} className="border-b last:border-0 hover:bg-muted/40">
                          <td className="px-4 py-3 text-foreground">{row.employee_name ?? '—'}</td>
                          <td className="px-4 py-3 text-foreground">{row.cert_type_name ?? row.title}</td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {row.expiry_date ? formatDate(row.expiry_date) : '—'}
                          </td>
                          <td className="px-4 py-3">
                            <CertBadge status={row.status} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}

function SummaryCard({
  label,
  value,
  tone,
  Icon,
}: {
  label: string
  value: number
  tone: 'red' | 'amber' | 'green'
  Icon: React.ComponentType<{ className?: string }>
}) {
  const toneClass =
    tone === 'red'
      ? 'bg-red-100 text-red-600'
      : tone === 'amber'
        ? 'bg-amber-100 text-amber-600'
        : 'bg-green-100 text-green-600'
  return (
    <Card>
      <CardContent className="flex items-center gap-3 py-4">
        <div className={`rounded-lg p-2 ${toneClass}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <div className="text-2xl font-semibold text-foreground">{value}</div>
          <div className="text-xs text-muted-foreground">{label}</div>
        </div>
      </CardContent>
    </Card>
  )
}

/* =============================== helpers =============================== */

function formatDate(iso: string): string {
  const d = new Date(iso.slice(0, 10) + 'T00:00:00Z')
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

function capitalize(s: string): string {
  return s.length ? s[0].toUpperCase() + s.slice(1) : s
}
