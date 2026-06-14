// src/app/dashboard/training/manage/page.tsx
//
// Staff/Admin training library: every module with its status, item count and
// assignment summary, plus create / edit / publish / archive / delete. Links to
// the per-module builder. Role-gated (hr+) at the data layer; the nav already
// hides this for volunteers, and a 403 renders a friendly message.
//
// Styling matches the document library + compliance register: max-w-5xl shell,
// Card/Badge/Button/Input primitives, lucide icons, neutral tokens, real
// loading / empty / error / forbidden states. No DashboardLayout, no gradients.

'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/stores/auth'
import { hasMinRole } from '@/types/roles'
import { trainingService } from '@/services/training'
import type { TrainingModule, TrainingModuleStatus } from '@/types/training'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  GraduationCap,
  Plus,
  Layers,
  Users,
  ListChecks,
  CheckCircle2,
  FileEdit,
  Archive,
  Trash2,
  Loader2,
  AlertCircle,
  Ban,
  Search,
  Settings2,
  X,
} from 'lucide-react'
import toast from 'react-hot-toast'

function authHeaders(extra: HeadersInit = {}): HeadersInit {
  const token = typeof window !== 'undefined' ? localStorage.getItem('ess_access_token') : null
  return { ...extra, ...(token ? { Authorization: `Bearer ${token}` } : {}) }
}

/** A module enriched with the counts the list surfaces. */
interface ModuleRow extends TrainingModule {
  itemCount: number
  requiredCount: number
  assignmentCount: number
  assigneeCount: number
}

type State =
  | { kind: 'loading' }
  | { kind: 'forbidden' }
  | { kind: 'error' }
  | { kind: 'ok'; rows: ModuleRow[] }

const STATUS_META: Record<
  TrainingModuleStatus,
  { label: string; className: string }
> = {
  published: { label: 'Published', className: 'bg-green-100 text-green-800 hover:bg-green-100' },
  draft: { label: 'Draft', className: 'bg-amber-100 text-amber-800 hover:bg-amber-100' },
  archived: { label: 'Archived', className: 'bg-muted text-muted-foreground hover:bg-muted' },
}

