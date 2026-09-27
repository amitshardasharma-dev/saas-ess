// src/app/dashboard/documents/sign/page.tsx

'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { DocumentCard } from '@/components/documents/document-card'
import { useAuthStore } from '@/stores/auth'
import { documentService } from '@/services/document'
import { DocumentWithVersion } from '@/types/document'
import { PenLine, CheckCircle2, CheckCheck, Loader2, UserCheck } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { esignService, type QueueItem } from '@/services/esign-client'
import toast from 'react-hot-toast'

/** A document the volunteer can sign and hasn't signed yet. */
const isAwaiting = (d: DocumentWithVersion) => Boolean(d.signable) && !d.signed

export default function SigningQueuePage() {
  const router = useRouter()
  const { user, isAuthenticated, checkAuth } = useAuthStore()
  const [documents, setDocuments] = useState<DocumentWithVersion[]>([])
  // MOS-720: copies waiting for this person as a named signer (e.g. an officer).
  const [queue, setQueue] = useState<QueueItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { checkAuth() }, [checkAuth])
  useEffect(() => { if (isAuthenticated && user) void loadData() }, [isAuthenticated, user])

  const loadData = async () => {
    try {
      setLoading(true)
      const [docs, q] = await Promise.all([documentService.getDocuments(), esignService.getSigningQueue().catch(() => [] as QueueItem[])])
      setDocuments(docs)
      setQueue(q)
    } catch {
      toast.error('Failed to load documents')
    } finally {
      setLoading(false)
    }
  }

  // Awaiting cards open the review & sign flow on the latest version; signed
  // cards open the document so the volunteer can view their signed copy.
  const open = (doc: DocumentWithVersion) => {
    if (isAwaiting(doc)) {
      const versionId = doc.latest_version?.id
      router.push(`/dashboard/documents/${doc.id}/sign${versionId ? `?versionId=${versionId}` : ''}`)
    } else {
      router.push(`/dashboard/documents/${doc.id}`)
    }
  }

  const awaiting = documents.filter(isAwaiting)
  const signed = documents.filter((d) => d.signed === true)

  if (!isAuthenticated || !user) return null

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Documents to sign</h1>
          <p className="mt-1 text-sm text-muted-foreground">Review and electronically sign documents assigned to you.</p>
        </div>
        {!loading && awaiting.length + queue.length > 0 ? (
          <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">
            <PenLine className="h-3.5 w-3.5" /> {awaiting.length + queue.length} awaiting your signature
          </Badge>
        ) : null}
      </div>

      {loading ? (
        <Card><CardContent className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading documents…
        </CardContent></Card>
      ) : (
        <div className="space-y-8">
          {/* Waiting for you as a named signer (signing order) */}
          {queue.length > 0 ? (
            <section data-testid="signer-queue">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-amber-700">
                <UserCheck className="h-4 w-4" /> Waiting for you to sign for others
              </h2>
              <Card>
                <CardContent className="divide-y p-0">
                  {queue.map((q) => (
                    <div key={`${q.versionId}:${q.recipient}`} className="flex flex-wrap items-center justify-between gap-3 p-4">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">{q.title}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          As {q.roleLabel} · {q.signOnce ? 'sign once for every copy' : `copy for ${q.recipientName ?? 'a team member'}`}
                        </p>
                      </div>
                      <Button asChild size="sm">
                        <Link href={`/dashboard/documents/${q.documentId}/sign?versionId=${q.versionId}&recipient=${q.recipient}`}>
                          <PenLine className="h-3.5 w-3.5" /> Review &amp; sign
                        </Link>
                      </Button>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </section>
          ) : null}

          {/* Awaiting your signature */}
          {awaiting.length > 0 ? (
            <section>
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-amber-700">
                <PenLine className="h-4 w-4" /> Awaiting your signature
              </h2>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {awaiting.map((doc) => (
                  <DocumentCard key={doc.id} document={doc} onClick={open} />
                ))}
              </div>
            </section>
          ) : queue.length > 0 ? null : (
            <Card className="border-green-200 bg-green-50/50">
              <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
                <CheckCheck className="h-10 w-10 text-green-600" />
                <h2 className="text-base font-semibold text-foreground">You&apos;re all caught up</h2>
                <p className="max-w-sm text-sm text-muted-foreground">
                  Nothing needs your signature right now. New documents will appear here when they&apos;re assigned to you.
                </p>
              </CardContent>
            </Card>
          )}

          {/* Signed history */}
          {signed.length > 0 ? (
            <section>
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                <CheckCircle2 className="h-4 w-4 text-green-600" /> Signed
              </h2>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {signed.map((doc) => (
                  <DocumentCard key={doc.id} document={doc} onClick={open} />
                ))}
              </div>
            </section>
          ) : null}
        </div>
      )}
    </div>
  )
}
