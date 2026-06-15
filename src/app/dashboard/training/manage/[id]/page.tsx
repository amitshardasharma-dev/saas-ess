// src/app/dashboard/training/manage/[id]/page.tsx
//
// Module builder (Staff/Admin). Three jobs:
//
//   1. Lifecycle + details — rename the module, edit its description, and move it
//      through draft → published → archived.
//   2. Items — add a video (paste a URL, auto-detect the provider, see a LIVE
//      embed preview), a document (UPLOAD a file or LINK an existing one), or a
//      quiz (pick from the tenant's quizzes). Reorder (up/down), toggle required,
//      delete.
//   3. Assign — target a role / department (org_unit) / group / individual using
//      proper selects populated from the tenant (never raw UUID paste), and see
//      who currently resolves into the module.
//
// Document upload reuses the existing documents flow: POST /api/documents creates
// the document row, POST /api/documents/{id}/versions uploads the file as v1, then
// a PUT publishes it so it is also visible in the document library — and the new
// document_id is linked as the training item.
//
// Styling matches the document library + profile forms: max-w-5xl shell,
// Card/Badge/Button/Input/Label/Textarea primitives, lucide icons, neutral
// tokens, real loading / empty / error / forbidden states. No DashboardLayout.

'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useAuthStore } from '@/stores/auth'
import { hasMinRole, USER_ROLES, roleManageLabel, type UserRole } from '@/types/roles'
import { trainingService } from '@/services/training'
import { VideoEmbed } from '@/components/training/video-embed'
import { detectVideoProvider } from '@/lib/training/video'
import type {
  Assignee,
  TrainingAssignment,
  TrainingGroup,
  TrainingItem,
  TrainingItemType,
  TrainingModuleWithItems,
  TrainingTargetType,
  VideoProvider,
} from '@/types/training'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  ArrowLeft,
  ArrowUp,
  ArrowDown,
  Trash2,
  Video,
  FileText,
  HelpCircle,
  Upload,
  Link2,
  Plus,
  Users,
  UserPlus,
  CheckCircle2,
  FileEdit,
  Archive,
  Loader2,
  AlertCircle,
  Ban,
  X,
  Save,
  Youtube,
} from 'lucide-react'
import toast from 'react-hot-toast'

function authHeaders(extra: HeadersInit = {}): HeadersInit {
  const token = typeof window !== 'undefined' ? localStorage.getItem('ess_access_token') : null
  return { ...extra, ...(token ? { Authorization: `Bearer ${token}` } : {}) }
}

/* ----------------------------- picker types ----------------------------- */

interface DocOption {
  id: string
  title: string
  category_name: string | null
}
interface QuizOption {
  id: string
  title: string
  status: string
}
interface PersonOption {
  id: string
  name: string
  orgUnit: string | null
  role: UserRole
}

/* =============================== page shell =============================== */

type PageState =
  | { kind: 'loading' }
  | { kind: 'forbidden' }
  | { kind: 'notfound' }
  | { kind: 'error' }
  | { kind: 'ok'; module: TrainingModuleWithItems; assignments: TrainingAssignment[]; assignees: Assignee[] }

export default function ModuleBuilderPage() {
  const params = useParams<{ id: string }>()
  const moduleId = params.id
  const { user, isAuthenticated, checkAuth } = useAuthStore()

  useEffect(() => {
    checkAuth()
  }, [checkAuth])

  const [state, setState] = useState<PageState>({ kind: 'loading' })

  const load = useCallback(async () => {
    if (!user || !hasMinRole(user.role, 'hr')) {
      setState({ kind: 'forbidden' })
      return
    }
    try {
      const mod = await trainingService.getModule(moduleId)
      if (!mod) {
        setState({ kind: 'notfound' })
        return
      }
      const assn = await trainingService.getAssignments(moduleId)
      setState({ kind: 'ok', module: mod, assignments: assn.assignments, assignees: assn.assignees })
    } catch {
      setState({ kind: 'error' })
    }
  }, [moduleId, user])

  useEffect(() => {
    if (isAuthenticated && user) void load()
  }, [isAuthenticated, user, load])

  if (!isAuthenticated || !user || state.kind === 'loading') {
    return (
      <div className="mx-auto w-full max-w-5xl p-6">
        <Card>
          <CardContent className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading module…
          </CardContent>
        </Card>
      </div>
    )
  }

  if (state.kind === 'forbidden') {
    return (
      <ShellMessage
        Icon={Ban}
        text="You do not have access to training management."
      />
    )
  }
  if (state.kind === 'notfound') {
    return <ShellMessage Icon={AlertCircle} text="This module could not be found." />
  }
  if (state.kind === 'error') {
    return (
      <ShellMessage Icon={AlertCircle} text="Could not load this module." onRetry={() => void load()} />
    )
  }

  return (
    <Builder
      module={state.module}
      assignments={state.assignments}
      assignees={state.assignees}
      onChanged={load}
    />
  )
}

