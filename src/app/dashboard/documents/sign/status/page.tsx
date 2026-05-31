'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { esignService, type SignatureStatusReport } from '@/services/esign-client'
import { Badge } from '@/components/ui/badge'

/**
 * Signature status (hr+): who has / hasn't signed a document. Mirrors the
 * acknowledgment-report layout.
 */
export default function SignatureStatusPage() {
  const search = useSearchParams()
  const documentId = search.get('documentId')
  const [report, setReport] = useState<SignatureStatusReport | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!documentId) {
      setError('No document selected')
      return
    }
    esignService
      .getSignatureStatus(documentId)
      .then(setReport)
      .catch(() => setError('Failed to load signature status'))
  }, [documentId])

  return (
    <div className="mx-auto max-w-3xl p-6">
      <h1 className="mb-1 text-2xl font-semibold">Signature status</h1>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {report && (
        <>
          <p className="mb-4 text-sm text-muted-foreground">
            {report.signed_count} of {report.total} have signed.
          </p>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="py-2 pr-4 font-medium">Name</th>
                <th className="py-2 pr-4 font-medium">Status</th>
                <th className="py-2 pr-4 font-medium">Signed at</th>
              </tr>
            </thead>
            <tbody>
              {report.employees.map((emp) => (
                <tr key={emp.id} className="border-b">
                  <td className="py-2 pr-4">{emp.name}</td>
                  <td className="py-2 pr-4">
                    {emp.signed ? <Badge>Signed</Badge> : <Badge variant="outline">Pending</Badge>}
                  </td>
                  <td className="py-2 pr-4">
                    {emp.signed_at ? new Date(emp.signed_at).toLocaleString() : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  )
}
