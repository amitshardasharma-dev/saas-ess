// src/components/documents/document-card.tsx

'use client'

import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { FileText, Download, CheckCircle2, PenLine, Eye, ChevronRight } from 'lucide-react'
import { DocumentWithVersion } from '@/types/document'

interface DocumentCardProps {
  document: DocumentWithVersion
  onClick: (doc: DocumentWithVersion) => void
  onDownload?: (doc: DocumentWithVersion) => void
}

type Status = {
  tone: 'green' | 'amber' | 'muted'
  chip: string
  action: string
  iconBg: string
  iconColor: string
}

function statusOf(d: DocumentWithVersion): Status {
  const needsSign = d.signable && !d.signed
  const needsAck = d.requires_acknowledgment && !d.acknowledged
  if (d.signed) return { tone: 'green', chip: 'Signed', action: 'View', iconBg: 'bg-green-100', iconColor: 'text-green-600' }
  if (needsSign) return { tone: 'amber', chip: 'Signature required', action: 'Review & sign', iconBg: 'bg-amber-100', iconColor: 'text-amber-600' }
  if (d.acknowledged) return { tone: 'green', chip: 'Acknowledged', action: 'View', iconBg: 'bg-green-100', iconColor: 'text-green-600' }
  if (needsAck) return { tone: 'amber', chip: 'Action required', action: 'Read & acknowledge', iconBg: 'bg-amber-100', iconColor: 'text-amber-600' }
  return { tone: 'muted', chip: 'Reference', action: 'View', iconBg: 'bg-primary/10', iconColor: 'text-primary' }
}

const CHIP_CLASS: Record<Status['tone'], string> = {
  green: 'bg-green-100 text-green-800 hover:bg-green-100',
  amber: 'bg-amber-100 text-amber-800 hover:bg-amber-100',
  muted: '',
}

export function DocumentCard({ document, onClick, onDownload }: DocumentCardProps) {
  const s = statusOf(document)
  const Icon = document.signed || document.acknowledged ? CheckCircle2 : s.tone === 'amber' && document.signable ? PenLine : FileText

  return (
    <Card
      className={`group cursor-pointer transition-all hover:shadow-md ${s.tone === 'amber' ? 'border-amber-200' : 'border-border/60 hover:border-primary/30'}`}
      onClick={() => onClick(document)}
    >
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className={`shrink-0 rounded-lg p-2 ${s.iconBg}`}>
            <Icon className={`h-5 w-5 ${s.iconColor}`} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <h3 className="truncate font-semibold text-sm text-foreground">{document.title}</h3>
              <Badge variant={s.tone === 'muted' ? 'outline' : 'secondary'} className={`shrink-0 ${CHIP_CLASS[s.tone]}`}>{s.chip}</Badge>
            </div>
            {document.description ? (
              <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{document.description}</p>
            ) : null}
            <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="outline" className="text-xs">{document.category_name}</Badge>
              <span>v{document.current_version}</span>
              {document.latest_version ? (
                <span>{new Date(document.latest_version.uploaded_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
              ) : null}
            </div>
            <div className="mt-3 flex items-center justify-between">
              <span className="inline-flex items-center gap-1 text-xs font-medium text-primary group-hover:underline">
                {s.action} <ChevronRight className="h-3.5 w-3.5" />
              </span>
              {document.latest_version && onDownload ? (
                <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs"
                  onClick={(e) => { e.stopPropagation(); onDownload(document) }}>
                  {s.action === 'View' ? <Eye className="h-3.5 w-3.5" /> : <Download className="h-3.5 w-3.5" />} Open
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
