// src/app/dashboard/documents/manage/page.tsx
//
// Staff/admin (hr+) document management. Lists every document (published + draft)
// with status, version, and requirement badges; create/edit via DocumentEditor;
// publish/unpublish, upload a new version, delete, and view per-document
// acknowledgment reports. Design standard: max-w-5xl container, Card/Button/
// Badge, lucide icons, neutral tokens — no DashboardLayout (the app shell wraps
// dashboard routes) and no gradients.

'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AcknowledgmentTable } from '@/components/documents/acknowledgment-table'
import { DocumentEditor } from '@/components/documents/document-editor'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useAuthStore } from '@/stores/auth'
import { documentService } from '@/services/document'
import { DocumentWithVersion, DocumentCategory } from '@/types/document'
import {
  Plus, Upload, Eye, EyeOff, ClipboardList, FileText, ChevronDown, ChevronUp,
  Loader2, Pencil, Trash2, PenLine, ShieldCheck, ArrowLeft, FolderOpen,
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

type EditorState = { mode: 'closed' } | { mode: 'new' } | { mode: 'edit'; document: DocumentWithVersion }

export default function DocumentManagePage() {
  const router = useRouter()
  const { user, isAuthenticated, checkAuth } = useAuthStore()

  // hr+ only — must match the server's `minRole: 'hr'` on every mutation, so
  // managers (below hr in the hierarchy) don't see a UI that would 403.
  const canManage = !!(user && (user.is_super_admin === true || ['admin', 'hr'].includes(user.role || '')))

  const [documents, setDocuments] = useState<DocumentWithVersion[]>([])
  const [categories, setCategories] = useState<DocumentCategory[]>([])
  const [loading, setLoading] = useState(true)

  const [editor, setEditor] = useState<EditorState>({ mode: 'closed' })

  const [publishingId, setPublishingId] = useState<string | null>(null)
  const [uploadingId, setUploadingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [expandedAckId, setExpandedAckId] = useState<string | null>(null)
  const [ackReports, setAckReports] = useState<Record<string, AckReport>>({})
  const [loadingAckId, setLoadingAckId] = useState<string | null>(null)

  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({})

  useEffect(() => { checkAuth() }, [checkAuth])
  useEffect(() => { if (isAuthenticated && user) void loadData() }, [isAuthenticated, user])

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

  const handleEditorSaved = async () => {
    setEditor({ mode: 'closed' })
    await loadData()
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

  const handleDelete = async (doc: DocumentWithVersion) => {
    if (!window.confirm(`Delete "${doc.title}"? This cannot be undone.`)) return
    try {
      setDeletingId(doc.id)
      await documentService.deleteDocument(doc.id)
      toast.success('Document deleted')
      await loadData()
    } catch {
      toast.error('Failed to delete document')
    } finally {
      setDeletingId(null)
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
        setAckReports((prev) => ({ ...prev, [doc.id]: report }))
      } catch {
        toast.error('Failed to load acknowledgment report')
        setExpandedAckId(null)
      } finally {
        setLoadingAckId(null)
      }
    }
  }

  if (!isAuthenticated || !user) return null

  if (!canManage) {
    return (
      <div className="mx-auto w-full max-w-5xl space-y-6 p-6">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Document management</h1>
        </div>
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-16 text-center text-sm text-muted-foreground">
            <ShieldCheck className="h-10 w-10 opacity-30" />
            You don&apos;t have access to manage documents.
            <Button variant="outline" size="sm" className="mt-2" onClick={() => router.push('/dashboard/documents')}>
              <ArrowLeft className="h-4 w-4" /> Back to documents
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (editor.mode !== 'closed') {
    return (
      <div className="mx-auto w-full max-w-5xl space-y-6 p-6">
        <DocumentEditor
          document={editor.mode === 'edit' ? editor.document : undefined}
          categories={categories}
          onClose={() => setEditor({ mode: 'closed' })}
          onSaved={handleEditorSaved}
        />
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => router.push('/dashboard/documents')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Document management</h1>
            <p className="mt-1 text-sm text-muted-foreground">Author, publish, and track documents.</p>
          </div>
        </div>
        <Button onClick={() => setEditor({ mode: 'new' })}>
          <Plus className="h-4 w-4" /> New document
        </Button>
      </div>

      {/* List */}
      {loading ? (
        <Card>
          <CardContent className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading documents…
          </CardContent>
        </Card>
      ) : documents.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-16 text-center text-sm text-muted-foreground">
            <FolderOpen className="h-10 w-10 opacity-30" />
            <p className="text-base font-medium text-foreground">No documents yet</p>
            <p>Create your first document to get started.</p>
            <Button className="mt-2" onClick={() => setEditor({ mode: 'new' })}>
              <Plus className="h-4 w-4" /> New document
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {documents.map((doc) => {
            const isMarkdown = Boolean(doc.body_markdown && doc.body_markdown.trim())
            return (
              <Card key={doc.id} className="overflow-hidden">
                <CardContent className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex min-w-0 flex-1 items-start gap-3">
                      <div className="mt-0.5 shrink-0 rounded-lg bg-muted p-2">
                        {isMarkdown ? (
                          <PenLine className="h-5 w-5 text-muted-foreground" />
                        ) : (
                          <FileText className="h-5 w-5 text-muted-foreground" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-sm font-semibold text-foreground">{doc.title}</h3>
                          <Badge variant={doc.is_published ? 'default' : 'secondary'} className="text-xs">
                            {doc.is_published ? 'Published' : 'Draft'}
                          </Badge>
                          {doc.signable ? (
                            <Badge variant="outline" className="gap-1 text-xs">
                              <ShieldCheck className="h-3 w-3" /> Signature
                            </Badge>
                          ) : doc.requires_acknowledgment ? (
                            <Badge variant="outline" className="text-xs">Acknowledgment</Badge>
                          ) : null}
                        </div>
                        {doc.description ? (
                          <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{doc.description}</p>
                        ) : null}
                        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                          <span>{doc.category_name || 'Uncategorized'}</span>
                          <span>v{doc.current_version}</span>
                          <span>{isMarkdown ? 'Authored in-app' : doc.latest_version ? 'Uploaded file' : 'No content'}</span>
                          {doc.latest_version ? (
                            <span>
                              Updated {new Date(doc.latest_version.uploaded_at).toLocaleDateString('en-GB', {
                                day: 'numeric', month: 'short', year: 'numeric',
                              })}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      <Button variant="outline" size="sm" onClick={() => setEditor({ mode: 'edit', document: doc })}>
                        <Pencil className="h-4 w-4" /> Edit
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleTogglePublish(doc)}
                        disabled={publishingId === doc.id}
                      >
                        {publishingId === doc.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : doc.is_published ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                        {doc.is_published ? 'Unpublish' : 'Publish'}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => fileInputRefs.current[doc.id]?.click()}
                        disabled={uploadingId === doc.id}
                      >
                        {uploadingId === doc.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                        {uploadingId === doc.id ? 'Uploading…' : 'New version'}
                      </Button>
                      <input
                        type="file"
                        accept="application/pdf,.pdf"
                        className="hidden"
                        ref={(el) => { fileInputRefs.current[doc.id] = el }}
                        onChange={(e) => {
                          const file = e.target.files?.[0]
                          if (file) void handleUploadVersion(doc, file)
                          if (e.target) e.target.value = ''
                        }}
                      />
                      {doc.requires_acknowledgment ? (
                        <Button variant="outline" size="sm" onClick={() => handleToggleAckReport(doc)}>
                          <ClipboardList className="h-4 w-4" /> Report
                          {expandedAckId === doc.id ? (
                            <ChevronUp className="h-4 w-4" />
                          ) : (
                            <ChevronDown className="h-4 w-4" />
                          )}
                        </Button>
                      ) : null}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDelete(doc)}
                        disabled={deletingId === doc.id}
                        className="text-destructive hover:text-destructive"
                      >
                        {deletingId === doc.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>

                  {/* Acknowledgment report */}
                  {expandedAckId === doc.id ? (
                    <div className="mt-4 border-t pt-4">
                      {loadingAckId === doc.id ? (
                        <div className="flex items-center justify-center py-8">
                          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
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
                  ) : null}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
