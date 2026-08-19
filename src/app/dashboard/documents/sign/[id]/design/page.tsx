'use client'

// Visual field designer (hr+). Renders the document's PDF and lets the tenant
// place signature + smart fields exactly where they want, on any page. Replaces
// the old numeric-coordinate form. `id` is the document id; the latest version's
// PDF is loaded from the same-origin bytes proxy.
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { Toaster } from 'react-hot-toast'
import { ArrowLeft, Loader2, AlertTriangle } from 'lucide-react'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Button } from '@/components/ui/button'
import { documentService } from '@/services/document'
import { esignService } from '@/services/esign-client'
import { FieldDesigner } from '@/components/documents/signing/field-designer'
import type { DocumentField } from '@/types/esign'

function authHeaders(): HeadersInit {
  const token = typeof window !== 'undefined' ? localStorage.getItem('ess_access_token') : null
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export default function FieldDesignerPage() {
  const params = useParams<{ id: string }>()
  const documentId = params.id

  const [title, setTitle] = useState('')
  const [versionId, setVersionId] = useState<string | null>(null)
  const [pdfData, setPdfData] = useState<ArrayBuffer | null>(null)
  const [initialFields, setInitialFields] = useState<DocumentField[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const doc = await documentService.getDocument(documentId)
        const latest = doc.versions?.[0]
        if (!latest) throw new Error('This document has no uploaded PDF version to place fields on.')
        if (cancelled) return
        setTitle(doc.document?.title ?? 'Document')
        setVersionId(latest.id)

        const [fields, res] = await Promise.all([
          esignService.getFields(documentId, latest.id),
          fetch(`/api/documents/${documentId}/file?versionId=${latest.id}`, { headers: authHeaders() }),
        ])
        if (!res.ok) throw new Error('Could not load the document PDF.')
        const bytes = await res.arrayBuffer()
        if (cancelled) return
        setInitialFields(fields)
        setPdfData(bytes)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load document')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [documentId])

  return (
    <DashboardLayout>
      <Toaster position="top-center" />
      <div className="min-h-screen">
        <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6">
          <div className="mb-5 flex items-center gap-3">
            <Button asChild variant="ghost" size="sm">
              <Link href="/dashboard/documents/manage"><ArrowLeft className="h-4 w-4" /> Documents</Link>
            </Button>
            <div>
              <h1 className="text-xl font-semibold text-foreground">Prepare “{title || 'document'}”</h1>
              <p className="text-sm text-muted-foreground">Place signature and information fields where signers should complete them.</p>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center gap-2 py-24 text-sm text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" /> Loading document…
            </div>
          ) : error ? (
            <div className="mx-auto max-w-md rounded-xl border border-destructive/30 bg-white p-8 text-center">
              <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-destructive/70" />
              <p className="text-sm text-muted-foreground">{error}</p>
            </div>
          ) : pdfData && versionId ? (
            <FieldDesigner
              documentId={documentId}
              versionId={versionId}
              pdfData={pdfData}
              initialFields={initialFields}
            />
          ) : null}
        </div>
      </div>
    </DashboardLayout>
  )
}
