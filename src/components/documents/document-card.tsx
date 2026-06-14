// src/components/documents/document-card.tsx

'use client'

import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { FileText, Download, CheckCircle, AlertCircle } from 'lucide-react'
import { DocumentWithVersion } from '@/types/document'

interface DocumentCardProps {
  document: DocumentWithVersion
  onClick: (doc: DocumentWithVersion) => void
  onDownload?: (doc: DocumentWithVersion) => void
}

export function DocumentCard({ document, onClick, onDownload }: DocumentCardProps) {
  const needsAck = document.requires_acknowledgment && !document.acknowledged

  return (
    <Card
      className="cursor-pointer hover:shadow-md transition-all border-border/50 hover:border-primary/30"
      onClick={() => onClick(document)}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex items-start space-x-3 flex-1 min-w-0">
            <div className={`p-2 rounded-lg ${needsAck ? 'bg-amber-100' : 'bg-blue-100'}`}>
              <FileText className={`h-5 w-5 ${needsAck ? 'text-amber-600' : 'text-blue-600'}`} />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-sm truncate">{document.title}</h3>
              {document.description && (
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{document.description}</p>
              )}
              <div className="flex items-center gap-2 mt-2">
                <Badge variant="outline" className="text-xs">{document.category_name}</Badge>
                <span className="text-xs text-muted-foreground">v{document.current_version}</span>
                {document.latest_version && (
                  <span className="text-xs text-muted-foreground">
                    {new Date(document.latest_version.uploaded_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center space-x-1 ml-2">
            {document.requires_acknowledgment && (
              document.acknowledged ? (
                <CheckCircle className="h-4 w-4 text-green-500" />
              ) : (
                <AlertCircle className="h-4 w-4 text-amber-500" />
              )
            )}
            {document.latest_version && onDownload && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={(e) => { e.stopPropagation(); onDownload(document) }}
              >
                <Download className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