export default function ManageTrainingPage() {
  const router = useRouter()
  const { user, isAuthenticated, checkAuth } = useAuthStore()

  useEffect(() => {
    checkAuth()
  }, [checkAuth])

  const [state, setState] = useState<State>({ kind: 'loading' })
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<TrainingModuleStatus | 'all'>('all')

  const load = useCallback(async () => {
    if (!user || !hasMinRole(user.role, 'hr')) {
      setState({ kind: 'forbidden' })
      return
    }
    try {
      const res = await fetch('/api/training/modules?manage=true', { headers: authHeaders() })
      if (res.status === 403) {
        setState({ kind: 'forbidden' })
        return
      }
      if (!res.ok) {
        setState({ kind: 'error' })
        return
      }
      const data = await res.json()
      const modules = (data.modules ?? []) as TrainingModule[]

      // Enrich each module with item + assignment counts. Modules per tenant are
      // few; fetch detail/assignments in parallel for an accurate summary.
      const rows = await Promise.all(
        modules.map(async (m): Promise<ModuleRow> => {
          const [mod, assn] = await Promise.all([
            trainingService.getModule(m.id),
            trainingService.getAssignments(m.id),
          ])
          const items = mod?.items ?? []
          return {
            ...m,
            itemCount: items.length,
            requiredCount: items.filter((i) => i.required).length,
            assignmentCount: assn.assignments.length,
            assigneeCount: assn.assignees.length,
          }
        })
      )
      setState({ kind: 'ok', rows })
    } catch {
      setState({ kind: 'error' })
    }
  }, [user])

  useEffect(() => {
    if (isAuthenticated && user) void load()
  }, [isAuthenticated, user, load])

  const counts = useMemo(() => {
    if (state.kind !== 'ok') return { total: 0, published: 0, draft: 0, archived: 0 }
    return {
      total: state.rows.length,
      published: state.rows.filter((r) => r.status === 'published').length,
      draft: state.rows.filter((r) => r.status === 'draft').length,
      archived: state.rows.filter((r) => r.status === 'archived').length,
    }
  }, [state])

  const filtered = useMemo(() => {
    if (state.kind !== 'ok') return []
    return state.rows.filter((r) => {
      const matchesSearch =
        !search ||
        r.title.toLowerCase().includes(search.toLowerCase()) ||
        (r.description ?? '').toLowerCase().includes(search.toLowerCase())
      const matchesStatus = statusFilter === 'all' || r.status === statusFilter
      return matchesSearch && matchesStatus
    })
  }, [state, search, statusFilter])

  if (!isAuthenticated || !user) {
    return (
      <div className="mx-auto w-full max-w-5xl p-6">
        <Card>
          <CardContent className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Training</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Build modules from videos, documents and quizzes, then assign them to your people.
          </p>
        </div>
        {state.kind === 'ok' ? <CreateModuleDialog onCreated={load} /> : null}
      </div>

      {state.kind === 'forbidden' ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-16 text-center text-sm text-muted-foreground">
            <Ban className="h-10 w-10 opacity-30" /> You do not have access to training management.
          </CardContent>
        </Card>
      ) : state.kind === 'loading' ? (
        <Card>
          <CardContent className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading modules…
          </CardContent>
        </Card>
      ) : state.kind === 'error' ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-16 text-center text-sm text-muted-foreground">
            <AlertCircle className="h-10 w-10 opacity-30" /> Could not load training modules.
            <Button variant="outline" size="sm" className="mt-2" onClick={() => void load()}>
              Try again
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Summary */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <SummaryCard label="Modules" value={counts.total} tone="neutral" Icon={Layers} />
            <SummaryCard label="Published" value={counts.published} tone="green" Icon={CheckCircle2} />
            <SummaryCard label="Drafts" value={counts.draft} tone="amber" Icon={FileEdit} />
            <SummaryCard label="Archived" value={counts.archived} tone="neutral" Icon={Archive} />
          </div>

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative w-full max-w-sm">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search modules…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {(['all', 'published', 'draft', 'archived'] as const).map((s) => (
                <Badge
                  key={s}
                  variant={statusFilter === s ? 'default' : 'outline'}
                  className="cursor-pointer capitalize"
                  onClick={() => setStatusFilter(s)}
                >
                  {s === 'all' ? 'All' : STATUS_META[s].label}
                </Badge>
              ))}
            </div>
          </div>

          {/* List */}
          {filtered.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-2 py-16 text-center text-sm text-muted-foreground">
                <GraduationCap className="h-10 w-10 opacity-30" />
                {state.rows.length === 0
                  ? 'No modules yet. Create your first training module above.'
                  : 'No modules match your filters.'}
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {filtered.map((m) => (
                <ModuleListCard
                  key={m.id}
                  module={m}
                  onOpen={() => router.push(`/dashboard/training/manage/${m.id}`)}
                  onChanged={load}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

/* ============================== list card ============================== */

function ModuleListCard({
  module,
  onOpen,
  onChanged,
}: {
  module: ModuleRow
  onOpen: () => void
  onChanged: () => void | Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const meta = STATUS_META[module.status]

  const run = async (fn: () => Promise<void>, ok: string) => {
    setBusy(true)
    try {
      await fn()
      toast.success(ok)
      await onChanged()
    } catch {
      toast.error('Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="transition-colors hover:border-border">
      <CardContent className="flex flex-col gap-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        {/* Left: title + meta */}
        <button
          type="button"
          onClick={onOpen}
          className="group flex min-w-0 flex-1 items-start gap-3 text-left"
        >
          <div className="shrink-0 rounded-lg bg-primary/10 p-2 text-primary">
            <GraduationCap className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate font-medium text-foreground group-hover:underline">
                {module.title}
              </h3>
              <Badge className={meta.className}>{meta.label}</Badge>
            </div>
            {module.description ? (
              <p className="mt-0.5 line-clamp-1 text-sm text-muted-foreground">{module.description}</p>
            ) : null}
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <ListChecks className="h-3.5 w-3.5" />
                {module.itemCount} item{module.itemCount === 1 ? '' : 's'}
                {module.itemCount > 0 ? ` · ${module.requiredCount} required` : ''}
              </span>
              <span className="inline-flex items-center gap-1">
                <Users className="h-3.5 w-3.5" />
                {module.assignmentCount === 0
                  ? 'Not assigned'
                  : `${module.assigneeCount} ${module.assigneeCount === 1 ? 'person' : 'people'} · ${module.assignmentCount} rule${module.assignmentCount === 1 ? '' : 's'}`}
              </span>
            </div>
          </div>
        </button>

        {/* Right: actions */}
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={onOpen} disabled={busy}>
            <Settings2 className="h-4 w-4" /> Manage
          </Button>
          {module.status !== 'published' ? (
            <Button
              size="sm"
              onClick={() => run(() => trainingService.publishModule(module.id), 'Module published')}
              disabled={busy}
            >
              <CheckCircle2 className="h-4 w-4" /> Publish
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                run(() => trainingService.updateModule(module.id, { status: 'draft' }).then(() => {}), 'Moved to draft')
              }
              disabled={busy}
            >
              <FileEdit className="h-4 w-4" /> Unpublish
            </Button>
          )}
          {module.status !== 'archived' ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => run(() => trainingService.archiveModule(module.id), 'Module archived')}
              disabled={busy}
            >
              <Archive className="h-4 w-4" />
            </Button>
          ) : null}
          {confirmingDelete ? (
            <span className="inline-flex items-center gap-1">
              <Button
                variant="destructive"
                size="sm"
                onClick={() => run(() => trainingService.deleteModule(module.id), 'Module deleted')}
                disabled={busy}
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Confirm delete'}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setConfirmingDelete(false)} disabled={busy}>
                <X className="h-4 w-4" />
              </Button>
            </span>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setConfirmingDelete(true)}
              disabled={busy}
              aria-label="Delete module"
            >
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

/* ============================ create dialog ============================ */

function CreateModuleDialog({ onCreated }: { onCreated: () => void | Promise<void> }) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [creating, setCreating] = useState(false)

  const create = async () => {
    if (!title.trim()) {
      toast.error('Module title is required')
      return
    }
    setCreating(true)
    try {
      await trainingService.createModule({
        title: title.trim(),
        description: description.trim() || null,
      })
      toast.success('Module created')
      setTitle('')
      setDescription('')
      setOpen(false)
      await onCreated()
    } catch {
      toast.error('Failed to create module')
    } finally {
      setCreating(false)
    }
  }

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" /> New module
      </Button>
    )
  }

  return (
    <Card className="w-full">
      <CardContent className="space-y-4 py-5">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
            <Plus className="h-4 w-4 text-muted-foreground" /> New module
          </h2>
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)} aria-label="Close">
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="space-y-1.5">
          <Label className="text-sm">
            Title<span className="ml-0.5 text-destructive">*</span>
          </Label>
          <Input
            placeholder="e.g. Volunteer Induction"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            autoFocus
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-sm">Description</Label>
          <Textarea
            placeholder="What this module covers (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
          />
        </div>
        <div className="flex items-center justify-end gap-2">
          <Button variant="outline" onClick={() => setOpen(false)} disabled={creating}>
            Cancel
          </Button>
          <Button onClick={create} disabled={creating || !title.trim()}>
            {creating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Creating…
              </>
            ) : (
              'Create module'
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

/* =============================== summary =============================== */

function SummaryCard({
  label,
  value,
  tone,
  Icon,
}: {
  label: string
  value: number
  tone: 'neutral' | 'amber' | 'green'
  Icon: React.ComponentType<{ className?: string }>
}) {
  const toneClass =
    tone === 'amber'
      ? 'bg-amber-100 text-amber-600'
      : tone === 'green'
        ? 'bg-green-100 text-green-600'
        : 'bg-muted text-muted-foreground'
  return (
    <Card>
      <CardContent className="flex items-center gap-3 py-4">
        <div className={`rounded-lg p-2 ${toneClass}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <div className="text-2xl font-semibold text-foreground">{value}</div>
          <div className="text-xs text-muted-foreground">{label}</div>
        </div>
      </CardContent>
    </Card>
  )
}
