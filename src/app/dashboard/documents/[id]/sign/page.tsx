'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { useLabels } from '@/hooks/use-labels'
import { esignService } from '@/services/esign-client'
import { SignaturePad, type SignaturePadHandle } from '@/components/documents/signing/signature-pad'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import type { DocumentField } from '@/types/esign'

/**
 * Signing experience (signer / volunteer). Renders the fillable fields defined
 * for a document version, captures a drawn signature (canvas) and/or typed name,
 * validates required fields client-side, then POSTs to /api/documents/[id]/sign.
 */
export default function SignDocumentPage() {
  const { t } = useLabels()
  const params = useParams<{ id: string }>()
  const search = useSearchParams()
  const documentId = params.id
  const versionId = search.get('versionId') || undefined

  const [fields, setFields] = useState<DocumentField[]>([])
  const [values, setValues] = useState<Record<string, unknown>>({})
  const [signerName, setSignerName] = useState('')
  const [signatureMode, setSignatureMode] = useState<'drawn' | 'typed'>('drawn')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [signedDocId, setSignedDocId] = useState<string | null>(null)
  const [resolvedVersionId, setResolvedVersionId] = useState<string | undefined>(versionId)

  const padRef = useRef<SignaturePadHandle | null>(null)

  useEffect(() => {
    esignService
      .getFields(documentId, versionId)
      .then((fs) => {
        setFields(fs)
        if (fs[0]?.version_id) setResolvedVersionId(fs[0].version_id)
      })
      .catch(() => setMessage('Failed to load fields'))
      .finally(() => setLoading(false))
  }, [documentId, versionId])

  function setValue(key: string, v: unknown) {
    setValues((prev) => ({ ...prev, [key]: v }))
  }

  const signatureField = fields.find((f) => f.type === 'signature')

  async function submit() {
    setMessage(null)
    if (!resolvedVersionId) {
      setMessage('No document version available to sign')
      return
    }
    if (!signerName.trim()) {
      setMessage('Please enter your name')
      return
    }

    // Build final field values; mark the signature field present.
    const finalValues = { ...values }
    let signatureDataUrl: string | undefined
    if (signatureField) {
      if (signatureMode === 'drawn') {
        const url = padRef.current?.toDataUrl() ?? null
        if (!url) {
          setMessage('Please draw your signature or switch to typed')
          return
        }
        signatureDataUrl = url
        finalValues[signatureField.field_key] = true
      } else {
        finalValues[signatureField.field_key] = signerName
      }
    }

    // Required-field check before hitting the server.
    for (const f of fields) {
      if (f.required) {
        const val = finalValues[f.field_key]
        const present = val !== undefined && val !== null && val !== ''
        if (!present) {
          setMessage(`Field "${f.label}" is required`)
          return
        }
      }
    }

    setSubmitting(true)
    try {
      const result = await esignService.sign(documentId, {
        versionId: resolvedVersionId,
        signerName: signerName.trim(),
        signatureType: signatureField ? signatureMode : 'typed',
        fieldValues: finalValues,
        signatureDataUrl,
      })
      setSignedDocId(result.id)
      setMessage('Signed successfully.')
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to sign')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <div className="p-8">Loading…</div>

  return (
    <div className="mx-auto max-w-2xl p-6">
      <Card>
        <CardHeader>
          <CardTitle>Complete &amp; sign {t('document').toLowerCase()}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {fields
            .filter((f) => f.type !== 'signature')
            .map((field) => (
              <div key={field.id} className="space-y-1">
                <Label>
                  {field.label}
                  {field.required && <span className="text-destructive"> *</span>}
                </Label>
                {field.type === 'checkbox' ? (
                  <Checkbox
                    checked={Boolean(values[field.field_key])}
                    onCheckedChange={(c) => setValue(field.field_key, c === true)}
                  />
                ) : (
                  <Input
                    type={field.type === 'date' ? 'date' : 'text'}
                    value={String(values[field.field_key] ?? '')}
                    onChange={(e) => setValue(field.field_key, e.target.value)}
                  />
                )}
              </div>
            ))}

          <div className="space-y-1">
            <Label>Full name</Label>
            <Input value={signerName} onChange={(e) => setSignerName(e.target.value)} />
          </div>

          {signatureField && (
            <div className="space-y-2">
              <Label>{signatureField.label}</Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={signatureMode === 'drawn' ? 'default' : 'outline'}
                  onClick={() => setSignatureMode('drawn')}
                >
                  Draw
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={signatureMode === 'typed' ? 'default' : 'outline'}
                  onClick={() => setSignatureMode('typed')}
                >
                  Type name
                </Button>
              </div>
              {signatureMode === 'drawn' ? (
                <SignaturePad ref={padRef} />
              ) : (
                <p className="text-sm text-muted-foreground">
                  Your typed name “{signerName || '…'}” will be used as your signature.
                </p>
              )}
            </div>
          )}

          <div className="flex items-center gap-3 pt-2">
            <Button type="button" onClick={submit} disabled={submitting}>
              {submitting ? 'Submitting…' : 'Submit & sign'}
            </Button>
            {message && <span className="text-sm">{message}</span>}
          </div>

          {signedDocId && (
            <p className="text-sm">
              <a className="underline" href={esignService.downloadUrl(signedDocId)}>
                Download signed {t('document').toLowerCase()}
              </a>
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
