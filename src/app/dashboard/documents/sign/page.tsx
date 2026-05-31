'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { documentService } from '@/services/document'
import { useLabels } from '@/hooks/use-labels'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

interface DocRow {
  id: string
  title: string
  category_name?: string
}

/**
 * E-Signatures dashboard (staff-facing entry). Lists documents so a user can pick
 * one to design fields for, sign, or review signature status.
 */
export default function EsignDashboardPage() {
  const { t } = useLabels()
  const router = useRouter()
  const [docs, setDocs] = useState<DocRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    documentService
      .getDocuments(true)
      .then((d) => setDocs(d as unknown as DocRow[]))
      .catch(() => setDocs([]))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="mx-auto max-w-3xl p-6">
      <h1 className="mb-1 text-2xl font-semibold">E-Signatures</h1>
      <p className="mb-4 text-sm text-muted-foreground">
        Define fillable fields, complete and sign {t('document', { plural: true }).toLowerCase()}, or
        review who has signed.
      </p>
      {loading && <p>Loading…</p>}
      <div className="space-y-3">
        {docs.map((doc) => (
          <Card key={doc.id}>
            <CardHeader>
              <CardTitle className="text-base">{doc.title}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => router.push(`/dashboard/documents/sign/${doc.id}/design`)}
              >
                Design fields
              </Button>
              <Button
                size="sm"
                onClick={() => router.push(`/dashboard/documents/${doc.id}/sign`)}
              >
                Sign
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => router.push(`/dashboard/documents/sign/status?documentId=${doc.id}`)}
              >
                Signature status
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
