'use client'

// Renders a document's content in-portal: markdown body (rendered via the
// XSS-safe whitelist converter) when authored in-app, otherwise the uploaded
// file embedded via a short-lived signed URL. Falls back to a download prompt.

import { useEffect, useState } from 'react'
import { FileText, Loader2, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { mdToHtml } from '@/lib/communications/markdown'

function authHeaders(): HeadersInit {
  const token = typeof window !== 'undefined' ? localStorage.getItem('ess_access_token') : null
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export function DocumentViewer({
  documentId,
  bodyMarkdown,
  hasFile,
  versionId,
  className,
}: {
  documentId: string
  bodyMarkdown?: string | null
  hasFile?: boolean
  versionId?: string | null
  className?: string
}) {
  const isMarkdown = Boolean(bodyMarkdown && bodyMarkdown.trim())
  const [url, setUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(!isMarkdown && Boolean(hasFile))

  useEffect(() => {
    if (isMarkdown || !hasFile) return
    let cancelled = false
    ;(async () => {
      try {
        const qs = versionId ? `?versionId=${encodeURIComponent(versionId)}` : ''
        const res = await fetch(`/api/documents/${documentId}/view-url${qs}`, { headers: authHeaders() })
        const data = await res.json().catch(() => null)
        if (!cancelled) setUrl(data?.url ?? null)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [documentId, hasFile, versionId, isMarkdown])

  if (isMarkdown) {
    return (
      <div
        className={`prose prose-sm max-w-none text-foreground prose-headings:text-foreground prose-a:text-primary ${className ?? ''}`}
        // body_markdown is converted by the whitelisted mdToHtml (escapes input,
        // emits only safe tags) — same sanitization model as Communications.
        dangerouslySetInnerHTML={{ __html: mdToHtml(bodyMarkdown!) }}
      />
    )
  }

  if (!hasFile) {
    return (
      <div className={`flex flex-col items-center gap-2 rounded-md border border-dashed bg-muted/30 py-12 text-center text-sm text-muted-foreground ${className ?? ''}`}>
        <FileText className="h-8 w-8 opacity-40" />
        No preview available for this document.
      </div>
    )
  }

  if (loading) {
    return (
      <div className={`flex items-center justify-center gap-2 rounded-md border bg-muted/20 py-16 text-sm text-muted-foreground ${className ?? ''}`}>
        <Loader2 className="h-4 w-4 animate-spin" /> Loading document…
      </div>
    )
  }

  if (url) {
    return (
      <div className={className}>
        <iframe src={url} title="Document" className="h-[600px] w-full rounded-md border bg-white" />
        <div className="mt-2 text-right">
          <Button asChild variant="ghost" size="sm">
            <a href={url} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-4 w-4" /> Open in new tab</a>
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className={`flex flex-col items-center gap-2 rounded-md border border-dashed bg-muted/30 py-12 text-center text-sm text-muted-foreground ${className ?? ''}`}>
      <FileText className="h-8 w-8 opacity-40" />
      Couldn’t load a preview for this document.
    </div>
  )
}
