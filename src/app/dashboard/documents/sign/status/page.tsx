// src/app/dashboard/documents/sign/status/page.tsx

'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useAuthStore } from '@/stores/auth'
import { documentService } from '@/services/document'
import { DocumentWithVersion } from '@/types/document'
import { PenLine, CheckCircle2, FileSignature, ChevronRight, CheckCheck, Loader2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import toast from 'react-hot-toast'

const isAwaiting = (d: DocumentWithVersion) => Boolean(d.signable) && !d.signed

export default function SigningStatusPage() {
  const { user, isAuthenticated, checkAuth } = useAuthStore()
  const [documents, setDocuments] = useState<DocumentWithVersion[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { checkAuth() }, [checkAuth])
  useEffect(() => { if (isAuthenticated && user) void loadData() }, [isAuthenticated, user])

  const loadData = async () => {
    try {
      setLoading(true)
      setDocuments(await documentService.getDocuments())
    } catch {
      toast.error('Failed to load documents')
    } finally {
      setLoading(false)
    }
  }

  const { awaiting, signed, total } = useMemo(() => {
    const awaiting = documents.filter(isAwaiting)
    const signed = documents.filter((d) => d.signed === true)
    return { awaiting, signed, total: awaiting.length + signed.length }
  }, [documents])

  if (!isAuthenticated || !user) return null

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Signing status</h1>
          <p className="mt-1 text-sm text-muted-foreground">An overview of the documents you need to sign and the ones you&apos;ve signed.</p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/dashboard/documents/sign">
            <FileSignature className="h-4 w-4" /> Go to signing queue
          </Link>
        </Button>
      </div>

      {loading ? (
        <Card><CardContent className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading status…
        </CardContent></Card>
      ) : (
        <div className="space-y-6">
          {/* Summary tiles */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Stat
              label="Awaiting your signature"
              value={awaiting.length}
              icon={PenLine}
              iconBg="bg-amber-100"
              iconColor="text-amber-600"
              valueColor={awaiting.length > 0 ? 'text-amber-700' : 'text-foreground'}
            />
            <Stat
              label="Signed"
              value={signed.length}
              icon={CheckCircle2}
              iconBg="bg-green-100"
              iconColor="text-green-600"
              valueColor="text-foreground"
            />
            <Stat
              label="Total assigned"
              value={total}
              icon={FileSignature}
              iconBg="bg-primary/10"
              iconColor="text-primary"
              valueColor="text-foreground"
            />
          </div>

          {/* Awaiting list */}
          {awaiting.length > 0 ? (
            <section>
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-amber-700">
                <PenLine className="h-4 w-4" /> Awaiting your signature
              </h2>
              <Card>
                <CardContent className="divide-y p-0">
                  {awaiting.map((doc) => (
                    <div key={doc.id} className="flex items-center justify-between gap-3 p-4">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">{doc.title}</p>
                        <p className="truncate text-xs text-muted-foreground">{doc.category_name}</p>
                      </div>
                      <Button asChild size="sm">
                        <Link href={`/dashboard/documents/${doc.id}/sign${doc.latest_version ? `?versionId=${doc.latest_version.id}` : ''}`}>
                          <PenLine className="h-3.5 w-3.5" /> Review &amp; sign
                        </Link>
                      </Button>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </section>
          ) : (
            <Card className="border-green-200 bg-green-50/50">
              <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
                <CheckCheck className="h-10 w-10 text-green-600" />
                <h2 className="text-base font-semibold text-foreground">You&apos;re all caught up</h2>
                <p className="max-w-sm text-sm text-muted-foreground">Nothing is waiting for your signature right now.</p>
              </CardContent>
            </Card>
          )}

          {/* Signed list */}
          {signed.length > 0 ? (
            <section>
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                <CheckCircle2 className="h-4 w-4 text-green-600" /> Signed
              </h2>
              <Card>
                <CardContent className="divide-y p-0">
                  {signed.map((doc) => (
                    <Link
                      key={doc.id}
                      href={`/dashboard/documents/${doc.id}`}
                      className="group flex items-center justify-between gap-3 p-4 transition-colors hover:bg-muted/40"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">{doc.title}</p>
                        <p className="truncate text-xs text-muted-foreground">{doc.category_name}</p>
                      </div>
                      <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-primary group-hover:underline">
                        View <ChevronRight className="h-3.5 w-3.5" />
                      </span>
                    </Link>
                  ))}
                </CardContent>
              </Card>
            </section>
          ) : null}
        </div>
      )}
    </div>
  )
}

function Stat({
  label, value, icon: Icon, iconBg, iconColor, valueColor,
}: {
  label: string
  value: number
  icon: React.ComponentType<{ className?: string }>
  iconBg: string
  iconColor: string
  valueColor: string
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className={`shrink-0 rounded-lg p-2 ${iconBg}`}>
          <Icon className={`h-5 w-5 ${iconColor}`} />
        </div>
        <div className="min-w-0">
          <p className={`text-2xl font-semibold ${valueColor}`}>{value}</p>
          <p className="truncate text-xs text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  )
}
