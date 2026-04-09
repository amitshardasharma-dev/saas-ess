// src/app/dashboard/documents/[id]/page.tsx

'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useAuthStore } from '@/stores/auth'
import { documentService } from '@/services/document'
import { Document, DocumentVersion } from '@/types/document'
import { ArrowLeft, Download, CheckCircle, FileText, Clock, AlertCircle } from 'lucide-react'
import toast from 'react-hot-toast'

export default function DocumentDetailPage() {
  const params = useParams()
  const router = useRouter()
  const { user, isAuthenticated, checkAuth } = useAuthStore()
  const [document, setDocument] = useState<Document | null>(null)
  const [versions, setVersions] = useState<DocumentVersion[]>([])
  const [acknowledged, setAcknowledged] = useState(false)
  const [loading, setLoading] = useState(true)
  const [acknowledging, setAcknowledging] = useState(false)

  useEffect(() => { checkAuth() }, [checkAuth])

  useEffect(() => {
    if (isAuthenticated && user && params.id) loadData()
  }, [isAuthenticated, user, params.id])

  const loadData = async () => {
    try {
      setLoading(true)
      const data = await documentService.getDocument(params.id as string)
      setDocument(data.document)
      setVersions(data.versions)
      setAcknowledged(data.acknowledged)
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

  if (loading) {
    return (
      <DashboardLayout>
        <div className="min-h-screen fluid-bg flex items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
        </div>
      </DashboardLayout>
    )
  }

  if (!document) {
    return (
      <DashboardLayout>
        <div className="min-h-screen fluid-bg flex items-center justify-center">
          <p className="text-muted-foreground">Document not found</p>
        </div>
      </DashboardLayout>
    )
  }

  const latestVersion = versions[0]

  return (
    <DashboardLayout>
      <div className="min-h-screen fluid-bg">
        <div className="border-b border-border bg-background/50 backdrop-blur-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center space-x-3">
                <Button variant="ghost" size="sm" onClick={() => router.push('/dashboard/documents')}>
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <div>
                  <h1 className="text-2xl font-bold">{document.title}</h1>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="outline">{(document as any).category_name || 'Uncategorized'}</Badge>
                    <span className="text-sm text-muted-foreground">Version {document.current_version}</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                {latestVersion && (
                  <Button variant="outline" onClick={() => window.open(latestVersion.file_url, '_blank')}>
                    <Download className="h-4 w-4 mr-2" /> Download
                  </Button>
                )}
                {document.requires_acknowledgment && !acknowledged && (
                  <Button onClick={handleAcknowledge} disabled={acknowledging} className="bg-green-600 hover:bg-green-700">
                    <CheckCircle className="h-4 w-4 mr-2" />
                    {acknowledging ? 'Acknowledging...' : 'I Have Read & Understood'}
                  </Button>
                )}
                {document.requires_acknowledgment && acknowledged && (
                  <Badge className="bg-green-100 text-green-800 py-2 px-3">
                    <CheckCircle className="h-4 w-4 mr-1" /> Acknowledged
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
          {/* Pending acknowledgment banner */}
          {document.requires_acknowledgment && !acknowledged && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center gap-3">
              <AlertCircle className="h-5 w-5 text-amber-600 shrink-0" />
              <p className="text-sm text-amber-800">
                This document requires your acknowledgment. Please read it and click &quot;I Have Read &amp; Understood&quot;.
              </p>
            </div>
          )}

          {/* Description */}
          {document.description && (
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">{document.description}</p>
              </CardContent>
            </Card>
          )}

          {/* Version History */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="h-4 w-4" /> Version History
              </CardTitle>
            </CardHeader>
            <CardContent>
              {versions.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground">
                  <FileText className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No versions uploaded yet</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {versions.map((v, i) => (
                    <div
                      key={v.id}
                      className={`flex items-center justify-between p-3 rounded-lg border ${i === 0 ? 'border-primary/30 bg-primary/5' : ''}`}
                    >
                      <div className="flex items-center space-x-3">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <p className="text-sm font-medium">
                            v{v.version_number} — {v.file_name}
                            {i === 0 && <Badge className="ml-2 text-xs" variant="outline">Latest</Badge>}
                          </p>
                          {v.changelog && <p className="text-xs text-muted-foreground mt-0.5">{v.changelog}</p>}
                          <p className="text-xs text-muted-foreground">
                            {new Date(v.uploaded_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                            {' · '}{(v.file_size / 1024).toFixed(0)} KB
                          </p>
                        </div>
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => window.open(v.file_url, '_blank')}>
                        <Download className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  )
}
