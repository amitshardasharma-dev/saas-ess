// /dashboard/documents/manage/[id] — per-document admin REGISTER + HISTORY (hr+).
//
// A world-class compliance register for one document: who has / hasn't completed
// it, with audit-grade evidence for signed documents (signing location + a short
// content-hash chip), a completion progress bar, and the full version history.
//
//   • Gate: hr+ only (hasMinRole). Volunteers get a tidy 403, not a redirect.
//   • Source of truth depends on the document:
//       - signable docs       -> GET /signature-status (signed vs pending) joined
//                                with GET /signed-documents?document_id= for the
//                                immutable audit fields (location, content_hash).
//       - acknowledgment docs  -> GET /acknowledgments (acknowledged vs pending).
//   • Reachable from the manage list at /dashboard/documents/manage/[id].
//
// Client Component: bearer token from localStorage('ess_access_token'), fetch the
// API directly. Styling matches the document library + detail page: max-w-5xl
// shell, Card/Button/Badge primitives, lucide icons, neutral tokens, real
// loading / empty / error / forbidden states. No DashboardLayout, no gradients.

'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useAuthStore } from '@/stores/auth'
import { hasMinRole } from '@/types/roles'
import type { Document, DocumentVersion } from '@/types/document'
import type { SignedDocument } from '@/types/esign'
import { ProgressBar } from '@/components/training/progress-bar'
import { RegisterTable, type RegisterPerson } from '@/components/documents/register-table'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  ArrowLeft,
  FileText,
  PenLine,
  ClipboardCheck,
  CheckCircle2,
  Clock,
  Download,
  Ban,
  AlertCircle,
  Loader2,
  History,
} from 'lucide-react'

/* ----------------------------------- data ---------------------------------- */

function authHeaders(): HeadersInit {
  const token = typeof window !== 'undefined' ? localStorage.getItem('ess_access_token') : null
  return token ? { Authorization: `Bearer ${token}` } : {}
}

/** /signature-status row shape (staff view). */
interface SignatureStatusEmployee {
  id: string
  name: string
  employee_no: string | null
  department: string | null
  signed: boolean
  signed_at: string | null
  signed_document_id: string | null
}

/** /acknowledgments row shape. */
interface AcknowledgmentEmployee {
  id: string
  name: string
  employee_no: string | null
  department: string | null
  acknowledged: boolean
  acknowledged_at: string | null
}

type RegisterMode = 'signed' | 'acknowledged' | 'none'

interface RegisterData {
  document: Document
  versions: DocumentVersion[]
  mode: RegisterMode
  people: RegisterPerson[]
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'forbidden' }
  | { kind: 'error' }
  | { kind: 'not_found' }
  | { kind: 'ready'; data: RegisterData }

async function fetchJson<T>(url: string): Promise<{ ok: boolean; status: number; data: T | null }> {
  const res = await fetch(url, { headers: authHeaders() })
  if (!res.ok) return { ok: false, status: res.status, data: null }
  return { ok: true, status: res.status, data: (await res.json()) as T }
}

/* ----------------------------------- page ---------------------------------- */

