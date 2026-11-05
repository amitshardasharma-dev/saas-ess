'use client'

export const dynamic = 'force-dynamic'

import { Suspense, useEffect, useMemo, useState, use } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import {
  ArrowLeft, FileText, ExternalLink, ShieldCheck, CheckCircle2, PenLine, MapPin, Calendar, Loader2, Check, Clock, Hourglass,
} from 'lucide-react'
import { esignService, type SigningState } from '@/services/esign-client'
import { useAuthStore } from '@/stores/auth'
import type { DocumentField } from '@/types/esign'
import { autoFillValue } from '@/lib/esign/field-catalog'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { DocumentViewer } from '@/components/documents/document-viewer'
import { SignOverlay } from '@/components/documents/signing/sign-overlay'
import { SignatureCaptureModal } from '@/components/documents/signing/signature-capture-modal'
import type { SignatureValue } from '@/components/documents/signing/signature-field'
import toast from 'react-hot-toast'
import { saveBlob } from '@/lib/save-blob'

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

  const [versionId, setVersionId] = useState<string | null>(search.get('versionId'))
  const [meta, setMeta] = useState<DocMeta | null>(null)
  const [fields, setFields] = useState<DocumentField[]>([])
  const [values, setValues] = useState<Record<string, string | boolean>>({})
  const [pdfData, setPdfData] = useState<ArrayBuffer | null>(null)
  const [signature, setSignature] = useState<SignatureValue | null>(null)
  const [showSig, setShowSig] = useState(false)
  const [signerName, setSignerName] = useState('')
  const [location, setLocation] = useState('')
  const [agreed, setAgreed] = useState(false)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [signedRecordId, setSignedRecordId] = useState<string | null>(null)
  const [downloading, setDownloading] = useState(false)
  // MOS-720: set when the document has a signing order (several signers).
  const [seq, setSeq] = useState<SigningState | null>(null)
  const [stepResult, setStepResult] = useState<{ status: 'in_progress' | 'completed'; next: { label: string; name: string | null } | null } | null>(null)
  const recipient = search.get('recipient')

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
        saveBlob(await pdf.blob(), filename)
      } catch {
        window.open(data.url as string, '_blank', 'noopener,noreferrer')
      }
    } catch {
      toast.error('Could not download the signed copy')
    } finally {
      setDownloading(false)
    }
  }

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
        let resolvedVersion = search.get('versionId')
        let hasFile = false
        if (docRes?.document) {
          const latest = docRes.versions?.[0]
          hasFile = Boolean(latest)
          setMeta({
            title: docRes.document.title ?? 'Document',
            description: docRes.document.description ?? null,
            bodyMarkdown: docRes.document.body_markdown ?? null,
            currentVersion: docRes.document.current_version ?? latest?.version_number ?? null,
            latestVersionId: latest?.id ?? null,
            hasFile,
          })
          if (!resolvedVersion && latest?.id) { resolvedVersion = latest.id; setVersionId(latest.id) }
        }
        setFields(flds)

        // Signing order: which step (if any) is the viewer's on this copy.
        let state: SigningState | null = null
        if (resolvedVersion) {
          const st = await esignService.getSigningState(documentId, resolvedVersion, recipient).catch(() => null)
          if (st && st.multi) state = st as SigningState
        }
        if (cancelled) return
        setSeq(state)

        // Auto-fill known fields from the signer's profile so they do less work.
        const profile = { fullName: user?.full_name ?? null, email: (user as { email?: string } | null)?.email ?? null, employeeNo: null }
        const initial: Record<string, string | boolean> = {}
        for (const f of flds) {
          if (f.type === 'signature') continue
          if (state && (f.signer_role || 'recipient') !== state.myRole) continue
          const v = autoFillValue(f.kind ?? 'custom', profile)
          if (v) initial[f.field_key] = v
        }
        setValues(initial)

        // Load the PDF bytes for the in-context overlay when the doc has a file.
        if (hasFile && resolvedVersion) {
          const res = await fetch(`/api/documents/${documentId}/file?versionId=${resolvedVersion}`, { headers: authHeaders() })
          if (res.ok && !cancelled) setPdfData(await res.arrayBuffer())
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [documentId, search, user, recipient])

  const setValue = (key: string, value: string | boolean) => setValues((p) => ({ ...p, [key]: value }))

  // With a signing order, the viewer only completes their own step's fields.
  const myFields = useMemo(
    () => (seq ? fields.filter((f) => (f.signer_role || 'recipient') === seq.myRole) : fields),
    [fields, seq],
  )
  const nonSigFields = useMemo(() => myFields.filter((f) => f.type !== 'signature'), [myFields])
  const hasSignatureField = useMemo(() => myFields.some((f) => f.type === 'signature'), [myFields])
  const myStep = seq?.steps.find((s) => s.key === seq.myRole) ?? null
  const roleLabels = useMemo(() => Object.fromEntries((seq?.steps ?? []).map((s) => [s.key, s.label])), [seq])
  const missingRequired = nonSigFields.some(
    (f) => f.required && (f.type === 'checkbox' ? !values[f.field_key] : !String(values[f.field_key] ?? '').trim()),
  )
  const hasSignature = signature?.signatureType === 'drawn' ? !!signature.signatureDataUrl : !!signature
  const nameOk = signerName.trim().length > 1
  const canSign = agreed && nameOk && !missingRequired && Boolean(versionId) && hasSignature && (!seq || !!seq.myRole)

  const handleSubmit = async () => {
    if (!versionId) return toast.error('Could not resolve the document version')
    if (!hasSignature || !signature) { toast.error('Please add your signature'); setShowSig(true); return }
    if (!canSign) return
    setSubmitting(true)
    try {
      const fieldValues: Record<string, unknown> = {}
      for (const f of myFields) {
        if (f.type === 'signature') fieldValues[f.field_key] = signerName.trim()
        else fieldValues[f.field_key] = values[f.field_key] ?? (f.type === 'checkbox' ? false : '')
      }
      if (seq) {
        const step = await esignService.signStep(documentId, {
          versionId,
          signerName: signerName.trim(),
          signatureType: signature.signatureType,
          fieldValues,
          signatureDataUrl: signature.signatureDataUrl,
          signingLocation: location.trim() || undefined,
          recipientEmployeeId: recipient || undefined,
        })
        setSignedRecordId(step.signedDocumentId)
        setStepResult({ status: step.status, next: step.next })
        setDone(true)
        toast.success(step.status === 'completed' ? 'Document fully signed' : 'Signature recorded')
        return
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
    return <Card><CardContent className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading document…</CardContent></Card>
  }
  if (!meta) {
    return <Card><CardContent className="flex flex-col items-center gap-2 py-16 text-center text-sm text-muted-foreground"><FileText className="h-10 w-10 opacity-30" /> This document could not be loaded.<Button asChild variant="outline" size="sm" className="mt-2"><Link href="/dashboard/documents">Back to documents</Link></Button></CardContent></Card>
  }
  if (done && seq) {
    const complete = stepResult?.status === 'completed'
    const forOther = !!seq.recipientEmployeeId && seq.recipientName && seq.myRole !== 'recipient'
    return (
      <Card className="border-green-200 bg-green-50/60">
        <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
          <CheckCircle2 className="h-12 w-12 text-green-600" />
          <div>
            <h2 className="text-lg font-semibold">{complete ? 'Fully signed' : 'Your signature is recorded'}</h2>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
              You signed “{meta.title}”{myStep ? ` as ${myStep.label}` : ''}{forOther ? ` for ${seq.recipientName}` : ''} on {today}.{' '}
              {complete
                ? 'Everyone has signed. A secure, hashed copy has been recorded.'
                : seq.shared
                  ? 'Your signature will be applied to every copy of this document.'
                  : stepResult?.next
                    ? `${stepResult.next.label}${stepResult.next.name ? ` (${stepResult.next.name})` : ''} has been notified to sign next.`
                    : 'The next signer has been notified.'}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button asChild><Link href={seq.myRole === 'recipient' ? '/dashboard/onboarding' : '/dashboard/documents/sign'}>{seq.myRole === 'recipient' ? 'Back to onboarding' : 'Back to E-Signatures'}</Link></Button>
            {complete && signedRecordId ? (
              <Button variant="ghost" onClick={() => void downloadSignedCopy()} disabled={downloading}>
                {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />} Download signed copy
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>
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
              You signed “{meta.title}” as {signerName.trim()} on {today}{location.trim() ? ` in ${location.trim()}` : ''}. A secure, hashed copy is recorded on your profile.
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
      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10"><FileText className="h-5 w-5 text-primary" /></div>
            <div className="min-w-0">
              <CardTitle className="text-lg">{meta.title}</CardTitle>
              <CardDescription className="mt-1 flex flex-wrap items-center gap-2">
                <span>{pdfData ? 'Complete the highlighted fields and sign where indicated.' : (meta.description || 'Please read this document carefully before signing.')}</span>
                {meta.currentVersion ? <Badge variant="outline" className="text-xs">v{meta.currentVersion}</Badge> : null}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
      </Card>

      {seq ? <SigningProgress state={seq} /> : null}

      {/* Document — in-context overlay for PDFs, fallback viewer + flat form otherwise */}
      {pdfData ? (
        <SignOverlay
          pdfData={pdfData}
          fields={fields}
          values={values}
          onValueChange={setValue}
          signerName={signerName}
          signatureDataUrl={signature?.signatureDataUrl ?? null}
          signatureType={signature?.signatureType ?? null}
          onRequestSignature={() => setShowSig(true)}
          {...(seq ? { editableRole: seq.myRole, lockedValues: seq.completedValues, roleSignatures: seq.completedSignatures, roleLabels } : {})}
        />
      ) : (
        <>
          <Card><CardContent className="pt-6"><div className="rounded-lg border bg-muted/20 p-4 sm:p-6"><DocumentViewer documentId={documentId} bodyMarkdown={meta.bodyMarkdown} hasFile={meta.hasFile} versionId={meta.latestVersionId} /></div></CardContent></Card>
          {nonSigFields.length > 0 ? (
            <Card>
              <CardHeader><CardTitle className="text-base">Complete the required information</CardTitle></CardHeader>
              <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {nonSigFields.map((field) => (
                  <div key={field.id} className={field.type === 'checkbox' ? 'sm:col-span-2' : ''}>
                    {field.type === 'checkbox' ? (
                      <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={Boolean(values[field.field_key])} onChange={(e) => setValue(field.field_key, e.target.checked)} className="mt-0.5 h-4 w-4" /><span>{field.label}{field.required ? <span className="ml-0.5 text-destructive">*</span> : null}</span></label>
                    ) : (
                      <div className="space-y-1.5"><Label className="text-sm">{field.label}{field.required ? <span className="ml-0.5 text-destructive">*</span> : null}</Label><Input type={field.type === 'date' ? 'date' : 'text'} value={String(values[field.field_key] ?? '')} onChange={(e) => setValue(field.field_key, e.target.value)} /></div>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : null}
        </>
      )}

      {/* Sign + submit bar */}
      {seq && !seq.myRole ? null : (
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><PenLine className="h-4 w-4 text-muted-foreground" /> Sign &amp; complete</CardTitle></CardHeader>
        <CardContent className="space-y-5">
          <label className="flex items-start gap-3 rounded-lg border bg-muted/30 p-3 text-sm">
            <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-0.5 h-4 w-4" />
            <span>I have read and understood this document and agree to its terms. Signing electronically — by drawing or typing my name — is my legal signature, equivalent to a handwritten one.</span>
          </label>

          {/* Signature status */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
            <div className="flex items-center gap-2 text-sm">
              {hasSignature ? <><Check className="h-4 w-4 text-green-600" /> Signature added{hasSignatureField ? ' — placed on the document' : ''}</> : <><PenLine className="h-4 w-4 text-muted-foreground" /> {hasSignatureField ? 'Click a signature box on the document, or' : 'Add your signature to continue.'}</>}
            </div>
            <Button variant={hasSignature ? 'outline' : 'default'} size="sm" onClick={() => setShowSig(true)}>{hasSignature ? 'Change signature' : 'Add signature'}</Button>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5"><Label className="text-sm">Full legal name <span className="text-destructive">*</span></Label><Input value={signerName} onChange={(e) => setSignerName(e.target.value)} placeholder="e.g. Jordan Smith" /></div>
            <div className="space-y-1.5"><Label className="text-sm">Location <span className="text-destructive">*</span></Label><div className="relative"><MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Gold Coast, QLD" className="pl-9" /></div></div>
            <div className="space-y-1.5 sm:col-span-2"><Label className="text-sm">Date</Label><div className="flex h-9 items-center gap-2 rounded-md border border-dashed bg-muted/40 px-3 text-sm text-muted-foreground"><Calendar className="h-4 w-4" /> {today}</div></div>
          </div>

          <div className="flex items-start gap-2 rounded-md bg-muted/40 p-3 text-xs text-muted-foreground">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
            <span>Your signed copy is hashed and stored securely, and this signing — your name, date, and location — is recorded in a tamper-evident audit trail.</span>
          </div>

          <div className="flex items-center justify-between gap-3 border-t pt-4">
            <Button asChild variant="ghost" size="sm"><Link href={`/dashboard/documents/${documentId}`}><ArrowLeft className="h-4 w-4" /> Back</Link></Button>
            <Button onClick={handleSubmit} disabled={!canSign || submitting}>{submitting ? <><Loader2 className="h-4 w-4 animate-spin" /> Signing…</> : 'Sign document'}</Button>
          </div>
          {!canSign ? (
            <p className="text-right text-xs text-muted-foreground">
              {missingRequired ? 'Please complete the required fields on the document.' : !hasSignature ? 'Add your signature to continue.' : !nameOk ? 'Enter your full legal name.' : !agreed ? 'Confirm you have read and agree to the document.' : 'Resolving the document version…'}
            </p>
          ) : null}
        </CardContent>
      </Card>
      )}

      {showSig ? (
        <SignatureCaptureModal signerName={signerName} onClose={() => setShowSig(false)} onAdopt={(v) => { setSignature(v); setShowSig(false); toast.success('Signature added') }} />
      ) : null}
    </div>
  )
}

/** Who signs, in what order, and where this copy is up to (MOS-720). */
function SigningProgress({ state }: { state: SigningState }) {
  const fmt = (d: string | null) => (d ? new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '')
  const complete = state.status === 'completed'
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Signing order</CardTitle>
        <CardDescription>
          {state.shared
            ? 'You sign once; your signature is applied to every copy of this document.'
            : state.recipientName
              ? `Copy for ${state.recipientName}. Each person signs in turn.`
              : 'Each person signs in turn.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <ol className="space-y-2" data-testid="signing-progress">
          {state.steps.map((s) => (
            <li key={s.key} className="flex flex-wrap items-center gap-3 rounded-lg border p-2.5 text-sm" data-status={s.status}>
              <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${s.status === 'completed' ? 'bg-green-100 text-green-700' : s.status === 'active' ? 'bg-amber-100 text-amber-800' : 'bg-muted text-muted-foreground'}`}>
                {s.status === 'completed' ? <Check className="h-3.5 w-3.5" /> : s.order}
              </span>
              <span className="font-medium">{s.label}</span>
              {s.assigneeName ? <span className="text-muted-foreground">{s.assigneeName}</span> : null}
              {s.signOnce ? <Badge variant="outline" className="text-[10px]">signs once</Badge> : null}
              <span className="ml-auto text-xs">
                {s.status === 'completed' ? (
                  <span className="text-green-700">Signed {fmt(s.signedAt)}</span>
                ) : s.status === 'active' ? (
                  <span className="inline-flex items-center gap-1 text-amber-700"><PenLine className="h-3 w-3" /> {state.myRole === s.key ? 'Your turn' : 'Signing now'}</span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-muted-foreground"><Clock className="h-3 w-3" /> Waiting for step {s.order - 1}</span>
                )}
              </span>
            </li>
          ))}
        </ol>
        {!complete && state.waitingFor ? (
          <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" role="status">
            <Hourglass className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Waiting for <strong>{state.waitingFor.label}</strong>{state.waitingFor.name ? ` (${state.waitingFor.name})` : ''} to sign first.
              {' '}You will get a message when it is your turn.
            </span>
          </div>
        ) : null}
        {complete ? (
          <div className="flex items-center gap-2 rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800" role="status">
            <CheckCircle2 className="h-4 w-4" /> Everyone has signed this copy.
          </div>
        ) : null}
        {!complete && !state.waitingFor && !state.myRole ? (
          <p className="text-sm text-muted-foreground" role="status">There is nothing for you to sign on this copy right now.</p>
        ) : null}
      </CardContent>
    </Card>
  )
}

export default function SignDocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: documentId } = use(params)
  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Review &amp; sign</h1>
        <p className="mt-1 text-sm text-muted-foreground">Complete the fields on the document and sign electronically.</p>
      </div>
      <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading…</div>}>
        <SignDocumentInner documentId={documentId} />
      </Suspense>
    </div>
  )
}