function ShellMessage({
  Icon,
  text,
  onRetry,
}: {
  Icon: React.ComponentType<{ className?: string }>
  text: string
  onRetry?: () => void
}) {
  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 p-6">
      <Link
        href="/dashboard/training/manage"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to training
      </Link>
      <Card>
        <CardContent className="flex flex-col items-center gap-2 py-16 text-center text-sm text-muted-foreground">
          <Icon className="h-10 w-10 opacity-30" /> {text}
          {onRetry ? (
            <Button variant="outline" size="sm" className="mt-2" onClick={onRetry}>
              Try again
            </Button>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}

/* ================================ builder ================================ */

const STATUS_META = {
  published: { label: 'Published', className: 'bg-green-100 text-green-800 hover:bg-green-100' },
  draft: { label: 'Draft', className: 'bg-amber-100 text-amber-800 hover:bg-amber-100' },
  archived: { label: 'Archived', className: 'bg-muted text-muted-foreground hover:bg-muted' },
} as const

function Builder({
  module,
  assignments,
  assignees,
  onChanged,
}: {
  module: TrainingModuleWithItems
  assignments: TrainingAssignment[]
  assignees: Assignee[]
  onChanged: () => void | Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  const meta = STATUS_META[module.status]

  const setStatus = async (status: 'published' | 'archived' | 'draft', ok: string) => {
    setBusy(true)
    try {
      await trainingService.updateModule(module.id, { status })
      toast.success(ok)
      await onChanged()
    } catch {
      toast.error('Could not update module')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-6">
      <Link
        href="/dashboard/training/manage"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to training
      </Link>

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-2xl font-semibold text-foreground">{module.title}</h1>
            <Badge className={meta.className}>{meta.label}</Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {module.description || 'Add videos, documents and quizzes, then assign this module.'}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {module.status !== 'published' ? (
            <Button onClick={() => setStatus('published', 'Module published')} disabled={busy}>
              <CheckCircle2 className="h-4 w-4" /> Publish
            </Button>
          ) : (
            <Button variant="outline" onClick={() => setStatus('draft', 'Moved to draft')} disabled={busy}>
              <FileEdit className="h-4 w-4" /> Unpublish
            </Button>
          )}
          {module.status !== 'archived' ? (
            <Button variant="outline" onClick={() => setStatus('archived', 'Module archived')} disabled={busy}>
              <Archive className="h-4 w-4" /> Archive
            </Button>
          ) : (
            <Button variant="outline" onClick={() => setStatus('draft', 'Restored to draft')} disabled={busy}>
              <FileEdit className="h-4 w-4" /> Restore
            </Button>
          )}
        </div>
      </div>

      <DetailsCard module={module} onChanged={onChanged} />
      <ItemsCard module={module} onChanged={onChanged} />
      <AssignCard
        moduleId={module.id}
        assignments={assignments}
        assignees={assignees}
        onChanged={onChanged}
      />
    </div>
  )
}

/* ============================== details card ============================== */

function DetailsCard({
  module,
  onChanged,
}: {
  module: TrainingModuleWithItems
  onChanged: () => void | Promise<void>
}) {
  const [title, setTitle] = useState(module.title)
  const [description, setDescription] = useState(module.description ?? '')
  const [validity, setValidity] = useState(module.validity_months != null ? String(module.validity_months) : '')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setTitle(module.title)
    setDescription(module.description ?? '')
    setValidity(module.validity_months != null ? String(module.validity_months) : '')
  }, [module.title, module.description, module.validity_months])

  const parsedValidity =
    validity.trim() === '' ? null : Number.isFinite(Number(validity)) ? Math.max(1, Math.round(Number(validity))) : null
  const dirty =
    title.trim() !== module.title ||
    description.trim() !== (module.description ?? '') ||
    parsedValidity !== (module.validity_months ?? null)

  const save = async () => {
    if (!title.trim()) {
      toast.error('Title is required')
      return
    }
    setSaving(true)
    try {
      await trainingService.updateModule(module.id, {
        title: title.trim(),
        description: description.trim() || null,
        validity_months: parsedValidity,
      })
      toast.success('Details saved')
      await onChanged()
    } catch {
      toast.error('Could not save details')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <FileEdit className="h-4 w-4 text-muted-foreground" /> Module details
        </CardTitle>
        <CardDescription>The name and summary learners see.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label className="text-sm">
            Title<span className="ml-0.5 text-destructive">*</span>
          </Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-sm">Description</Label>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="What this module covers (optional)"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-sm">Validity / expiry (months)</Label>
          <Input
            type="number"
            min={1}
            value={validity}
            onChange={(e) => setValidity(e.target.value)}
            placeholder="Leave blank for no expiry"
          />
          <p className="text-xs text-muted-foreground">
            {parsedValidity
              ? `Each completion expires ${parsedValidity} month${parsedValidity === 1 ? '' : 's'} later, then the module is automatically re-assigned.`
              : 'No expiry — a completion never lapses.'}
          </p>
        </div>
        <div className="flex justify-end">
          <Button onClick={save} disabled={saving || !dirty || !title.trim()}>
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Saving…
              </>
            ) : (
              <>
                <Save className="h-4 w-4" /> Save details
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

/* =============================== items card =============================== */

const ITEM_META: Record<
  TrainingItemType,
  { label: string; Icon: React.ComponentType<{ className?: string }>; className: string }
> = {
  video: { label: 'Video', Icon: Video, className: 'bg-rose-100 text-rose-700' },
  document: { label: 'Document', Icon: FileText, className: 'bg-blue-100 text-blue-700' },
  quiz: { label: 'Quiz', Icon: HelpCircle, className: 'bg-violet-100 text-violet-700' },
}

function ItemsCard({
  module,
  onChanged,
}: {
  module: TrainingModuleWithItems
  onChanged: () => void | Promise<void>
}) {
  const items = module.items
  const [reordering, setReordering] = useState(false)

  const move = async (index: number, dir: -1 | 1) => {
    const target = index + dir
    if (target < 0 || target >= items.length) return
    const ids = items.map((i) => i.id)
    ;[ids[index], ids[target]] = [ids[target], ids[index]]
    setReordering(true)
    try {
      await trainingService.reorderItems(module.id, ids)
      await onChanged()
    } catch {
      toast.error('Could not reorder items')
    } finally {
      setReordering(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Video className="h-4 w-4 text-muted-foreground" /> Content
        </CardTitle>
        <CardDescription>
          Videos, documents and quizzes, in the order learners work through them.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
            <Video className="h-8 w-8 opacity-30" /> No content yet. Add your first item below.
          </div>
        ) : (
          <ul className="space-y-2">
            {items.map((item, idx) => (
              <ItemRow
                key={item.id}
                item={item}
                index={idx}
                total={items.length}
                disabled={reordering}
                onMove={(dir) => move(idx, dir)}
                onChanged={onChanged}
              />
            ))}
          </ul>
        )}

        <AddItemPanel moduleId={module.id} onChanged={onChanged} />
      </CardContent>
    </Card>
  )
}

function ItemRow({
  item,
  index,
  total,
  disabled,
  onMove,
  onChanged,
}: {
  item: TrainingItem
  index: number
  total: number
  disabled: boolean
  onMove: (dir: -1 | 1) => void
  onChanged: () => void | Promise<void>
}) {
  const meta = ITEM_META[item.type]
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)

  const toggleRequired = async () => {
    setBusy(true)
    try {
      const res = await fetch(`/api/training/items/${item.id}`, {
        method: 'PATCH',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ required: !item.required }),
      })
      if (!res.ok) throw new Error()
      await onChanged()
    } catch {
      toast.error('Could not update item')
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    setBusy(true)
    try {
      await trainingService.deleteItem(item.id)
      toast.success('Item removed')
      await onChanged()
    } catch {
      toast.error('Could not remove item')
    } finally {
      setBusy(false)
    }
  }

  return (
    <li className="rounded-lg border p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex flex-col items-center gap-0.5 pt-0.5">
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => onMove(-1)}
              disabled={disabled || index === 0}
              aria-label="Move up"
            >
              <ArrowUp className="h-3.5 w-3.5" />
            </Button>
            <span className="text-xs tabular-nums text-muted-foreground">{index + 1}</span>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => onMove(1)}
              disabled={disabled || index === total - 1}
              aria-label="Move down"
            >
              <ArrowDown className="h-3.5 w-3.5" />
            </Button>
          </div>

          <div className={`mt-0.5 shrink-0 rounded-lg p-2 ${meta.className}`}>
            <meta.Icon className="h-4 w-4" />
          </div>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="truncate text-sm font-medium text-foreground">{item.title}</span>
              <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
                {meta.label}
              </Badge>
              {item.required ? (
                <Badge className="bg-primary/10 text-primary hover:bg-primary/10">Required</Badge>
              ) : (
                <Badge variant="outline" className="text-muted-foreground">
                  Optional
                </Badge>
              )}
            </div>
            <ItemSubline item={item} />
            {item.type === 'video' && item.video_url ? (
              <button
                type="button"
                onClick={() => setPreviewOpen((v) => !v)}
                className="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline"
              >
                <Youtube className="h-3.5 w-3.5" /> {previewOpen ? 'Hide preview' : 'Show preview'}
              </button>
            ) : null}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <Button variant="outline" size="sm" onClick={toggleRequired} disabled={busy}>
            {item.required ? 'Make optional' : 'Make required'}
          </Button>
          {confirmDelete ? (
            <>
              <Button variant="destructive" size="sm" onClick={remove} disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Confirm'}
              </Button>
              <Button variant="ghost" size="icon" onClick={() => setConfirmDelete(false)} disabled={busy} aria-label="Cancel">
                <X className="h-4 w-4" />
              </Button>
            </>
          ) : (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setConfirmDelete(true)}
              disabled={busy}
              aria-label="Remove item"
            >
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          )}
        </div>
      </div>

      {item.type === 'video' && item.video_url && previewOpen ? (
        <div className="mt-3">
          <VideoEmbed url={item.video_url} title={item.title} />
        </div>
      ) : null}
    </li>
  )
}

