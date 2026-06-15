'use client'

// Phase 7 — message template management surface.
//
// CRUD over /api/templates (GET list, POST create) and /api/templates/[id] (DELETE).
// There is intentionally NO server PATCH route (the published contract is create +
// delete only), so "edit" is implemented as create-the-new-then-delete-the-old. That
// keeps templates editable from the UI without touching server contracts; if the
// recreate succeeds we remove the previous row, so a failed save never loses data.
//
// Storage note: the composer round-trips MARKDOWN, while the template schema field is
// `body_html` (a plain text column). We store the markdown *source* in that field and
// load it straight back into the markdown editor — matching the pre-existing compose
// behaviour. No unsafe HTML is ever rendered here; previews use mdToHtml.
//
// Rendered two ways:
//   • <TemplateManager/> — full management panel (list + create/edit/delete).
//   • <TemplatePicker/>   — compact "apply a template" selector for the composer,
//     plus a "Save current as template" action.

import { useCallback, useEffect, useState } from 'react'
import {
  FileText, Plus, Pencil, Trash2, Loader2, AlertCircle, Check, X, Save,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { apiGet, apiSend } from '@/services/phase7-client'
import { mdToHtml } from '@/lib/communications/markdown'

export interface Template {
  id: string
  name: string
  subject: string
  /** Markdown source for the body (see storage note above). */
  body_html: string
  created_at?: string
}

interface TemplateDraft {
  name: string
  subject: string
  body: string
}

/** Shared loader hook so the picker and the manager stay in sync within a mount. */
function useTemplates() {
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(false)
    try {
      const rows = await apiGet<Template[]>('/api/templates')
      setTemplates(rows)
    } catch {
      setError(true)
      setTemplates([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  return { templates, setTemplates, loading, error, reload: load }
}

/* ============================================================= compact picker === */

/**
 * Composer companion: pick a template to apply, and save the current draft as a new
 * template. Apply hands the parent the template's subject + markdown body.
 */
export function TemplatePicker({
  onApply,
  current,
}: {
  onApply: (subject: string, bodyMarkdown: string) => void
  current: { subject: string; body: string }
}) {
  const { templates, loading, reload } = useTemplates()
  const [saveOpen, setSaveOpen] = useState(false)
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)

  const apply = (id: string) => {
    const tpl = templates.find((t) => t.id === id)
    if (!tpl) return
    onApply(tpl.subject, tpl.body_html)
    toast.success(`Applied “${tpl.name}”`)
  }

  const save = async () => {
    const trimmed = name.trim()
    if (!trimmed) return toast.error('Give the template a name')
    if (!current.subject.trim() || !current.body.trim()) {
      return toast.error('Add a subject and body before saving a template')
    }
    setSaving(true)
    try {
      await apiSend<Template>('/api/templates', 'POST', {
        name: trimmed,
        subject: current.subject.trim(),
        body_html: current.body, // markdown source (see storage note)
      })
      toast.success('Saved as template')
      setName('')
      setSaveOpen(false)
      await reload()
    } catch {
      toast.error('Could not save template')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[12rem] flex-1 space-y-1.5">
          <Label className="text-sm">Start from a template</Label>
          <Select onValueChange={apply} disabled={loading || templates.length === 0}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder={
                loading ? 'Loading templates…' : templates.length === 0 ? 'No templates yet' : 'Choose a template'
              } />
            </SelectTrigger>
            <SelectContent>
              {templates.map((t) => (
                <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button type="button" variant="outline" onClick={() => setSaveOpen((s) => !s)}>
          <Save className="h-4 w-4" /> Save as template
        </Button>
      </div>

      {saveOpen ? (
        <div className="flex flex-wrap items-end gap-2 rounded-md border bg-muted/30 p-3">
          <div className="min-w-[12rem] flex-1 space-y-1.5">
            <Label className="text-sm">Template name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Monthly newsletter" />
          </div>
          <div className="flex gap-2">
            <Button type="button" onClick={save} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Save
            </Button>
            <Button type="button" variant="ghost" onClick={() => { setSaveOpen(false); setName('') }} disabled={saving}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

/* ============================================================= full manager ===== */

/** Full template management panel — list, create, edit (recreate), delete. */
export function TemplateManager() {
  const { templates, loading, error, reload } = useTemplates()
  const [editing, setEditing] = useState<Template | null>(null)
  const [creating, setCreating] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  const remove = async (tpl: Template) => {
    setBusyId(tpl.id)
    try {
      await apiSend(`/api/templates/${tpl.id}`, 'DELETE')
      toast.success('Template deleted')
      await reload()
    } catch {
      toast.error('Could not delete template')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
            <FileText className="h-4 w-4 text-muted-foreground" /> Templates
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">Reusable subjects and bodies for your announcements.</p>
        </div>
        <Button type="button" size="sm" onClick={() => { setCreating(true); setEditing(null) }}>
          <Plus className="h-4 w-4" /> New template
        </Button>
      </div>

      {creating ? (
        <TemplateEditor
          initial={null}
          onCancel={() => setCreating(false)}
          onSaved={async () => { setCreating(false); await reload() }}
        />
      ) : null}

      {loading ? (
        <Card><CardContent className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading templates…
        </CardContent></Card>
      ) : error ? (
        <Card><CardContent className="flex flex-col items-center gap-2 py-12 text-center text-sm text-muted-foreground">
          <AlertCircle className="h-8 w-8 text-destructive/50" /> We couldn’t load templates.
          <Button variant="outline" size="sm" onClick={() => void reload()}>Try again</Button>
        </CardContent></Card>
      ) : templates.length === 0 && !creating ? (
        <Card><CardContent className="flex flex-col items-center gap-2 py-12 text-center text-sm text-muted-foreground">
          <FileText className="h-8 w-8 opacity-30" />
          <p className="font-medium text-foreground">No templates yet</p>
          <p>Create one to reuse it when composing.</p>
        </CardContent></Card>
      ) : (
        <Card className="overflow-hidden py-0">
          <ul className="divide-y">
            {templates.map((t) => (
              editing?.id === t.id ? (
                <li key={t.id} className="p-3">
                  <TemplateEditor
                    initial={t}
                    onCancel={() => setEditing(null)}
                    onSaved={async () => { setEditing(null); await reload() }}
                  />
                </li>
              ) : (
                <li key={t.id} className="flex items-center gap-3 px-4 py-3.5">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center text-muted-foreground" aria-hidden>
                    <FileText className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground">{t.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">{t.subject || '(no subject)'}</span>
                  </span>
                  <div className="flex shrink-0 gap-1">
                    <Button type="button" variant="ghost" size="sm" onClick={() => { setEditing(t); setCreating(false) }} aria-label={`Edit ${t.name}`}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button type="button" variant="ghost" size="sm" onClick={() => void remove(t)} disabled={busyId === t.id} aria-label={`Delete ${t.name}`}>
                      {busyId === t.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4 text-destructive" />}
                    </Button>
                  </div>
                </li>
              )
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}

/** Create / edit form. On edit, recreates then deletes the old row (no PATCH route). */
function TemplateEditor({
  initial, onCancel, onSaved,
}: {
  initial: Template | null
  onCancel: () => void
  onSaved: () => void | Promise<void>
}) {
  const [draft, setDraft] = useState<TemplateDraft>({
    name: initial?.name ?? '',
    subject: initial?.subject ?? '',
    body: initial?.body_html ?? '',
  })
  const [saving, setSaving] = useState(false)

  const save = async () => {
    const name = draft.name.trim()
    const subject = draft.subject.trim()
    const body = draft.body
    if (!name) return toast.error('Give the template a name')
    if (!subject) return toast.error('Add a subject')
    if (!body.trim()) return toast.error('Add a body')
    setSaving(true)
    try {
      // Create the new row first; only remove the old once the new one exists.
      await apiSend<Template>('/api/templates', 'POST', { name, subject, body_html: body })
      if (initial) {
        try {
          await apiSend(`/api/templates/${initial.id}`, 'DELETE')
        } catch {
          // New version saved but old not removed — warn rather than fail.
          toast('Saved a new copy; the previous version remains.', { icon: '⚠️' })
        }
      }
      toast.success(initial ? 'Template updated' : 'Template created')
      await onSaved()
    } catch {
      toast.error('Could not save template')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-3 rounded-md border bg-muted/20 p-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label className="text-sm">Name</Label>
          <Input value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} placeholder="Template name" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-sm">Subject</Label>
          <Input value={draft.subject} onChange={(e) => setDraft((d) => ({ ...d, subject: e.target.value }))} placeholder="Subject line" />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label className="text-sm">Body (Markdown)</Label>
        <Textarea
          value={draft.body}
          onChange={(e) => setDraft((d) => ({ ...d, body: e.target.value }))}
          className="min-h-28 font-mono text-sm"
          placeholder="**Bold**, _italic_, lists, [links](https://…)"
        />
        {draft.body.trim() ? (
          <div
            className="prose prose-sm mt-1 max-w-none rounded-md border bg-background px-3 py-2 text-sm text-foreground prose-headings:text-foreground prose-a:text-primary"
            // mdToHtml emits only whitelisted, escaped tags (no unsafe HTML).
            dangerouslySetInnerHTML={{ __html: mdToHtml(draft.body) }}
          />
        ) : null}
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={saving}>
          <X className="h-4 w-4" /> Cancel
        </Button>
        <Button type="button" onClick={save} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} {initial ? 'Save changes' : 'Create'}
        </Button>
      </div>
    </div>
  )
}
