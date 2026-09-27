// Unified per-document status report (merges the old acknowledgment + signature
// tables). Shows who has completed the document — signing it (signature docs) or
// acknowledging it — with a per-signer download of the signed copy and a single
// "Remind pending" action.
'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CheckCircle, XCircle, Download, BellRing, Loader2, ShieldCheck, ClipboardList, RotateCcw } from 'lucide-react'
import type { CopyProgress } from '@/services/esign-client'

export type ReportMode = 'signature' | 'acknowledgment'

export interface StatusEmployee {
  id: string
  name: string
  employee_no: string
  department: string | null
  done: boolean
  doneAt: string | null
  signedDocumentId?: string | null
  /** MOS-720: progress through the signing order, when the document has one. */
  sequence?: CopyProgress | null
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
  signingOrder?: Array<{ order: number; key: string; label: string; sign_once: boolean }>
  onRestart?: (employeeId: string, name: string) => void
}

function fmt(d: string | null): string {
  return d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'
}

export function DocumentStatusReport({ mode, employees, doneCount, total, onDownload, onRemind, reminding, downloadingId, signingOrder, onRestart }: Props) {
  const isSig = mode === 'signature'
  const ordered = isSig && !!signingOrder && signingOrder.length > 1
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
        {ordered ? (
          <p className="mb-3 text-xs text-muted-foreground">
            Signing order: {signingOrder!.map((r) => `${r.order}. ${r.label}${r.sign_once ? ' (signs once)' : ''}`).join(' → ')}
          </p>
        ) : null}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="py-2 px-3 font-medium text-muted-foreground">Person</th>
                <th className="py-2 px-3 font-medium text-muted-foreground">Department</th>
                <th className="py-2 px-3 font-medium text-muted-foreground">Status</th>
                {ordered ? <th className="py-2 px-3 font-medium text-muted-foreground">Progress</th> : null}
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
                  {ordered ? (
                    <td className="py-2 px-3">
                      <div className="flex flex-wrap items-center gap-1" data-testid={`sequence-${e.id}`}>
                        {(e.sequence?.steps ?? []).map((s) => (
                          <span
                            key={s.key}
                            title={s.status === 'completed' ? `${s.label}: signed by ${s.signerName} on ${fmt(s.signedAt)}` : s.status === 'active' ? `${s.label}: ${s.assigneeName ?? ''} to sign now` : `${s.label}: waiting for earlier signers`}
                            className={`rounded-full border px-2 py-0.5 text-[11px] ${s.status === 'completed' ? 'border-green-300 bg-green-50 text-green-700' : s.status === 'active' ? 'border-amber-300 bg-amber-50 text-amber-800' : 'border-muted bg-muted/40 text-muted-foreground'}`}
                            data-status={s.status}
                          >
                            {s.order}. {s.label} · {s.status === 'completed' ? 'signed' : s.status === 'active' ? 'pending' : 'waiting'}
                          </span>
                        ))}
                        {e.sequence?.status === 'in_progress' && !e.done && onRestart && e.sequence.steps.some((s) => s.status === 'completed' && !s.signOnce) ? (
                          <Button size="sm" variant="ghost" className="h-6 px-1.5 text-[11px]" onClick={() => onRestart(e.id, e.name)}>
                            <RotateCcw className="h-3 w-3" /> Restart
                          </Button>
                        ) : null}
                      </div>
                    </td>
                  ) : null}
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
