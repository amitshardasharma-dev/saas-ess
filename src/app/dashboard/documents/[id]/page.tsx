// src/app/dashboard/documents/[id]/page.tsx

'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useAuthStore } from '@/stores/auth'
import { documentService } from '@/services/document'
import { Document, DocumentVersion } from '@/types/document'
import {
  ArrowLeft, Download, CheckCircle2, FileText, Clock, AlertCircle, PenLine, ExternalLink, Loader2,
} from 'lucide-react'
import toast from 'react-hot-toast'

export default function DocumentDetailPage() {
  const params = useParams()
  const router = useRouter()
  const { user, isAuthenticated, checkAuth } = useAuthStore()
  const [document, setDocument] = useState<Document | null>(null)
  const [versions, setVersions] = useState<DocumentVersion[]>([])
  const [acknowledged, setAcknowledged] = useState(false)
  const [signed, setSigned] = useState(false)
  const [signable, setSignable] = useState(false)
  const [loading, setLoading] = useState(true)
  const [acknowledging, setAcknowledging] = useState(false)

  useEffect(() => { checkAuth() }, [checkAuth])
  useEffect(() => { if (isAuthenticated && user && params.id) void loadData() }, [isAuthenticated, user, params.id])

  const loadData = async () => {
    try {
      setLoading(true)
      const data = await documentService.getDocument(params.id as string)
      setDocument(data.document)
      setVersions(data.versions)
      setAcknowledged(data.acknowledged)
      setSigned(Boolean(data.signed))
      setSignable(Boolean(data.signable))
    } catch {
      toast.error('Failed to load document')
    } finally {
      setLoading(false)
    }
  }

  const handleAcknowledge = async () => {
    try {
      setAcknowledging(true)
      await documentService.acknowledgeDocument(params.id as string)
      setAcknowledged(true)
      toast.success('Document acknowledged')
    } catch {
      toast.error('Failed to acknowledge')
    } finally {
      setAcknowledging(false)
    }
  }

  if (!isAuthenticated || !user) return null

  const Shell = ({ children }: { children: React.ReactNode }) => (
    <div className="mx-auto w-full max-w-3xl space-y-6 p-6">{children}</div>
  )

  if (loading) {
    return <Shell><Card><CardContent className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading document…</CardContent></Card></Shell>
  }
  if (!document) {
    return <Shell><Card><CardContent className="py-16 text-center text-sm text-muted-foreground">Document not found.</CardContent></Card></Shell>
  }

  const latestVersion = versions[0]
  const needsSign = signable && !signed
  const needsAck = document.requires_acknowledgment && !acknowledged
  const category = (document as Document & { category_name?: string }).category_name || 'Uncategorized'

  return (
    <Shell>
      {/* Header */}
      <div className="space-y-3">
        <Button variant="ghost" size="sm" className="-ml-2 gap-1 text-muted-foreground" onClick={() => router.push('/dashboard/documents')}>
          <ArrowLeft className="h-4 w-4" /> Documents
        </Button>
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <FileText className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold text-foreground">{document.title}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <Badge variant="outline">{category}</Badge>
              <span>Version {document.current_version}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Status banner */}
      {needsSign ? (
        <Banner tone="amber" icon={PenLine}>This document requires your signature. Please review and sign it below.</Banner>
      ) : needsAck ? (
        <Banner tone="amber" icon={AlertCircle}>This document requires your acknowledgment. Please read it, then confirm below.</Banner>
      ) : signed ? (
        <Banner tone="green" icon={CheckCircle2}>You have signed this document.</Banner>
      ) : acknowledged ? (
        <Banner tone="green" icon={CheckCircle2}>You have acknowledged this document.</Banner>
      ) : null}

      {/* Actions */}
      <Card>
        {document.description ? (
          <CardContent className="border-b py-4 text-sm text-muted-foreground">{document.description}</CardContent>
        ) : null}
        <CardContent className="flex flex-wrap items-center gap-3 py-4">
          {latestVersion ? (
            <Button asChild variant="outline">
              <a href={latestVersion.file_url} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-4 w-4" /> View document</a>
            </Button>
          ) : null}

          {needsSign ? (
            <Button asChild>
              <Link href={`/dashboard/documents/${document.id}/sign${latestVersion ? `?versionId=${latestVersion.id}` : ''}`}>
                <PenLine className="h-4 w-4" /> Review &amp; sign
              </Link>
            </Button>
          ) : null}

          {needsAck ? (
            <Button onClick={handleAcknowledge} disabled={acknowledging} className="bg-green-600 hover:bg-green-700">
              {acknowledging ? <><Loader2 className="h-4 w-4 animate-spin" /> Acknowledging…</> : <><CheckCircle2 className="h-4 w-4" /> I have read &amp; understood</>}
            </Button>
          ) : null}

          {signed && !needsAck ? <Badge className="bg-green-100 px-3 py-1.5 text-green-800 hover:bg-green-100"><CheckCircle2 className="h-4 w-4" /> Signed</Badge> : null}
          {acknowledged && !needsSign ? <Badge className="bg-green-100 px-3 py-1.5 text-green-800 hover:bg-green-100"><CheckCircle2 className="h-4 w-4" /> Acknowledged</Badge> : null}
        </CardContent>
      </Card>

      {/* Version history */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base"><Clock className="h-4 w-4 text-muted-foreground" /> Version history</CardTitle>
        </CardHeader>
        <CardContent>
          {versions.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">No versions uploaded yet.</p>
          ) : (
            <div className="space-y-2">
              {versions.map((v, i) => (
                <div key={v.id} className={`flex items-center justify-between rounded-lg border p-3 ${i === 0 ? 'border-primary/30 bg-primary/5' : ''}`}>
                  <div className="flex items-center gap-3">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">
                        v{v.version_number} — {v.file_name}
                        {i === 0 ? <Badge variant="outline" className="ml-2 text-xs">Latest</Badge> : null}
                      </p>
                      {v.changelog ? <p className="text-xs text-muted-foreground">{v.changelog}</p> : null}
                      <p className="text-xs text-muted-foreground">
                        {new Date(v.uploaded_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })} · {(v.file_size / 1024).toFixed(0)} KB
                      </p>
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => window.open(v.file_url, '_blank')}><Download className="h-4 w-4" /></Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </Shell>
  )
}

function Banner({ tone, icon: Icon, children }: { tone: 'amber' | 'green'; icon: React.ComponentType<{ className?: string }>; children: React.ReactNode }) {
  const cls = tone === 'amber' ? 'border-amber-200 bg-amber-50/60 text-amber-800' : 'border-green-200 bg-green-50/60 text-green-800'
  return (
    <div className={`flex items-center gap-3 rounded-lg border p-4 text-sm ${cls}`}>
      <Icon className="h-5 w-5 shrink-0" />
      <span>{children}</span>
    </div>
  )
}
