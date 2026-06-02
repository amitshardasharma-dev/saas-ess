'use client'

export const dynamic = 'force-dynamic'

import { Suspense, useEffect, useState, use } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { esignService } from '@/services/esign-client'
import type { DocumentField, FieldValueInput } from '@/types/esign'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import toast from 'react-hot-toast'

/**
 * In-portal document completion + signing. Renders the document's fillable
 * fields, collects values + a typed/drawn signature, and submits to create the
 * immutable signed record.
 */
function SignDocumentInner({ documentId }: { documentId: string }) {
  const search = useSearchParams()
  const versionId = search.get('versionId')
  const router = useRouter()

  const [fields, setFields] = useState<DocumentField[]>([])
  const [values, setValues] = useState<Record<string, string | boolean>>({})
  const [signerName, setSignerName] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    esignService
      .getFields(documentId, versionId ?? undefined)
      .then(setFields)
      .catch(() => toast.error('Failed to load document fields'))
  }, [documentId, versionId])

  const setValue = (key: string, value: string | boolean) =>
    setValues((prev) => ({ ...prev, [key]: value }))

  const handleSubmit = async () => {
    if (!signerName.trim()) {
      toast.error('Please enter your name to sign')
      return
    }
    setSubmitting(true)
    try {
      const fieldValues: FieldValueInput[] = fields.map((f) => ({
        field_id: f.id,
        value: values[f.field_key] ?? '',
      }))
      await esignService.signDocument(documentId, {
        version_id: versionId ?? undefined,
        signer_name: signerName,
        signature_type: 'typed',
        field_values: fieldValues,
      })
      toast.success('Document signed')
      router.push('/dashboard/documents')
    } catch {
      toast.error('Failed to sign document')
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl p-6">
      <h1 className="mb-4 text-2xl font-semibold">Sign document</h1>
      <div className="space-y-4">
        {fields.map((field) => (
          <div key={field.id}>
            <Label htmlFor={field.id}>{field.label}{field.required && ' *'}</Label>
            {field.type === 'checkbox' ? (
              <input
                id={field.id}
                type="checkbox"
                checked={Boolean(values[field.field_key])}
                onChange={(e) => setValue(field.field_key, e.target.checked)}
                className="ml-2"
              />
            ) : (
              <Input
                id={field.id}
                type={field.type === 'date' ? 'date' : 'text'}
                value={String(values[field.field_key] ?? '')}
                onChange={(e) => setValue(field.field_key, e.target.value)}
              />
            )}
          </div>
        ))}

        <div className="border-t pt-4">
          <Label htmlFor="signerName">Type your full name to sign *</Label>
          <Input
            id="signerName"
            value={signerName}
            onChange={(e) => setSignerName(e.target.value)}
            placeholder="Your full name"
          />
        </div>

        <Button onClick={handleSubmit} disabled={submitting}>
          {submitting ? 'Signing…' : 'Sign document'}
        </Button>
      </div>
    </div>
  )
}

export default function SignDocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: documentId } = use(params)
  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading…</div>}>
      <SignDocumentInner documentId={documentId} />
    </Suspense>
  )
}
