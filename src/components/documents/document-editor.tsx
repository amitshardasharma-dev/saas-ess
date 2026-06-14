'use client'

// Staff/admin (hr+) authoring surface for a single document. Create or edit a
// document with a title, description, category, access level, an acknowledgment
// toggle, an optional signature requirement, and CONTENT authored two ways:
//   (a) Markdown with a live preview (saved to body_markdown), or
//   (b) an uploaded PDF (a new version in the ess-documents bucket).
//
// "Requires signature" orchestration (see flow in handleSave):
//   - Markdown content -> the server renders the body to a PDF, uploads it as a
//     version, and defines a single required signature field on it.
//   - PDF content      -> the server defines the signature field on the latest
//     uploaded PDF version.
// Turning the toggle OFF clears the field set on the latest version.
//
// Design standard: Card/Button/Badge/Input/Label/Textarea, lucide icons,
// neutral tokens, real states. No gradients / DashboardLayout (the page wraps).

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft, FileText, Loader2, Upload, Save, Eye, PenLine, FileType2,
  CheckCircle2, AlertCircle,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { documentService } from '@/services/document'
import { esignService } from '@/services/esign-client'
import { mdToHtml } from '@/lib/communications/markdown'
import { DocumentCategory, DocumentWithVersion } from '@/types/document'
import toast from 'react-hot-toast'

type ContentMode = 'markdown' | 'file'

// Access level -> the access_roles array persisted on the document. The GET list
// filters by `access_roles.includes(role)`, so each level is the set of roles
// at-or-above the chosen tier.
const ACCESS_LEVELS: { value: string; label: string; roles: string[] }[] = [
  { value: 'all', label: 'All staff & volunteers', roles: ['employee', 'manager', 'hr', 'admin'] },
  { value: 'staff', label: 'Staff only (managers, HR, admins)', roles: ['manager', 'hr', 'admin'] },
  { value: 'hr', label: 'HR & admins only', roles: ['hr', 'admin'] },
  { value: 'admin', label: 'Admins only', roles: ['admin'] },
]

function accessLevelFromRoles(roles: string[] | null | undefined): string {
  if (!roles || roles.length === 0) return 'all'
  if (!roles.includes('employee') && !roles.includes('manager') && roles.includes('hr')) {
    return roles.includes('manager') ? 'staff' : roles.length === 1 ? 'admin' : 'hr'
  }
  if (roles.includes('employee')) return 'all'
  if (roles.includes('manager')) return 'staff'
  if (roles.includes('hr')) return 'hr'
  return 'admin'
}