export default function DocumentRegisterPage() {
  const params = useParams()
  const documentId = (params?.id as string) || ''
  const { user, isAuthenticated, checkAuth } = useAuthStore()
  const [state, setState] = useState<LoadState>({ kind: 'loading' })

  useEffect(() => {
    checkAuth()
  }, [checkAuth])

  const isStaff = !!user && hasMinRole(user.role, 'hr')

  const load = useCallback(async () => {
    setState({ kind: 'loading' })

    // 1. Document + versions + flags. 404 here -> not found / cross-tenant.
    const doc = await fetchJson<{
      document: Document
      versions: DocumentVersion[]
      signable?: boolean
    }>(`/api/documents/${documentId}`)

    if (!doc.ok || !doc.data) {
      if (doc.status === 403) return setState({ kind: 'forbidden' })
      if (doc.status === 404) return setState({ kind: 'not_found' })
      return setState({ kind: 'error' })
    }

    const { document, versions } = doc.data
    const signable = Boolean(doc.data.signable)
    const requiresAck = Boolean(document.requires_acknowledgment)

    // 2. Register source depends on the document type.
    if (signable) {
      // Signed/pending list + the immutable signed records (for audit fields).
      const [status, signedList] = await Promise.all([
        fetchJson<{ total: number; signed_count: number; employees: SignatureStatusEmployee[] }>(
          `/api/documents/${documentId}/signature-status`,
        ),
        fetchJson<{ signed_documents: SignedDocument[] }>(
          `/api/signed-documents?document_id=${documentId}`,
        ),
      ])

      if (!status.ok || !status.data) {
        if (status.status === 403) return setState({ kind: 'forbidden' })
        return setState({ kind: 'error' })
      }

      // Most-recent signed record per employee for the audit chips.
      const auditByEmployee = new Map<string, SignedDocument>()
      for (const rec of signedList.data?.signed_documents ?? []) {
        if (!auditByEmployee.has(rec.employee_id)) auditByEmployee.set(rec.employee_id, rec)
      }

      const people: RegisterPerson[] = status.data.employees.map((e) => {
        const audit = auditByEmployee.get(e.id)
        return {
          id: e.id,
          name: e.name,
          employee_no: e.employee_no,
          department: e.department,
          done: e.signed,
          doneAt: e.signed_at ?? audit?.signed_at ?? null,
          location: audit?.signing_location ?? null,
          contentHash: audit?.content_hash ?? null,
        }
      })

      return setState({ kind: 'ready', data: { document, versions, mode: 'signed', people } })
    }

    if (requiresAck) {
      const ack = await fetchJson<{
        total: number
        acknowledged_count: number
        employees: AcknowledgmentEmployee[]
      }>(`/api/documents/${documentId}/acknowledgments`)

      if (!ack.ok || !ack.data) {
        if (ack.status === 403) return setState({ kind: 'forbidden' })
        return setState({ kind: 'error' })
      }

      const people: RegisterPerson[] = ack.data.employees.map((e) => ({
        id: e.id,
        name: e.name,
        employee_no: e.employee_no,
        department: e.department,
        done: e.acknowledged,
        doneAt: e.acknowledged_at,
      }))

      return setState({ kind: 'ready', data: { document, versions, mode: 'acknowledged', people } })
    }

    // Informational document: no register, but we still show metadata + history.
    return setState({ kind: 'ready', data: { document, versions, mode: 'none', people: [] } })
  }, [documentId])

  useEffect(() => {
    if (isAuthenticated && user && isStaff && documentId) void load()
  }, [isAuthenticated, user, isStaff, documentId, load])

  /* ------------------------------- gate states ------------------------------ */

  // Still resolving the session.
  if (!isAuthenticated || !user) {
    return (
      <Shell>
        <Card>
          <CardContent className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </CardContent>
        </Card>
      </Shell>
    )
  }

  // hr+ only — tidy 403 for volunteers (no redirect).
  if (!isStaff) {
    return (
      <Shell>
        <BackLink />
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-16 text-center text-sm text-muted-foreground">
            <Ban className="h-10 w-10 opacity-30" />
            You do not have access to the document register.
          </CardContent>
        </Card>
      </Shell>
    )
  }

  if (state.kind === 'loading') {
    return (
      <Shell>
        <BackLink />
        <Card>
          <CardContent className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading register…
          </CardContent>
        </Card>
      </Shell>
    )
  }

  if (state.kind === 'forbidden') {
    return (
      <Shell>
        <BackLink />
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-16 text-center text-sm text-muted-foreground">
            <Ban className="h-10 w-10 opacity-30" />
            You do not have access to this document’s register.
          </CardContent>
        </Card>
      </Shell>
    )
  }

  if (state.kind === 'not_found') {
    return (
      <Shell>
        <BackLink />
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-16 text-center text-sm text-muted-foreground">
            <FileText className="h-10 w-10 opacity-30" />
            This document doesn’t exist or has been removed.
          </CardContent>
        </Card>
      </Shell>
    )
  }

  if (state.kind === 'error') {
    return (
      <Shell>
        <BackLink />
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center text-sm text-muted-foreground">
            <AlertCircle className="h-10 w-10 opacity-30" />
            Could not load the register.
            <Button variant="outline" size="sm" onClick={() => void load()}>
              Try again
            </Button>
          </CardContent>
        </Card>
      </Shell>
    )
  }

  /* --------------------------------- ready ---------------------------------- */

  const { document, versions, mode, people } = state.data
  const doneCount = people.filter((p) => p.done).length
  const total = people.length
  const percent = total > 0 ? (doneCount / total) * 100 : 0
  const actionVerb = mode === 'signed' ? 'signed' : 'acknowledged'
  const category =
    (document as Document & { category_name?: string }).category_name || 'Uncategorized'

  return (
    <Shell>
      <BackLink />

      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
          <FileText className="h-5 w-5 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold text-foreground">{document.title}</h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <Badge variant="outline">{category}</Badge>
            {document.is_published ? (
              <Badge variant="outline" className="gap-1 text-green-700">
                <CheckCircle2 className="h-3.5 w-3.5" /> Published
              </Badge>
            ) : (
              <Badge variant="outline" className="gap-1 text-amber-700">
                <Clock className="h-3.5 w-3.5" /> Draft
              </Badge>
            )}
            {mode === 'signed' ? (
              <Badge variant="outline" className="gap-1">
                <PenLine className="h-3.5 w-3.5" /> Requires signature
              </Badge>
            ) : mode === 'acknowledged' ? (
              <Badge variant="outline" className="gap-1">
                <ClipboardCheck className="h-3.5 w-3.5" /> Requires acknowledgment
              </Badge>
            ) : (
              <Badge variant="outline">Informational</Badge>
            )}
            <span>Version {document.current_version}</span>
          </div>
        </div>
      </div>

      {document.description ? (
        <p className="text-sm text-muted-foreground">{document.description}</p>
      ) : null}

      {/* Completion summary */}
      {mode === 'none' ? (
        <Card>
          <CardContent className="flex items-center gap-3 py-6 text-sm text-muted-foreground">
            <ClipboardCheck className="h-5 w-5 shrink-0 opacity-50" />
            This document is informational — it doesn’t require a signature or
            acknowledgment, so there’s no completion register to track.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              {mode === 'signed' ? (
                <PenLine className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
              )}
              Completion
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-end justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                <span className="text-2xl font-semibold text-foreground">{doneCount}</span>
                <span className="mx-1">of</span>
                <span className="font-medium text-foreground">{total}</span> {actionVerb}
              </p>
              {total > 0 ? (
                <Badge
                  variant="outline"
                  className={
                    doneCount === total ? 'gap-1 text-green-700' : 'gap-1 text-amber-700'
                  }
                >
                  {doneCount === total ? (
                    <>
                      <CheckCircle2 className="h-3.5 w-3.5" /> Complete
                    </>
                  ) : (
                    <>
                      <Clock className="h-3.5 w-3.5" /> {total - doneCount} pending
                    </>
                  )}
                </Badge>
              ) : null}
            </div>
            <ProgressBar percent={percent} />
          </CardContent>
        </Card>
      )}

      {/* Register table */}
      {mode !== 'none' ? (
        <RegisterTable people={people} mode={mode} />
      ) : null}

      {/* Version history */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <History className="h-4 w-4 text-muted-foreground" /> Version history
          </CardTitle>
        </CardHeader>
        <CardContent>
          {versions.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No versions uploaded yet.
            </p>
          ) : (
            <div className="space-y-2">
              {versions.map((v, i) => (
                <div
                  key={v.id}
                  className={`flex items-center justify-between gap-3 rounded-lg border p-3 ${
                    i === 0 ? 'border-primary/30 bg-primary/5' : ''
                  }`}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">
                        v{v.version_number} — {v.file_name}
                        {i === 0 ? (
                          <Badge variant="outline" className="ml-2 align-middle text-[10px]">
                            Latest
                          </Badge>
                        ) : null}
                      </p>
                      {v.changelog ? (
                        <p className="truncate text-xs text-muted-foreground">{v.changelog}</p>
                      ) : null}
                      <p className="text-xs text-muted-foreground">
                        {new Date(v.uploaded_at).toLocaleDateString('en-GB', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                        {Number.isFinite(v.file_size) && v.file_size > 0
                          ? ` · ${(v.file_size / 1024).toFixed(0)} KB`
                          : ''}
                      </p>
                    </div>
                  </div>
                  {v.file_url ? (
                    <Button
                      asChild
                      variant="ghost"
                      size="icon"
                      title={`Download v${v.version_number}`}
                    >
                      <a href={v.file_url} target="_blank" rel="noopener noreferrer">
                        <Download className="h-4 w-4" />
                      </a>
                    </Button>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </Shell>
  )
}

/* -------------------------------- chrome bits ------------------------------- */

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto w-full max-w-5xl space-y-6 p-6">{children}</div>
}

function BackLink() {
  return (
    <Button asChild variant="ghost" size="sm" className="-ml-2 gap-1 text-muted-foreground">
      <Link href="/dashboard/documents/manage">
        <ArrowLeft className="h-4 w-4" /> Manage documents
      </Link>
    </Button>
  )
}