function ItemSubline({ item }: { item: TrainingItem }) {
  if (item.type === 'video') {
    return (
      <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground">
        <span className="capitalize">{item.video_provider ?? detectVideoProvider(item.video_url ?? '')}</span>
        {item.video_url ? <span className="truncate">· {item.video_url}</span> : null}
      </p>
    )
  }
  if (item.type === 'document') {
    return (
      <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
        <Link2 className="h-3 w-3" /> Linked document
      </p>
    )
  }
  return (
    <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
      <HelpCircle className="h-3 w-3" /> Linked quiz
    </p>
  )
}

/* ============================= add-item panel ============================= */

type DocMode = 'upload' | 'existing'

function AddItemPanel({
  moduleId,
  onChanged,
}: {
  moduleId: string
  onChanged: () => void | Promise<void>
}) {
  const [type, setType] = useState<TrainingItemType>('video')
  const [title, setTitle] = useState('')
  const [required, setRequired] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  // video
  const [videoUrl, setVideoUrl] = useState('')

  // document
  const [docMode, setDocMode] = useState<DocMode>('upload')
  const [file, setFile] = useState<File | null>(null)
  const [existingDocId, setExistingDocId] = useState('')

  // quiz
  const [quizId, setQuizId] = useState('')

  const provider: VideoProvider | null = videoUrl.trim() ? detectVideoProvider(videoUrl.trim()) : null

  const reset = () => {
    setTitle('')
    setVideoUrl('')
    setFile(null)
    setExistingDocId('')
    setQuizId('')
    setRequired(true)
  }

  // Upload a file as a brand-new published document, return its id.
  const uploadDocument = async (docTitle: string): Promise<string> => {
    // 1. Create the document row.
    const createRes = await fetch('/api/documents', {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ title: docTitle }),
    })
    if (!createRes.ok) throw new Error('Failed to create document')
    const { document } = await createRes.json()
    const docId = document.id as string

    // 2. Upload the file as version 1.
    const fd = new FormData()
    fd.append('file', file as File)
    fd.append('changelog', 'Initial version (uploaded from training)')
    const verRes = await fetch(`/api/documents/${docId}/versions`, {
      method: 'POST',
      headers: authHeaders(),
      body: fd,
    })
    if (!verRes.ok) throw new Error('Failed to upload file')

    // 3. Publish so it is also usable in the document library.
    await fetch(`/api/documents/${docId}`, {
      method: 'PUT',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ is_published: true }),
    })

    return docId
  }

  const submit = async () => {
    if (!title.trim()) {
      toast.error('Give this item a title')
      return
    }
    if (type === 'video' && !videoUrl.trim()) {
      toast.error('Paste a video URL')
      return
    }
    if (type === 'document' && docMode === 'upload' && !file) {
      toast.error('Choose a file to upload')
      return
    }
    if (type === 'document' && docMode === 'existing' && !existingDocId) {
      toast.error('Pick a document to link')
      return
    }
    if (type === 'quiz' && !quizId) {
      toast.error('Pick a quiz to link')
      return
    }

    setSubmitting(true)
    try {
      let documentId: string | null = null
      if (type === 'document') {
        documentId = docMode === 'upload' ? await uploadDocument(title.trim()) : existingDocId
      }
      await trainingService.addItem(moduleId, {
        type,
        title: title.trim(),
        video_url: type === 'video' ? videoUrl.trim() : null,
        document_id: type === 'document' ? documentId : null,
        quiz_id: type === 'quiz' ? quizId : null,
        required,
      })
      toast.success('Item added')
      reset()
      await onChanged()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not add item')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-4 rounded-lg border border-dashed p-4">
      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
        <Plus className="h-4 w-4 text-muted-foreground" /> Add content
      </div>

      {/* Type picker */}
      <div className="grid grid-cols-3 gap-2">
        {(Object.keys(ITEM_META) as TrainingItemType[]).map((t) => {
          const m = ITEM_META[t]
          const active = type === t
          return (
            <button
              key={t}
              type="button"
              onClick={() => setType(t)}
              className={`flex items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors ${
                active
                  ? 'border-primary bg-primary/5 font-medium text-foreground'
                  : 'border-input text-muted-foreground hover:bg-muted/50'
              }`}
            >
              <m.Icon className="h-4 w-4" /> {m.label}
            </button>
          )
        })}
      </div>

      {/* Title */}
      <div className="space-y-1.5">
        <Label className="text-sm">
          Title<span className="ml-0.5 text-destructive">*</span>
        </Label>
        <Input
          placeholder={
            type === 'video'
              ? 'e.g. Welcome from our CEO'
              : type === 'document'
                ? 'e.g. Code of Conduct'
                : 'e.g. Induction knowledge check'
          }
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>

      {/* Type-specific body */}
      {type === 'video' ? (
        <VideoFields url={videoUrl} setUrl={setVideoUrl} provider={provider} title={title} />
      ) : type === 'document' ? (
        <DocumentFields
          mode={docMode}
          setMode={setDocMode}
          file={file}
          setFile={setFile}
          existingDocId={existingDocId}
          setExistingDocId={setExistingDocId}
        />
      ) : (
        <QuizFields quizId={quizId} setQuizId={setQuizId} />
      )}

      {/* Required + submit */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            className="size-4 rounded border-input accent-primary"
            checked={required}
            onChange={(e) => setRequired(e.target.checked)}
          />
          Required for completion
        </label>
        <Button onClick={submit} disabled={submitting}>
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Adding…
            </>
          ) : (
            <>
              <Plus className="h-4 w-4" /> Add item
            </>
          )}
        </Button>
      </div>
    </div>
  )
}

