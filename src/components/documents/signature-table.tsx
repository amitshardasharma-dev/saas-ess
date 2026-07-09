// Admin/staff signature-tracking table for a signable document: who has signed
// (with a downloadable signed copy) and who hasn't, plus a one-click reminder to
// all non-signers. Mirrors AcknowledgmentTable.
'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CheckCircle, XCircle, ShieldCheck, Download, BellRing, Loader2 } from 'lucide-react'

export interface SignatureEmployee {
  id: string
  name: string
  employee_no: string
  department: string | null
  signed: boolean
  signed_at: string | null
  signed_document_id: string | null
}

interface SignatureTableProps {
  employees: SignatureEmployee[]
  signedCount: number
  total: number
  onDownload: (signedDocumentId: string) => void
  onRemind: () => void
  reminding: boolean
  downloadingId: string | null
}

export function SignatureTable({ employees, signedCount, total, onDownload, onRemind, reminding, downloadingId }: SignatureTableProps) {
  const pending = total - signedCount
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            Signature Status
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline">{signedCount} / {total} signed</Badge>
            <Button size="sm" variant="outline" onClick={onRemind} disabled={reminding || pending === 0}>
              {reminding ? <Loader2 className="h-4 w-4 animate-spin" /> : <BellRing className="h-4 w-4" />}
              {pending === 0 ? 'All signed' : `Remind ${pending} non-signer${pending === 1 ? '' : 's'}`}
            </Button>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="py-2 px-3 font-medium text-muted-foreground">Person</th>
                <th className="py-2 px-3 font-medium text-muted-foreground">Department</th>
                <th className="py-2 px-3 font-medium text-muted-foreground">Status</th>
                <th className="py-2 px-3 font-medium text-muted-foreground">Signed on</th>
                <th className="py-2 px-3 font-medium text-muted-foreground text-right">Signed copy</th>
              </tr>
            </thead>
            <tbody>
              {employees.map((emp) => (
                <tr key={emp.id} className="border-b last:border-0">
                  <td className="py-2 px-3">
                    <p className="font-medium">{emp.name}</p>
                    <p className="text-xs text-muted-foreground">{emp.employee_no}</p>
                  </td>
                  <td className="py-2 px-3 text-muted-foreground">{emp.department || '—'}</td>
                  <td className="py-2 px-3">
                    {emp.signed ? (
                      <div className="flex items-center gap-1 text-green-600">
                        <CheckCircle className="h-4 w-4" />
                        <span className="text-xs">Signed</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 text-amber-500">
                        <XCircle className="h-4 w-4" />
                        <span className="text-xs">Not signed</span>
                      </div>
                    )}
                  </td>
                  <td className="py-2 px-3 text-xs text-muted-foreground">
                    {emp.signed_at
                      ? new Date(emp.signed_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
                      : '—'}
                  </td>
                  <td className="py-2 px-3 text-right">
                    {emp.signed && emp.signed_document_id ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => onDownload(emp.signed_document_id!)}
                        disabled={downloadingId === emp.signed_document_id}
                      >
                        {downloadingId === emp.signed_document_id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                        Download
                      </Button>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}
