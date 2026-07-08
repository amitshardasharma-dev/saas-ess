'use client'

export const dynamic = 'force-dynamic'

import { Suspense, useEffect, useMemo, useRef, useState, use } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import {
  ArrowLeft, FileText, ExternalLink, ShieldCheck, CheckCircle2, PenLine, MapPin, Calendar, Loader2,
} from 'lucide-react'
import { esignService } from '@/services/esign-client'
import { useAuthStore } from '@/stores/auth'
import type { DocumentField } from '@/types/esign'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { DocumentViewer } from '@/components/documents/document-viewer'
import { SignatureField, type SignatureFieldHandle } from '@/components/documents/signing/signature-field'
import toast from 'react-hot-toast'

interface DocMeta {
  title: string
  description: string | null
  bodyMarkdown: string | null
  currentVersion: number | null
  latestVersionId: string | null
  hasFile: boolean
}

function authHeaders(extra: HeadersInit = {}): HeadersInit {
  const token = typeof window !== 'undefined' ? localStorage.getItem('ess_access_token') : null
  return { ...extra, ...(token ? { Authorization: `Bearer ${token}` } : {}) }
}

function SignDocumentInner({ documentId }: { documentId: string }) {
  const search = useSearchParams()
  const { user } = useAuthStore()
  const signatureRef = useRef<SignatureFieldHandle>(null)

  const [versionId, setVersionId] = useState<string | null>(search.get('versionId'))
  const [meta, setMeta] = useState<DocMeta | null>(null)
  const [fields, setFields] = useState<DocumentField[]>([])
  const [values, setValues] = useState<Record<string, string | boolean>>({})
  const [signerName, setSignerName] = useState('')
  const [location, setLocation] = useState('')
  const [agreed, setAgreed] = useState(false)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [signedRecordId, setSignedRecordId] = useState<string | null>(null)
  const [downloading, setDownloading] = useState(false)

  // Download the signed PDF. The API needs the Bearer token (a plain <a href>
  // navigation can't send it — that returned 401); it returns a short-lived
  // signed URL, which we then fetch as a blob for a real download (falling back
  // to opening the URL if a cross-origin blob fetch is blocked).
  const downloadSignedCopy = async () => {
    if (!signedRecordId) return
    setDownloading(true)
    try {
      const res = await fetch(`/api/signed-documents/${signedRecordId}/download`, { headers: authHeaders() })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.url) throw new Error(data?.error || `HTTP ${res.status}`)
      const filename = `${(meta?.title || 'signed-document').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '')}.pdf`
      try {
        const pdf = await fetch(data.url as string)
        if (!pdf.ok) throw new Error()
        const objUrl = URL.createObjectURL(await pdf.blob())
        const a = document.createElement('a')
        a.href = objUrl
        a.download = filename
        document.body.appendChild(a)
        a.click()
        a.remove()
        URL.revokeObjectURL(objUrl)
      } catch {
        // Cross-origin blob fetch blocked — open the signed URL directly.
        window.open(data.url as string, '_blank', 'noopener,noreferrer')
      }
    } catch {
      toast.error('Could not download the signed copy')
    } finally {
      setDownloading(false)
    }
  }

  // Prefill the legal name from the signed-in volunteer's profile.
  useEffect(() => {
    if (user?.full_name && !signerName) setSignerName(user.full_name)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.full_name])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const [docRes, flds] = await Promise.all([
          fetch(`/api/documents/${documentId}`, { headers: authHeaders() }).then((r) => (r.ok ? r.json() : null)),
          esignService.getFields(documentId, search.get('versionId') ?? undefined).catch(() => [] as DocumentField[]),
        ])
        if (cancelled) return
        if (docRes?.document) {
          const latest = docRes.versions?.[0]
          setMeta({
            title: docRes.document.title ?? 'Document',
            description: docRes.document.description ?? null,
            bodyMarkdown: docRes.document.body_markdown ?? null,
            currentVersion: docRes.document.current_version ?? latest?.version_number ?? null,
            latestVersionId: latest?.id ?? null,
            hasFile: Boolean(latest),
          })
          if (!search.get('versionId') && latest?.id) setVersionId(latest.id)
        }
        setFields(flds)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [documentId, search])

  const setValue = (key: string, value: string | boolean) => setValues((p) => ({ ...p, [key]: value }))

  // Signature-type fields are satisfied by the SignatureField ceremony below, so
  // they're not rendered as separate text inputs.
  const visibleFields = useMemo(() => fields.filter((f) => f.type !== 'signature'), [fields])
  const missingRequired = visibleFields.some(
    (f) => f.required && (f.type === 'checkbox' ? !values[f.field_key] : !String(values[f.field_key] ?? '').trim()),
  )
  const nameOk = signerName.trim().length > 1
  const canSign = agreed && nameOk && !missingRequired && Boolean(versionId)

  const handleSubmit = async () => {
    if (!versionId) return toast.error('Could not resolve the document version')
    const signature = signatureRef.current?.resolve()
    if (!signature) {
      toast.error('Please draw or type your signature before signing')
      return
    }
    if (!canSign) return
    setSubmitting(true)
    try {
      const fieldValues: Record<string, unknown> = {}
      for (const f of fields) {
        if (f.type === 'signature') fieldValues[f.field_key] = signerName.trim()
        else fieldValues[f.field_key] = values[f.field_key] ?? (f.type === 'checkbox' ? false : '')
      }
      const result = await esignService.sign(documentId, {
        versionId,
        signerName: signerName.trim(),
        signatureType: signature.signatureType,
        fieldValues,
        signatureDataUrl: signature.signatureDataUrl,
        signingLocation: location.trim() || undefined,
      })
      setSignedRecordId(result?.id ?? null)
      setDone(true)
      toast.success('Document signed')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to sign document')
      setSubmitting(false)
    }
  }

  const today = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })

  if (loading) {
    return (
      <Card><CardContent className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading document…
      </CardContent></Card>
    )
  }

  if (!meta) {
    return (
      <Card><CardContent className="flex flex-col items-center gap-2 py-16 text-center text-sm text-muted-foreground">
        <FileText className="h-10 w-10 opacity-30" /> This document could not be loaded.
        <Button asChild variant="outline" size="sm" className="mt-2"><Link href="/dashboard/documents">Back to documents</Link></Button>
      </CardContent></Card>
    )
  }

  if (done) {
    return (
      <Card className="border-green-200 bg-green-50/60">
        <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
          <CheckCircle2 className="h-12 w-12 text-green-600" />
          <div>
            <h2 className="text-lg font-semibold">Signed successfully</h2>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
              You signed “{meta.title}” as {signerName.trim()} on {today}
              {location.trim() ? ` in ${location.trim()}` : ''}. A secure, hashed copy is recorded on your profile.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button asChild><Link href="/dashboard/onboarding">Back to onboarding</Link></Button>
            <Button asChild variant="outline"><Link href={`/dashboard/documents/${documentId}`}>View document</Link></Button>
            {signedRecordId ? (
              <Button variant="ghost" onClick={() => void downloadSignedCopy()} disabled={downloading}>
                {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />} Download signed copy
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* Document context + content to read */}
      <Card>
        <CardHeader>
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <FileText className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0">
              <CardTitle className="text-lg">{meta.title}</CardTitle>
              <CardDescription className="mt-1 flex flex-wrap items-center gap-2">
                <span>{meta.description || 'Please read this document carefully before signing.'}</span>
                {meta.currentVersion ? <Badge variant="outline" className="text-xs">v{meta.currentVersion}</Badge> : null}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border bg-muted/20 p-4 sm:p-6">
            <DocumentViewer
              documentId={documentId}
              bodyMarkdown={meta.bodyMarkdown}
              hasFile={meta.hasFile}
              versionId={meta.latestVersionId}
            />
          </div>
        </CardContent>
      </Card>

      {/* Non-signature fields to complete */}
      {visibleFields.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Complete the required information</CardTitle>
            <CardDescription>Fill in the details below before you sign.</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {visibleFields.map((field) => (
              <div key={field.id} className={field.type === 'checkbox' ? 'sm:col-span-2' : ''}>
                {field.type === 'checkbox' ? (
                  <label className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={Boolean(values[field.field_key])}
                      onChange={(e) => setValue(field.field_key, e.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded border-input"
                    />
                    <span>{field.label}{field.required ? <span className="ml-0.5 text-destructive">*</span> : null}</span>
                  </label>
                ) : (
                  <div className="space-y-1.5">
                    <Label className="text-sm">{field.label}{field.required ? <span className="ml-0.5 text-destructive">*</span> : null}</Label>
                    <Input
                      type={field.type === 'date' ? 'date' : 'text'}
                      value={String(values[field.field_key] ?? '')}
                      onChange={(e) => setValue(field.field_key, e.target.value)}
                    />
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {/* Signature ceremony */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <PenLine className="h-4 w-4 text-muted-foreground" /> Your signature
          </CardTitle>
          <CardDescription>Sign electronically to complete this document.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Read-and-agree affirmation */}
          <label className="flex items-start gap-3 rounded-lg border bg-muted/30 p-3 text-sm">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-input"
            />
            <span>
              I have read and understood this document and agree to its terms. I understand that signing below —
              by drawing or typing my name — constitutes my legal electronic signature, equivalent to a
              handwritten one.
            </span>
          </label>

          {/* Draw / type signature */}
          <div className="space-y-1.5">
            <Label className="text-sm">Signature <span className="text-destructive">*</span></Label>
            <SignatureField ref={signatureRef} signerName={signerName} />
          </div>

          {/* Name / date / location */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-sm">Full legal name <span className="text-destructive">*</span></Label>
              <Input value={signerName} onChange={(e) => setSignerName(e.target.value)} placeholder="e.g. Jordan Smith" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Location <span className="text-destructive">*</span></Label>
              <div className="relative">
                <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Gold Coast, QLD" className="pl-9" />
              </div>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-sm">Date</Label>
              <div className="flex h-9 items-center gap-2 rounded-md border border-dashed bg-muted/40 px-3 text-sm text-muted-foreground">
                <Calendar className="h-4 w-4" /> {today}
              </div>
            </div>
          </div>

          {/* Legal e-signature notice */}
          <div className="flex items-start gap-2 rounded-md bg-muted/40 p-3 text-xs text-muted-foreground">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
            <span>
              By selecting <strong>Sign document</strong> you consent to do business electronically and to sign
              this document electronically. Your signed copy is hashed and stored securely, and this signing —
              including your name, the date, and location — is recorded in a tamper-evident audit trail.
            </span>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between gap-3 border-t pt-4">
            <Button asChild variant="ghost" size="sm">
              <Link href={`/dashboard/documents/${documentId}`}><ArrowLeft className="h-4 w-4" /> Back</Link>
            </Button>
            <Button onClick={handleSubmit} disabled={!canSign || submitting}>
              {submitting ? <><Loader2 className="h-4 w-4 animate-spin" /> Signing…</> : 'Sign document'}
            </Button>
          </div>
          {!canSign ? (
            <p className="text-right text-xs text-muted-foreground">
              {missingRequired
                ? 'Please complete the required fields above.'
                : !nameOk
                  ? 'Enter your full legal name to continue.'
                  : !agreed
                    ? 'Confirm you have read and agree to the document.'
                    : 'Resolving the document version…'}
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}

export default function SignDocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: documentId } = use(params)
  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Review &amp; sign</h1>
        <p className="mt-1 text-sm text-muted-foreground">Read the document, complete any fields, and sign electronically.</p>
      </div>
      <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading…</div>}>
        <SignDocumentInner documentId={documentId} />
      </Suspense>
    </div>
  )
}