function VideoFields({
  url,
  setUrl,
  provider,
  title,
}: {
  url: string
  setUrl: (v: string) => void
  provider: VideoProvider | null
  title: string
}) {
  const providerMeta: Record<VideoProvider, { label: string; className: string }> = {
    youtube: { label: 'YouTube', className: 'bg-rose-100 text-rose-700 hover:bg-rose-100' },
    vimeo: { label: 'Vimeo', className: 'bg-sky-100 text-sky-700 hover:bg-sky-100' },
    other: { label: 'Other / direct link', className: 'bg-muted text-muted-foreground hover:bg-muted' },
  }

  return (
    <div className="space-y-2">
      <Label className="text-sm">
        Video URL<span className="ml-0.5 text-destructive">*</span>
      </Label>
      <Input
        placeholder="Paste a YouTube, Vimeo or direct video URL"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
      />
      {provider ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          Detected: <Badge className={providerMeta[provider].className}>{providerMeta[provider].label}</Badge>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          We detect the provider automatically and show a preview below.
        </p>
      )}
      {url.trim() ? (
        <div className="mt-1">
          <p className="mb-1.5 text-xs font-medium text-muted-foreground">Live preview</p>
          <VideoEmbed url={url.trim()} title={title || 'Training video'} />
        </div>
      ) : null}
    </div>
  )
}

