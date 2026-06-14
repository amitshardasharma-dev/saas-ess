'use client'

export const dynamic = 'force-dynamic'

import { Suspense, useEffect, useState, use } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { ArrowLeft, FileText, ExternalLink, ShieldCheck, CheckCircle2, PenLine, Loader2 } from 'lucide-react'
import { esignService } from '@/services/esign-client'
import type { DocumentField } from '@/types/esign'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import toast from 'react-hot-toast'

interface DocMeta {
  title: string
  description: string | null
  current_version: number | null
  latestVersionId: string | null
}

function authHeaders(extra: HeadersInit = {}): HeadersInit {
  const token = typeof window !== 'undefined' ? localStorage.getItem('ess_access_token') : null
  return { ...extra, ...(token ? { Authorization: `Bearer ${token}` } : {}) }
}

function SignDocumentInner({ documentId }: { documentId: string }) {
  const search = useSearchParams()
  const [versionId, setVersionId] = useState<string | null>(search.get('versionId'))

  const [meta, setMeta] = useState<DocMeta | null>(null)
  const [fields, setFields] = useState<DocumentField[]>([])
  const [values, setValues] = useState<Record<string, string | boolean>>({})
  const [signerName, setSignerName] = useState('')
  const [agreed, setAgreed] = useState(false)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

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
            current_version: docRes.document.current_version ?? latest?.version_number ?? null,
            latestVersionId: latest?.id ?? null,
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

  // Signature-type fields are satisfied by the typed name below, so they're not
  // shown as separate inputs.
  const visibleFields = fields.filter((f) => f.type !== 'signature')
  const missingRequired = visibleFields.some((f) => f.required && f.type !== 'checkbox' && !String(values[f.field_key] ?? '').trim())
  const canSign = agreed && signerName.trim().length > 1 && !missingRequired && Boolean(versionId)

  const handleSubmit = async () => {
    if (!versionId) return toast.error('Could not resolve the document version')
    if (!canSign) return
    setSubmitting(true)
    try {
      const fieldValues: Record<string, unknown> = {}
      for (const f of fields) fieldValues[f.field_key] = f.type === 'signature' ? signerName.trim() : (values[f.field_key] ?? '')
      await esignService.sign(documentId, { versionId, signerName: signerName.trim(), signatureType: 'typed', fieldValues })
      setDone(true)
      toast.success('Document signed')
    } catch {
      toast.error('Failed to sign document')
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

  if (done) {
    return (
      <Card className="border-green-200 bg-green-50/50">
        <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
          <CheckCircle2 className="h-12 w-12 text-green-600" />
          <div>
            <h2 className="text-lg font-semibold">Signed successfully</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              You signed “{meta?.title}” as {signerName.trim()} on {today}. A copy is stored on your profile.
            </p>
          </div>
          <div className="flex gap-3">
            <Button asChild><Link href="/dashboard/onboarding">Back to onboarding</Link></Button>
            <Button asChild variant="outline"><Link href="/dashboard/documents">My documents</Link></Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* Document context */}
      <Card>
        <CardHeader>
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <FileText className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0">
              <CardTitle className="text-lg">{meta?.title ?? 'Document'}</CardTitle>
              <CardDescription>
                {meta?.description || 'Please review this document carefully before signing.'}
                {meta?.current_version ? <span className="ml-1 text-xs">· v{meta.current_version}</span> : null}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline" size="sm">
            <a href={`/dashboard/documents/${documentId}`} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-4 w-4" /> View full document
            </a>
          </Button>
        </CardContent>
      </Card>

      {/* Fields to complete */}
      {visibleFields.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Complete the required information</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {visibleFields.map((field) => (
              <div key={field.id} className={field.type === 'checkbox' ? 'sm:col-span-2' : ''}>
                {field.type === 'checkbox' ? (
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={Boolean(values[field.field_key])}
                      onChange={(e) => setValue(field.field_key, e.target.checked)}
                      className="h-4 w-4 rounded border-input"
                    />
                    {field.label}{field.required ? <span className="text-destructive">*</span> : null}
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

      {/* Signature */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><PenLine className="h-4 w-4 text-muted-foreground" /> Your signature</CardTitle>
          <CardDescription>Sign electronically to complete this document.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="flex items-start gap-3 rounded-lg border bg-muted/30 p-3 text-sm">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-input"
            />
            <span>
              I have read and understood this document and agree to its terms. I understand that typing my
              name below and selecting <strong>Sign document</strong> constitutes my legal electronic
              signature, equivalent to a handwritten one.
            </span>
          </label>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-sm">Type your full legal name <span className="text-destructive">*</span></Label>
              <Input value={signerName} onChange={(e) => setSignerName(e.target.value)} placeholder="e.g. Jordan Smith" />
              {signerName.trim() ? (
                <p className="pt-1 font-[cursive] text-xl text-foreground">{signerName.trim()}</p>
              ) : null}
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Date</Label>
              <div className="flex h-9 items-center rounded-md border border-dashed bg-muted/40 px-3 text-sm text-muted-foreground">{today}</div>
            </div>
          </div>

          <div className="flex items-center gap-2 rounded-md bg-muted/40 p-3 text-xs text-muted-foreground">
            <ShieldCheck className="h-4 w-4 shrink-0 text-green-600" />
            Your signed copy is hashed and stored securely; this signing is recorded in an audit trail.
          </div>

          <div className="flex items-center justify-between gap-3 border-t pt-4">
            <Button asChild variant="ghost" size="sm">
              <Link href="/dashboard/onboarding"><ArrowLeft className="h-4 w-4" /> Back</Link>
            </Button>
            <Button onClick={handleSubmit} disabled={!canSign || submitting}>
              {submitting ? <><Loader2 className="h-4 w-4 animate-spin" /> Signing…</> : 'Sign document'}
            </Button>
          </div>
          {missingRequired ? <p className="text-right text-xs text-destructive">Please complete the required fields above.</p> : null}
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
