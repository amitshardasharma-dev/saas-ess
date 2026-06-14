// src/app/dashboard/documents/manage/page.tsx

'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { AcknowledgmentTable } from '@/components/documents/acknowledgment-table'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { useAuthStore } from '@/stores/auth'
import { documentService } from '@/services/document'
import { DocumentWithVersion, DocumentCategory } from '@/types/document'
import {
  Settings,
  Plus,
  Upload,
  Eye,
  EyeOff,
  ClipboardList,
  FileText,
  ChevronDown,
  ChevronUp,
  Loader2,
  ArrowLeft,
} from 'lucide-react'
import toast from 'react-hot-toast'

interface AckReport {
  version: number
  total: number
  acknowledged_count: number
  employees: Array<{
    id: string
    name: string
    employee_no: string
    department: string
    acknowledged: boolean
    acknowledged_at: string | null
  }>
}

export default function DocumentManagePage() {
  const router = useRouter()
  const { user, isAuthenticated, checkAuth } = useAuthStore()

  // List state
  const [documents, setDocuments] = useState<DocumentWithVersion[]>([])
  const [categories, setCategories] = useState<DocumentCategory[]>([])
  const [loading, setLoading] = useState(true)

  // Create form state
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createTitle, setCreateTitle] = useState('')
  const [createDescription, setCreateDescription] = useState('')
  const [createCategoryId, setCreateCategoryId] = useState('')
  const [createRequiresAck, setCreateRequiresAck] = useState(false)

  // Per-document UI state
  const [publishingId, setPublishingId] = useState<string | null>(null)
  const [uploadingId, setUploadingId] = useState<string | null>(null)
  const [expandedAckId, setExpandedAckId] = useState<string | null>(null)
  const [ackReports, setAckReports] = useState<Record<string, AckReport>>({})
  const [loadingAckId, setLoadingAckId] = useState<string | null>(null)

  // File input refs (one per document)
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({})

  useEffect(() => { checkAuth() }, [checkAuth])

  useEffect(() => {
    if (isAuthenticated && user) loadData()
  }, [isAuthenticated, user])

  const loadData = async () => {
    try {
      setLoading(true)
      const [docs, cats] = await Promise.all([
        documentService.getDocuments(true),
        documentService.getCategories(),
      ])
      setDocuments(docs)
      setCategories(cats)
    } catch {
      toast.error('Failed to load documents')
    } finally {
      setLoading(false)
    }
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!createTitle.trim()) {
      toast.error('Title is required')
      return
    }
    try {
      setCreating(true)
      await documentService.createDocument({
        title: createTitle.trim(),
        description: createDescription.trim() || undefined,
        category_id: createCategoryId || undefined,
        requires_acknowledgment: createRequiresAck,
      })
      toast.success('Document created')
      setCreateTitle('')
      setCreateDescription('')
      setCreateCategoryId('')
      setCreateRequiresAck(false)
      setShowCreateForm(false)
      await loadData()
    } catch {
      toast.error('Failed to create document')
    } finally {
      setCreating(false)
    }
  }

  const handleTogglePublish = async (doc: DocumentWithVersion) => {
    try {
      setPublishingId(doc.id)
      await documentService.updateDocument(doc.id, { is_published: !doc.is_published })
      toast.success(doc.is_published ? 'Document unpublished' : 'Document published')
      await loadData()
    } catch {
      toast.error('Failed to update document')
    } finally {
      setPublishingId(null)
    }
  }

  const handleUploadVersion = async (doc: DocumentWithVersion, file: File) => {
    try {
      setUploadingId(doc.id)
      await documentService.uploadVersion(doc.id, file)
      toast.success(`New version uploaded for "${doc.title}"`)
      await loadData()
    } catch {
      toast.error('Failed to upload version')
    } finally {
      setUploadingId(null)
    }
  }

  const handleToggleAckReport = async (doc: DocumentWithVersion) => {
    if (expandedAckId === doc.id) {
      setExpandedAckId(null)
      return
    }
    setExpandedAckId(doc.id)
    if (!ackReports[doc.id]) {
      try {
        setLoadingAckId(doc.id)
        const report = await documentService.getAcknowledgmentReport(doc.id)
        setAckReports(prev => ({ ...prev, [doc.id]: report }))
      } catch {
        toast.error('Failed to load acknowledgment report')
        setExpandedAckId(null)
      } finally {
        setLoadingAckId(null)
      }
    }
  }

  if (!isAuthenticated || !user) return null

  return (
    <DashboardLayout>
      <div className="min-h-screen fluid-bg">
        {/* Header */}
        <div className="border-b border-border bg-background/50 backdrop-blur-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center space-x-3">
                <Button variant="ghost" size="sm" onClick={() => router.push('/dashboard/documents')}>
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <div className="p-2 bg-primary/10 rounded-xl">
                  <Settings className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold">Document Management</h1>
                  <p className="text-muted-foreground text-sm">Create, publish, and track document acknowledgments</p>
                </div>
              </div>
              <Button onClick={() => setShowCreateForm(v => !v)}>
                <Plus className="h-4 w-4 mr-2" />
                Create Document
              </Button>
            </div>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">

          {/* Create Document Form */}
          {showCreateForm && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Plus className="h-4 w-4" />
                  New Document
                </CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleCreate} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-sm font-medium">Title <span className="text-red-500">*</span></label>
                      <Input
                        value={createTitle}
                        onChange={e => setCreateTitle(e.target.value)}
                        placeholder="e.g. Employee Code of Conduct"
                        required
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-sm font-medium">Category</label>
                      <select
                        value={createCategoryId}
                        onChange={e => setCreateCategoryId(e.target.value)}
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                      >
                        <option value="">— No Category —</option>
                        {categories.map(cat => (
                          <option key={cat.id} value={cat.id}>{cat.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium">Description</label>
                    <textarea
                      value={createDescription}
                      onChange={e => setCreateDescription(e.target.value)}
                      placeholder="Brief summary of this document..."
                      rows={2}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="requires_ack"
                      checked={createRequiresAck}
                      onChange={e => setCreateRequiresAck(e.target.checked)}
                      className="h-4 w-4 rounded border-input"
                    />
                    <label htmlFor="requires_ack" className="text-sm font-medium cursor-pointer">
                      Requires employee acknowledgment
                    </label>
                  </div>
                  <div className="flex justify-end gap-2 pt-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setShowCreateForm(false)}
                      disabled={creating}
                    >
                      Cancel
                    </Button>
                    <Button type="submit" disabled={creating}>
                      {creating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
                      {creating ? 'Creating...' : 'Create Document'}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          )}

          {/* Document List */}
          {loading ? (
            <div className="space-y-3">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="animate-pulse h-24 bg-muted rounded-xl" />
              ))}
            </div>
          ) : documents.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p className="text-base font-medium">No documents yet</p>
              <p className="text-sm">Click &quot;Create Document&quot; to add your first document.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {documents.map(doc => (
                <Card key={doc.id} className="overflow-hidden">
                  <CardContent className="p-4">
                    {/* Document row */}
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="flex items-start space-x-3 flex-1 min-w-0">
                        <div className="p-2 rounded-lg bg-blue-100 shrink-0">
                          <FileText className="h-5 w-5 text-blue-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-semibold text-sm">{doc.title}</h3>
                            <Badge variant={doc.is_published ? 'default' : 'secondary'} className="text-xs">
                              {doc.is_published ? 'Published' : 'Draft'}
                            </Badge>
                            {doc.requires_acknowledgment && (
                              <Badge variant="outline" className="text-xs">Requires Ack</Badge>
                            )}
                          </div>
                          {doc.description && (
                            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{doc.description}</p>
                          )}
                          <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                            <span>{doc.category_name || 'Uncategorized'}</span>
                            <span>v{doc.current_version}</span>
                            {doc.latest_version && (
                              <span>
                                Updated {new Date(doc.latest_version.uploaded_at).toLocaleDateString('en-GB', {
                                  day: 'numeric', month: 'short', year: 'numeric'
                                })}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div className="flex items-center gap-2 shrink-0 flex-wrap">
                        {/* Publish/Unpublish toggle */}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleTogglePublish(doc)}
                          disabled={publishingId === doc.id}
                        >
                          {publishingId === doc.id ? (
                            <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                          ) : doc.is_published ? (
                            <EyeOff className="h-4 w-4 mr-1" />
                          ) : (
                            <Eye className="h-4 w-4 mr-1" />
                          )}
                          {doc.is_published ? 'Unpublish' : 'Publish'}
                        </Button>

                        {/* Upload new version */}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => fileInputRefs.current[doc.id]?.click()}
                          disabled={uploadingId === doc.id}
                        >
                          {uploadingId === doc.id ? (
                            <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                          ) : (
                            <Upload className="h-4 w-4 mr-1" />
                          )}
                          {uploadingId === doc.id ? 'Uploading...' : 'Upload Version'}
                        </Button>
                        <input
                          type="file"
                          className="hidden"
                          ref={el => { fileInputRefs.current[doc.id] = el }}
                          onChange={e => {
                            const file = e.target.files?.[0]
                            if (file) handleUploadVersion(doc, file)
                            // Reset so same file can be re-selected
                            if (e.target) e.target.value = ''
                          }}
                        />

                        {/* Acknowledgment report (only for docs requiring ack) */}
                        {doc.requires_acknowledgment && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleToggleAckReport(doc)}
                          >
                            <ClipboardList className="h-4 w-4 mr-1" />
                            Ack Report
                            {expandedAckId === doc.id ? (
                              <ChevronUp className="h-4 w-4 ml-1" />
                            ) : (
                              <ChevronDown className="h-4 w-4 ml-1" />
                            )}
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* Acknowledgment report panel */}
                    {expandedAckId === doc.id && (
                      <div className="mt-4 border-t pt-4">
                        {loadingAckId === doc.id ? (
                          <div className="flex items-center justify-center py-8">
                            <Loader2 className="h-6 w-6 animate-spin text-primary" />
                          </div>
                        ) : ackReports[doc.id] ? (
                          <AcknowledgmentTable
                            employees={ackReports[doc.id].employees}
                            version={ackReports[doc.id].version}
                            acknowledgedCount={ackReports[doc.id].acknowledged_count}
                            total={ackReports[doc.id].total}
                          />
                        ) : null}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  )
}