function DocumentFields({
  mode,
  setMode,
  file,
  setFile,
  existingDocId,
  setExistingDocId,
}: {
  mode: DocMode
  setMode: (m: DocMode) => void
  file: File | null
  setFile: (f: File | null) => void
  existingDocId: string
  setExistingDocId: (id: string) => void
}) {
  const [docs, setDocs] = useState<DocOption[] | null>(null)
  const [loadingDocs, setLoadingDocs] = useState(false)

  const loadDocs = useCallback(async () => {
    if (docs || loadingDocs) return
    setLoadingDocs(true)
    try {
      const res = await fetch('/api/documents?manage=true', { headers: authHeaders() })
      if (!res.ok) throw new Error()
      const data = await res.json()
      setDocs(
        (data.documents ?? []).map((d: Record<string, unknown>) => ({
          id: d.id as string,
          title: (d.title as string) ?? 'Untitled',
          category_name: (d.category_name as string | null) ?? null,
        }))
      )
    } catch {
      setDocs([])
      toast.error('Could not load documents')
    } finally {
      setLoadingDocs(false)
    }
  }, [docs, loadingDocs])

  useEffect(() => {
    if (mode === 'existing') void loadDocs()
  }, [mode, loadDocs])

  return (
    <div className="space-y-3">
      {/* Mode toggle */}
      <div className="inline-flex rounded-md border p-0.5 text-sm">
        <button
          type="button"
          onClick={() => setMode('upload')}
          className={`inline-flex items-center gap-1.5 rounded px-3 py-1.5 transition-colors ${
            mode === 'upload' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Upload className="h-4 w-4" /> Upload a file
        </button>
        <button
          type="button"
          onClick={() => setMode('existing')}
          className={`inline-flex items-center gap-1.5 rounded px-3 py-1.5 transition-colors ${
            mode === 'existing' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Link2 className="h-4 w-4" /> Link existing
        </button>
      </div>

      {mode === 'upload' ? (
        <div className="space-y-1.5">
          <Label className="text-sm">
            File<span className="ml-0.5 text-destructive">*</span>
          </Label>
          <Input
            type="file"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="cursor-pointer file:mr-3 file:rounded file:border-0 file:bg-muted file:px-3 file:py-1 file:text-sm"
          />
          {file ? (
            <p className="text-xs text-muted-foreground">
              {file.name} · {(file.size / 1024).toFixed(0)} KB
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              The file becomes a new published document and is linked to this item.
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-1.5">
          <Label className="text-sm">
            Document<span className="ml-0.5 text-destructive">*</span>
          </Label>
          {loadingDocs ? (
            <div className="flex h-9 items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading documents…
            </div>
          ) : docs && docs.length > 0 ? (
            <Select value={existingDocId} onValueChange={setExistingDocId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Choose a document…" />
              </SelectTrigger>
              <SelectContent>
                {docs.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.title}
                    {d.category_name ? ` · ${d.category_name}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <p className="text-sm text-muted-foreground">
              No documents found. Switch to “Upload a file” to add one.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function QuizFields({ quizId, setQuizId }: { quizId: string; setQuizId: (id: string) => void }) {
  const [quizzes, setQuizzes] = useState<QuizOption[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [moduleOff, setModuleOff] = useState(false)

  useEffect(() => {
    let active = true
    setLoading(true)
    fetch('/api/quizzes', { headers: authHeaders() })
      .then(async (res) => {
        if (!active) return
        if (res.status === 403) {
          setModuleOff(true)
          setQuizzes([])
          return
        }
        if (!res.ok) {
          setQuizzes([])
          return
        }
        const data = await res.json()
        setQuizzes(
          (data.quizzes ?? []).map((q: Record<string, unknown>) => ({
            id: q.id as string,
            title: (q.title as string) ?? 'Untitled quiz',
            status: (q.status as string) ?? 'draft',
          }))
        )
      })
      .catch(() => {
        if (active) setQuizzes([])
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  return (
    <div className="space-y-1.5">
      <Label className="text-sm">
        Quiz<span className="ml-0.5 text-destructive">*</span>
      </Label>
      {loading ? (
        <div className="flex h-9 items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading quizzes…
        </div>
      ) : moduleOff ? (
        <p className="text-sm text-muted-foreground">
          The quizzes module isn’t enabled for your organisation.
        </p>
      ) : quizzes && quizzes.length > 0 ? (
        <Select value={quizId} onValueChange={setQuizId}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Choose a quiz…" />
          </SelectTrigger>
          <SelectContent>
            {quizzes.map((q) => (
              <SelectItem key={q.id} value={q.id}>
                {q.title}
                {q.status !== 'published' ? ` · ${q.status}` : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <p className="text-sm text-muted-foreground">
          No quizzes yet. Create one in the quiz builder first.
        </p>
      )}
    </div>
  )
}

/* ============================== assign card ============================== */

const TARGET_META: Record<TrainingTargetType, { label: string; help: string }> = {
  role: { label: 'Role', help: 'Everyone with a role' },
  org_unit: { label: 'Department', help: 'Everyone in a department' },
  group: { label: 'Group', help: 'A custom training group' },
  user: { label: 'Individual', help: 'A single person' },
}

function AssignCard({
  moduleId,
  assignments,
  assignees,
  onChanged,
}: {
  moduleId: string
  assignments: TrainingAssignment[]
  assignees: Assignee[]
  onChanged: () => void | Promise<void>
}) {
  // Tenant data for the value pickers (loaded once).
  const [people, setPeople] = useState<PersonOption[] | null>(null)
  const [groups, setGroups] = useState<TrainingGroup[] | null>(null)

  const [targetType, setTargetType] = useState<TrainingTargetType>('role')
  const [targetValue, setTargetValue] = useState('')
  const [adding, setAdding] = useState(false)

  useEffect(() => {
    let active = true
    void (async () => {
      try {
        const [peopleRes, groupsRes] = await Promise.all([
          fetch('/api/people', { headers: authHeaders() }),
          fetch('/api/training/groups', { headers: authHeaders() }),
        ])
        if (!active) return
        if (peopleRes.ok) {
          const data = await peopleRes.json()
          setPeople(
            (data.people ?? []).map((p: Record<string, unknown>) => ({
              id: p.id as string,
              name: (p.name as string) ?? '(unnamed)',
              orgUnit: (p.orgUnit as string | null) ?? null,
              role: (p.role as UserRole) ?? 'employee',
            }))
          )
        } else {
          setPeople([])
        }
        if (groupsRes.ok) {
          const data = await groupsRes.json()
          setGroups((data.groups ?? []) as TrainingGroup[])
        } else {
          setGroups([])
        }
      } catch {
        if (active) {
          setPeople([])
          setGroups([])
        }
      }
    })()
    return () => {
      active = false
    }
  }, [])

  // Distinct departments derived from people (org_unit).
  const departments = useMemo(() => {
    const set = new Set<string>()
    for (const p of people ?? []) if (p.orgUnit) set.add(p.orgUnit)
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [people])

  // Reset the value when the target type changes (different option space).
  useEffect(() => {
    setTargetValue('')
  }, [targetType])

  const add = async () => {
    if (!targetValue) {
      toast.error('Pick who to assign')
      return
    }
    setAdding(true)
    try {
      await trainingService.createAssignment(moduleId, {
        target_type: targetType,
        target_value: targetValue,
      })
      toast.success('Assignment added')
      setTargetValue('')
      await onChanged()
    } catch {
      toast.error('Could not add assignment')
    } finally {
      setAdding(false)
    }
  }

  const remove = async (assignmentId: string) => {
    try {
      await trainingService.deleteAssignment(moduleId, assignmentId)
      toast.success('Assignment removed')
      await onChanged()
    } catch {
      toast.error('Could not remove assignment')
    }
  }

  // Pretty label for an assignment rule.
  const ruleLabel = (a: TrainingAssignment): string => {
    if (a.target_type === 'role') return roleManageLabel(a.target_value as UserRole)
    if (a.target_type === 'group') {
      return (groups ?? []).find((g) => g.id === a.target_value)?.name ?? 'Group'
    }
    if (a.target_type === 'user') {
      return (people ?? []).find((p) => p.id === a.target_value)?.name ?? 'Person'
    }
    return a.target_value // org_unit is a plain department name
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="h-4 w-4 text-muted-foreground" /> Assign
        </CardTitle>
        <CardDescription>
          Choose who this module is for. People who match any rule will see it.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Current rules */}
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Assignment rules
          </p>
          {assignments.length === 0 ? (
            <p className="rounded-lg border border-dashed px-3 py-4 text-sm text-muted-foreground">
              Not assigned to anyone yet.
            </p>
          ) : (
            <ul className="space-y-2">
              {assignments.map((a) => (
                <li
                  key={a.id}
                  className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <Badge variant="outline">{TARGET_META[a.target_type].label}</Badge>
                    <span className="truncate text-foreground">{ruleLabel(a)}</span>
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => remove(a.id)}
                    aria-label="Remove assignment"
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Add rule */}
        <div className="space-y-3 rounded-lg border border-dashed p-4">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <UserPlus className="h-4 w-4 text-muted-foreground" /> Add an assignment
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-sm">Assign to</Label>
              <Select value={targetType} onValueChange={(v) => setTargetType(v as TrainingTargetType)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(TARGET_META) as TrainingTargetType[]).map((t) => (
                    <SelectItem key={t} value={t}>
                      {TARGET_META[t].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">{TARGET_META[targetType].help}</Label>
              <TargetValueSelect
                targetType={targetType}
                value={targetValue}
                onChange={setTargetValue}
                departments={departments}
                groups={groups}
                people={people}
              />
            </div>
          </div>
          <div className="flex justify-end">
            <Button onClick={add} disabled={adding || !targetValue}>
              {adding ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Assigning…
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4" /> Assign
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Resolved assignees */}
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Currently assigned ({assignees.length})
          </p>
          {assignees.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No one resolves into this module yet.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {assignees.map((a) => (
                <span
                  key={a.employee_id}
                  className="inline-flex items-center gap-1.5 rounded-full border bg-muted/40 px-3 py-1 text-xs text-foreground"
                >
                  <span className="font-medium">{a.full_name ?? 'Unnamed'}</span>
                  {a.department ? <span className="text-muted-foreground">· {a.department}</span> : null}
                </span>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function TargetValueSelect({
  targetType,
  value,
  onChange,
  departments,
  groups,
  people,
}: {
  targetType: TrainingTargetType
  value: string
  onChange: (v: string) => void
  departments: string[]
  groups: TrainingGroup[] | null
  people: PersonOption[] | null
}) {
  if (targetType === 'role') {
    return (
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Choose a role…" />
        </SelectTrigger>
        <SelectContent>
          {USER_ROLES.map((r) => (
            <SelectItem key={r} value={r}>
              {roleManageLabel(r)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    )
  }

  if (targetType === 'org_unit') {
    if (!people) {
      return <LoadingSelect />
    }
    if (departments.length === 0) {
      return <p className="text-sm text-muted-foreground">No departments found on your people.</p>
    }
    return (
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Choose a department…" />
        </SelectTrigger>
        <SelectContent>
          {departments.map((d) => (
            <SelectItem key={d} value={d}>
              {d}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    )
  }

  if (targetType === 'group') {
    if (!groups) {
      return <LoadingSelect />
    }
    if (groups.length === 0) {
      return <p className="text-sm text-muted-foreground">No training groups yet.</p>
    }
    return (
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Choose a group…" />
        </SelectTrigger>
        <SelectContent>
          {groups.map((g) => (
            <SelectItem key={g.id} value={g.id}>
              {g.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    )
  }

  // user
  if (!people) {
    return <LoadingSelect />
  }
  if (people.length === 0) {
    return <p className="text-sm text-muted-foreground">No people found.</p>
  }
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-full">
        <SelectValue placeholder="Choose a person…" />
      </SelectTrigger>
      <SelectContent>
        {people.map((p) => (
          <SelectItem key={p.id} value={p.id}>
            {p.name}
            {p.orgUnit ? ` · ${p.orgUnit}` : ''}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function LoadingSelect() {
  return (
    <div className="flex h-9 items-center gap-2 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" /> Loading…
    </div>
  )
}