export function DocumentEditor({
  document: doc,
  categories,
  onClose,
  onSaved,
}: {
  /** Existing document when editing; undefined when creating. */
  document?: DocumentWithVersion
  categories: DocumentCategory[]
  onClose: () => void
  onSaved: () => void
}) {
  const isEdit = Boolean(doc)

  const [title, setTitle] = useState(doc?.title ?? '')
  const [description, setDescription] = useState(doc?.description ?? '')
  const [categoryId, setCategoryId] = useState(doc?.category_id ?? '')
  const [accessLevel, setAccessLevel] = useState(accessLevelFromRoles(doc?.access_roles))
  const [requiresAck, setRequiresAck] = useState(doc?.requires_acknowledgment ?? false)
  const [requiresSignature, setRequiresSignature] = useState(Boolean(doc?.signable))

  // Content: a doc is markdown-authored when it has body_markdown and no file,
  // otherwise file-based. New docs default to markdown.
  const initialMode: ContentMode =
    doc && doc.latest_version && !(doc.body_markdown && doc.body_markdown.trim()) ? 'file' : 'markdown'
  const [contentMode, setContentMode] = useState<ContentMode>(initialMode)
  const [markdown, setMarkdown] = useState(doc?.body_markdown ?? '')
  const [pdfFile, setPdfFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const [saving, setSaving] = useState(false)
  const [publishedState, setPublishedState] = useState(doc?.is_published ?? false)
  const hasExistingFile = Boolean(doc?.latest_version)

  const preview = useMemo(() => mdToHtml(markdown), [markdown])

  useEffect(() => {
    // Reset file selection if the user switches away from the upload tab.
    if (contentMode !== 'file') setPdfFile(null)
  }, [contentMode])

  const signatureUnavailable =
    requiresSignature &&
    contentMode === 'file' &&
    !pdfFile &&
    !hasExistingFile

  const handlePickFile = (file: File | null) => {
    if (file && file.type && file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name)) {
      toast.error('Please choose a PDF file')
      return
    }
    setPdfFile(file)
  }

  const handleSave = async (publish?: boolean) => {
    if (!title.trim()) {
      toast.error('Title is required')
      return
    }
    if (contentMode === 'markdown' && !markdown.trim() && !hasExistingFile && !pdfFile) {
      toast.error('Add some content or upload a PDF')
      return
    }
    if (requiresSignature && contentMode === 'markdown' && !markdown.trim()) {
      toast.error('Signature documents need authored content to generate from')
      return
    }
    if (requiresSignature && contentMode === 'file' && !pdfFile && !hasExistingFile) {
      toast.error('Upload a PDF before enabling signing')
      return
    }

    setSaving(true)
    try {
      const accessRoles = ACCESS_LEVELS.find((l) => l.value === accessLevel)?.roles
      // Persist body_markdown only when authoring in markdown; clear it when the
      // doc is file-based so the viewer falls back to the uploaded file.
      const bodyMarkdown = contentMode === 'markdown' ? markdown : ''

      let documentId = doc?.id
      if (isEdit && doc) {
        await documentService.updateDocument(doc.id, {
          title: title.trim(),
          description: description.trim() || null,
          category_id: categoryId || null,
          body_markdown: bodyMarkdown,
          access_roles: accessRoles,
          requires_acknowledgment: requiresAck,
        } as Partial<DocumentWithVersion>)
      } else {
        const created = await documentService.createDocument({
          title: title.trim(),
          description: description.trim() || undefined,
          category_id: categoryId || undefined,
          body_markdown: bodyMarkdown,
          access_roles: accessRoles,
          requires_acknowledgment: requiresAck,
        })
        documentId = created.id
      }
      if (!documentId) throw new Error('No document id')

      // Upload a PDF version when one was chosen (file mode).
      if (contentMode === 'file' && pdfFile) {
        await documentService.uploadVersion(documentId, pdfFile)
      }

      // Signature requirement: enable or clear.
      if (requiresSignature) {
        await esignService.setupSignature(documentId, contentMode === 'markdown' ? 'markdown' : 'file')
      } else if (isEdit && doc?.signable && doc.latest_version) {
        // Was signable, now turned off -> clear the field set on the latest version.
        await esignService.saveFields(documentId, doc.latest_version.id, [])
      }

      // Publish/unpublish if requested.
      if (publish !== undefined && publish !== publishedState) {
        await documentService.updateDocument(documentId, { is_published: publish })
        setPublishedState(publish)
      }

      toast.success(isEdit ? 'Document saved' : 'Document created')
      onSaved()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save document')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={saving}>
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>
          <div>
            <h1 className="text-2xl font-semibold text-foreground">{isEdit ? 'Edit document' : 'New document'}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Author content in markdown or upload a PDF. Add a signature requirement if volunteers must sign.
            </p>
          </div>
        </div>
        {isEdit ? (
          <Badge variant={publishedState ? 'default' : 'secondary'}>{publishedState ? 'Published' : 'Draft'}</Badge>
        ) : null}
      </div>

      {/* Details */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="h-4 w-4 text-muted-foreground" /> Document details
          </CardTitle>
          <CardDescription>Basic information volunteers and staff will see.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label className="text-sm">Title <span className="text-destructive">*</span></Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Code of Conduct" />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label className="text-sm">Description</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Short summary shown in the library"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm">Category</Label>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              <option value="">No category</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm">Who can access this</Label>
            <select
              value={accessLevel}
              onChange={(e) => setAccessLevel(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              {ACCESS_LEVELS.map((l) => (
                <option key={l.value} value={l.value}>{l.label}</option>
              ))}
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Content */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <PenLine className="h-4 w-4 text-muted-foreground" /> Content
          </CardTitle>
          <CardDescription>Write it in the portal, or upload a finished PDF.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Mode switch */}
          <div className="inline-flex rounded-md border bg-muted/40 p-0.5">
            <button
              type="button"
              onClick={() => setContentMode('markdown')}
              className={`inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-sm font-medium transition-colors ${
                contentMode === 'markdown' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <PenLine className="h-4 w-4" /> Write (Markdown)
            </button>
            <button
              type="button"
              onClick={() => setContentMode('file')}
              className={`inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-sm font-medium transition-colors ${
                contentMode === 'file' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <FileType2 className="h-4 w-4" /> Upload PDF
            </button>
          </div>

          {contentMode === 'markdown' ? (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-sm">Markdown</Label>
                <Textarea
                  value={markdown}
                  onChange={(e) => setMarkdown(e.target.value)}
                  placeholder={'# Heading\n\nWrite the policy here. **Bold**, _italic_, lists:\n\n- First point\n- Second point\n\n[A link](https://example.org)'}
                  className="min-h-[320px] font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  Supports headings, bold, italic, inline code, links, and lists.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5 text-sm"><Eye className="h-3.5 w-3.5" /> Live preview</Label>
                {markdown.trim() ? (
                  <div
                    className="prose prose-sm min-h-[320px] max-w-none overflow-auto rounded-md border bg-muted/20 p-4 text-foreground prose-headings:text-foreground prose-a:text-primary"
                    dangerouslySetInnerHTML={{ __html: preview }}
                  />
                ) : (
                  <div className="flex min-h-[320px] items-center justify-center rounded-md border border-dashed bg-muted/20 text-sm text-muted-foreground">
                    Nothing to preview yet
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div
                className="flex flex-col items-center justify-center gap-2 rounded-md border border-dashed bg-muted/20 px-4 py-10 text-center"
              >
                <Upload className="h-8 w-8 text-muted-foreground" />
                {pdfFile ? (
                  <p className="text-sm text-foreground">
                    Selected: <span className="font-medium">{pdfFile.name}</span>
                  </p>
                ) : hasExistingFile ? (
                  <p className="text-sm text-muted-foreground">
                    Current file: <span className="font-medium text-foreground">{doc?.latest_version?.file_name}</span> (v{doc?.current_version}). Choose a file to upload a new version.
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">Choose a PDF to upload</p>
                )}
                <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                  <Upload className="h-4 w-4" /> {pdfFile || hasExistingFile ? 'Choose a different file' : 'Choose PDF'}
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/pdf,.pdf"
                  className="hidden"
                  onChange={(e) => {
                    handlePickFile(e.target.files?.[0] ?? null)
                    if (e.target) e.target.value = ''
                  }}
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Requirements */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CheckCircle2 className="h-4 w-4 text-muted-foreground" /> Requirements
          </CardTitle>
          <CardDescription>What people must do with this document.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={requiresAck}
              onChange={(e) => setRequiresAck(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-input"
            />
            <span>
              <span className="block text-sm font-medium">Requires acknowledgment</span>
              <span className="block text-xs text-muted-foreground">People must confirm they have read it.</span>
            </span>
          </label>

          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={requiresSignature}
              onChange={(e) => setRequiresSignature(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-input"
            />
            <span>
              <span className="block text-sm font-medium">Requires signature</span>
              <span className="block text-xs text-muted-foreground">
                People must sign it. Markdown content is rendered to a PDF for signing; uploaded PDFs are signed directly.
              </span>
            </span>
          </label>

          {signatureUnavailable ? (
            <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50/60 p-3 text-xs text-amber-800">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              Upload a PDF (or switch to Markdown content) so this document can be signed.
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="sticky bottom-0 -mx-6 border-t bg-background/95 px-6 py-3 backdrop-blur">
        <div className="flex flex-wrap items-center justify-end gap-3">
          <span className="mr-auto text-xs text-muted-foreground">Required fields are marked with *</span>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button variant="outline" onClick={() => handleSave(false)} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save draft
          </Button>
          <Button onClick={() => handleSave(true)} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />} Save &amp; publish
          </Button>
        </div>
      </div>
    </div>
  )
}
