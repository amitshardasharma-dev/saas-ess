// Unified per-document status report (merges the old acknowledgment + signature
// tables). Shows who has completed the document — signing it (signature docs) or
// acknowledging it — with a per-signer download of the signed copy and a single
// "Remind pending" action.
'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CheckCircle, XCircle, Download, BellRing, Loader2, ShieldCheck, ClipboardList } from 'lucide-react'

export type ReportMode = 'signature' | 'acknowledgment'

export interface StatusEmployee {
  id: string
  name: string
  employee_no: string
  department: string | null
  done: boolean
  doneAt: string | null
  signedDocumentId?: string | null
}

interface Props {
  mode: ReportMode
  employees: StatusEmployee[]
  doneCount: number
  total: number
  onDownload?: (signedDocumentId: string) => void
  onRemind: () => void
  reminding: boolean
  downloadingId?: string | null
}

function fmt(d: string | null): string {
  return d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'
}

export function DocumentStatusReport({ mode, employees, doneCount, total, onDownload, onRemind, reminding, downloadingId }: Props) {
  const isSig = mode === 'signature'
  const pending = total - doneCount
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
          <div className="flex items-center gap-2">
            {isSig ? <ShieldCheck className="h-5 w-5 text-primary" /> : <ClipboardList className="h-5 w-5 text-primary" />}
            {isSig ? 'Signature status' : 'Acknowledgment status'}
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline">{doneCount} / {total} {isSig ? 'signed' : 'acknowledged'}</Badge>
            <Button size="sm" variant="outline" onClick={onRemind} disabled={reminding || pending === 0}>
              {reminding ? <Loader2 className="h-4 w-4 animate-spin" /> : <BellRing className="h-4 w-4" />}
              {pending === 0 ? 'All done' : `Remind ${pending} pending`}
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
                <th className="py-2 px-3 font-medium text-muted-foreground">When</th>
                {isSig ? <th className="py-2 px-3 font-medium text-muted-foreground text-right">Signed copy</th> : null}
              </tr>
            </thead>
            <tbody>
              {employees.map((e) => (
                <tr key={e.id} className="border-b last:border-0">
                  <td className="py-2 px-3">
                    <p className="font-medium">{e.name}</p>
                    <p className="text-xs text-muted-foreground">{e.employee_no}</p>
                  </td>
                  <td className="py-2 px-3 text-muted-foreground">{e.department || '—'}</td>
                  <td className="py-2 px-3">
                    {e.done ? (
                      <div className="flex items-center gap-1 text-green-600"><CheckCircle className="h-4 w-4" /><span className="text-xs">{isSig ? 'Signed' : 'Acknowledged'}</span></div>
                    ) : (
                      <div className="flex items-center gap-1 text-amber-500"><XCircle className="h-4 w-4" /><span className="text-xs">{isSig ? 'Not signed' : 'Pending'}</span></div>
                    )}
                  </td>
                  <td className="py-2 px-3 text-xs text-muted-foreground">{fmt(e.doneAt)}</td>
                  {isSig ? (
                    <td className="py-2 px-3 text-right">
                      {e.done && e.signedDocumentId ? (
                        <Button size="sm" variant="ghost" onClick={() => onDownload?.(e.signedDocumentId!)} disabled={downloadingId === e.signedDocumentId}>
                          {downloadingId === e.signedDocumentId ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Download
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}
