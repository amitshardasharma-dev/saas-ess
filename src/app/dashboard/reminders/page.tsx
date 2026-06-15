'use client'

// /dashboard/reminders — Expiry reminder management (Admin / Staff).
//
// A world-class reminder console for certification expiry notices:
//   • Full CRUD on reminder configs — create, EDIT, activate/deactivate, delete.
//   • Friendly timing chips (90/30/7 days before · on expiry · after) with add/remove.
//   • Customisable email subject + body with token help and a LIVE PREVIEW.
//   • Escalation (supervisor / admin) exposed clearly for the overdue path.
//   • "Run scan now" — enqueues a scan; the cron drains it on the next 5-min tick.
//   • A sends log (ess_reminder_sends) so admins can see reminders going out.
//
// Gate: hr+ view (so Staff can confirm it's working); config mutations are admin-only
// (matches the admin-gated /api/reminders routes). Volunteers get a tidy 403.
// Styling matches the documents/profile surfaces: max-w-5xl shell, Card/Button/Badge
// primitives, lucide icons, neutral tokens, real loading/empty/error states. No
// DashboardLayout, no gradients.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuthStore } from '@/stores/auth'
import { hasMinRole } from '@/types/roles'
import { apiGet, apiSend } from '@/services/phase7-client'
import type {
  ReminderConfig,
  ReminderConfigInput,
  ReminderEscalateTo,
  ReminderFrequency,
} from '@/types/reminders'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import {
  BellRing,
  Plus,
  Pencil,
  Trash2,
  Play,
  Eye,
  Clock,
  ArrowUpRight,
  Ban,
  AlertCircle,
  Loader2,
  Mail,
  History,
  X,
  Power,
  CheckCircle2,
  CalendarClock,
  Send,
} from 'lucide-react'
import toast from 'react-hot-toast'

/* --------------------------------- types ---------------------------------- */

interface SendLogRow {
  id: string
  certification_id: string | null
  employee_id: string
  offset_sent: number
  sent_at: string
  recipient_name: string | null
  cert_name: string | null
}

type Draft = {
  applies_to: 'certification' | 'contract' | 'custom'
  offsets: number[]
  frequency: ReminderFrequency
  email_subject: string
  email_body_html: string
  escalate_to: ReminderEscalateTo
  is_active: boolean
}

const DEFAULT_DRAFT: Draft = {
  applies_to: 'certification',
  offsets: [90, 30, 7, 0, -7],
  frequency: 'once',
  email_subject: 'Your {{cert_name}} expires in {{days}} days',
  email_body_html:
    '<p>Hi {{name}},</p>\n<p>Your <strong>{{cert_name}}</strong> expires on {{expiry}} ({{days}} days from now).</p>\n<p>Please renew it before it lapses.</p>',
  escalate_to: 'supervisor',
  is_active: true,
}

const FREQUENCY_LABELS: Record<ReminderFrequency, string> = {
  once: 'Once per offset',
  weekly: 'Weekly while overdue',
  daily_overdue: 'Daily while overdue',
}

const FREQUENCY_HELP: Record<ReminderFrequency, string> = {
  once: 'Each offset below sends exactly one reminder.',
  weekly: 'Before-expiry offsets send once; once overdue, a reminder repeats every 7 days.',
  daily_overdue: 'Before-expiry offsets send once; once overdue, a reminder repeats every day.',
}

const ESCALATE_LABELS: Record<ReminderEscalateTo, string> = {
  none: 'No one',
  supervisor: 'Supervisor',
  admin: 'An admin',
}

const TOKENS: { token: string; desc: string }[] = [
  { token: '{{name}}', desc: 'Volunteer name' },
  { token: '{{cert_name}}', desc: 'Certification name' },
  { token: '{{cert}}', desc: 'Certification name (alias)' },
  { token: '{{days}}', desc: 'Days until expiry (negative = overdue)' },
  { token: '{{expiry}}', desc: 'Expiry date' },
]

/* ------------------------------- offset chips ------------------------------ */

/** Human label for a single offset value. */
function offsetLabel(n: number): string {
  if (n === 0) return 'On expiry'
  if (n > 0) return `${n}d before`
  return `${Math.abs(n)}d after`
}

function offsetTone(n: number): string {
  if (n < 0) return 'text-red-700'
  if (n === 0) return 'text-amber-700'
  return 'text-foreground'
}

/* ----------------------------- preview rendering --------------------------- */

const PREVIEW_VARS: Record<string, string> = {
  name: 'Jordan Smith',
  cert_name: 'First Aid / CPR',
  cert: 'First Aid / CPR',
  days: '30',
  expiry: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
}

function renderPreview(template: string): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, key: string) => PREVIEW_VARS[key] ?? '')
}

/* ----------------------------------- page ---------------------------------- */

export default function RemindersPage() {
  const { user, isAuthenticated, checkAuth } = useAuthStore()
  const [configs, setConfigs] = useState<ReminderConfig[]>([])
  const [sends, setSends] = useState<SendLogRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [running, setRunning] = useState(false)

  // Editor state. `null` = closed; otherwise editing an existing id or creating.
  const [editing, setEditing] = useState<{ id: string | null; draft: Draft } | null>(null)

  useEffect(() => {
    checkAuth()
  }, [checkAuth])

  const isStaff = !!user && hasMinRole(user.role, 'hr')
  const isAdmin = !!user && hasMinRole(user.role, 'admin')

  const load = useCallback(async () => {
    setLoading(true)
    setError(false)
    try {
      // Staff can read the sends log; only admins can read the config list.
      const [cfgRes, sendRes] = await Promise.allSettled([
        isAdmin ? apiGet<ReminderConfig[]>('/api/reminders') : Promise.resolve<ReminderConfig[]>([]),
        apiGet<SendLogRow[]>('/api/reminders/sends?limit=50'),
      ])
      if (cfgRes.status === 'fulfilled') setConfigs(cfgRes.value ?? [])
      if (sendRes.status === 'fulfilled') setSends(sendRes.value ?? [])
      if (cfgRes.status === 'rejected' && sendRes.status === 'rejected') setError(true)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [isAdmin])

  useEffect(() => {
    if (isAuthenticated && user && isStaff) void load()
  }, [isAuthenticated, user, isStaff, load])

  /* ------------------------------- mutations ------------------------------- */

  const runScan = async () => {
    setRunning(true)
    try {
      await apiSend('/api/reminders/run', 'POST')
      toast.success('Scan queued — reminders send on the next cron tick (within ~5 min).')
    } catch {
      toast.error('Could not queue the scan.')
    } finally {
      setRunning(false)
    }
  }

  const saveDraft = async () => {
    if (!editing) return
    const d = editing.draft
    if (d.offsets.length === 0) return toast.error('Add at least one timing offset.')
    if (!d.email_subject.trim()) return toast.error('Email subject is required.')
    if (!d.email_body_html.trim()) return toast.error('Email body is required.')

    const payload: ReminderConfigInput = {
      applies_to: d.applies_to,
      offsets: d.offsets,
      frequency: d.frequency,
      email_subject: d.email_subject,
      email_body_html: d.email_body_html,
      escalate_to: d.escalate_to,
      is_active: d.is_active,
    }
    try {
      if (editing.id) {
        await apiSend(`/api/reminders/${editing.id}`, 'PATCH', payload)
        toast.success('Reminder updated.')
      } else {
        await apiSend('/api/reminders', 'POST', payload)
        toast.success('Reminder created.')
      }
      setEditing(null)
      await load()
    } catch {
      toast.error('Could not save the reminder.')
    }
  }

  const toggleActive = async (cfg: ReminderConfig) => {
    try {
      await apiSend(`/api/reminders/${cfg.id}`, 'PATCH', { is_active: !cfg.is_active })
      toast.success(cfg.is_active ? 'Reminder deactivated.' : 'Reminder activated.')
      await load()
    } catch {
      toast.error('Could not update the reminder.')
    }
  }

  const remove = async (cfg: ReminderConfig) => {
    if (!confirm('Delete this reminder configuration? This cannot be undone.')) return
    try {
      await apiSend(`/api/reminders/${cfg.id}`, 'DELETE')
      toast.success('Reminder deleted.')
      await load()
    } catch {
      toast.error('Could not delete the reminder.')
    }
  }

  /* ------------------------------- gate states ----------------------------- */

  if (!isAuthenticated || !user) {
    return (
      <Shell>
        <Card>
          <CardContent className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </CardContent>
        </Card>
      </Shell>
    )
  }

  if (!isStaff) {
    return (
      <Shell>
        <Header />
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-16 text-center text-sm text-muted-foreground">
            <Ban className="h-10 w-10 opacity-30" />
            You do not have access to expiry reminders.
          </CardContent>
        </Card>
      </Shell>
    )
  }

  /* ---------------------------------- view --------------------------------- */

  return (
    <Shell>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-foreground">
            <BellRing className="h-6 w-6 text-muted-foreground" /> Expiry Reminders
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Automated emails that warn volunteers before — and after — their certifications expire.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={runScan} disabled={running}>
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            Run scan now
          </Button>
          {isAdmin ? (
            <Button onClick={() => setEditing({ id: null, draft: { ...DEFAULT_DRAFT } })}>
              <Plus className="h-4 w-4" /> New reminder
            </Button>
          ) : null}
        </div>
      </div>

      {/* How it works */}
      <Card className="border-dashed">
        <CardContent className="flex items-start gap-3 py-4 text-sm text-muted-foreground">
          <CalendarClock className="mt-0.5 h-5 w-5 shrink-0 opacity-60" />
          <p>
            A scan runs automatically every day. For each active reminder it finds certifications at
            your chosen timing offsets and emails the volunteer — escalating overdue ones to a
            supervisor or admin. Use <span className="font-medium text-foreground">Run scan now</span>{' '}
            to enqueue an immediate scan; the background worker sends within about five minutes.
          </p>
        </CardContent>
      </Card>

      {/* Editor */}
      {editing ? (
        <ConfigEditor
          draft={editing.draft}
          isNew={editing.id === null}
          onChange={(draft) => setEditing((e) => (e ? { ...e, draft } : e))}
          onCancel={() => setEditing(null)}
          onSave={saveDraft}
        />
      ) : null}

      {/* Config list (admins only — the list endpoint is admin-gated) */}
      {isAdmin ? (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground">Reminder configurations</h2>
          {loading ? (
            <Card>
              <CardContent className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading reminders…
              </CardContent>
            </Card>
          ) : error && configs.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-3 py-12 text-center text-sm text-muted-foreground">
                <AlertCircle className="h-10 w-10 opacity-30" /> Could not load reminders.
                <Button variant="outline" size="sm" onClick={() => void load()}>
                  Try again
                </Button>
              </CardContent>
            </Card>
          ) : configs.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-2 py-12 text-center text-sm text-muted-foreground">
                <BellRing className="h-10 w-10 opacity-30" />
                No reminders yet. Create one to start warning volunteers before their certs expire.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {configs.map((cfg) => (
                <ConfigCard
                  key={cfg.id}
                  cfg={cfg}
                  onEdit={() => setEditing({ id: cfg.id, draft: toDraft(cfg) })}
                  onToggle={() => toggleActive(cfg)}
                  onDelete={() => remove(cfg)}
                />
              ))}
            </div>
          )}
        </section>
      ) : null}

      {/* Sends log */}
      <SendsLog sends={sends} loading={loading} />
    </Shell>
  )
}

/* ------------------------------- config card ------------------------------- */

function ConfigCard({
  cfg,
  onEdit,
  onToggle,
  onDelete,
}: {
  cfg: ReminderConfig
  onEdit: () => void
  onToggle: () => void
  onDelete: () => void
}) {
  const sorted = [...cfg.offsets].sort((a, b) => b - a)
  return (
    <Card className={cfg.is_active ? '' : 'opacity-70'}>
      <CardContent className="space-y-3 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium capitalize text-foreground">{cfg.applies_to} reminder</span>
              {cfg.is_active ? (
                <Badge variant="outline" className="gap-1 text-green-700">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Active
                </Badge>
              ) : (
                <Badge variant="outline" className="gap-1 text-muted-foreground">
                  <Power className="h-3.5 w-3.5" /> Inactive
                </Badge>
              )}
            </div>
            <p className="truncate text-sm text-muted-foreground">{cfg.email_subject}</p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button variant="ghost" size="sm" onClick={onEdit}>
              <Pencil className="h-4 w-4" /> Edit
            </Button>
            <Button variant="ghost" size="sm" onClick={onToggle}>
              <Power className="h-4 w-4" /> {cfg.is_active ? 'Deactivate' : 'Activate'}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onDelete}
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" /> Delete
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {sorted.map((n) => (
            <Badge key={n} variant="outline" className={offsetTone(n)}>
              {offsetLabel(n)}
            </Badge>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" /> {FREQUENCY_LABELS[cfg.frequency]}
          </span>
          <span className="inline-flex items-center gap-1">
            <ArrowUpRight className="h-3.5 w-3.5" /> Escalates overdue to{' '}
            {ESCALATE_LABELS[cfg.escalate_to]}
          </span>
        </div>
      </CardContent>
    </Card>
  )
}

/* ------------------------------ config editor ------------------------------ */

const PRESET_OFFSETS = [90, 60, 30, 14, 7, 3, 1, 0, -1, -7, -14, -30]

function ConfigEditor({
  draft,
  isNew,
  onChange,
  onCancel,
  onSave,
}: {
  draft: Draft
  isNew: boolean
  onChange: (d: Draft) => void
  onCancel: () => void
  onSave: () => void
}) {
  const [saving, setSaving] = useState(false)
  const [customOffset, setCustomOffset] = useState('')
  const [showPreview, setShowPreview] = useState(true)

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => onChange({ ...draft, [k]: v })

  const addOffset = (n: number) => {
    if (Number.isNaN(n) || draft.offsets.includes(n)) return
    set('offsets', [...draft.offsets, n].sort((a, b) => b - a))
  }
  const removeOffset = (n: number) => set('offsets', draft.offsets.filter((o) => o !== n))

  const addCustom = () => {
    const n = parseInt(customOffset.trim(), 10)
    if (Number.isNaN(n)) return toast.error('Enter a whole number of days.')
    addOffset(n)
    setCustomOffset('')
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await onSave()
    } finally {
      setSaving(false)
    }
  }

  const sortedOffsets = useMemo(() => [...draft.offsets].sort((a, b) => b - a), [draft.offsets])

  return (
    <Card className="border-primary/30">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <BellRing className="h-4 w-4 text-muted-foreground" />
            {isNew ? 'New reminder' : 'Edit reminder'}
          </CardTitle>
          <Button variant="ghost" size="icon" onClick={onCancel} aria-label="Close editor">
            <X className="h-4 w-4" />
          </Button>
        </div>
        <CardDescription>
          Choose when reminders fire and what the email says. Negative offsets are overdue notices.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Timing */}
        <div className="space-y-2">
          <Label className="flex items-center gap-2 text-sm">
            <Clock className="h-4 w-4 text-muted-foreground" /> Timing offsets
          </Label>
          <p className="text-xs text-muted-foreground">
            Days relative to expiry. Positive = before, 0 = on the expiry date, negative = after
            (overdue).
          </p>
          <div className="flex min-h-9 flex-wrap items-center gap-1.5 rounded-md border bg-muted/30 p-2">
            {sortedOffsets.length === 0 ? (
              <span className="px-1 text-xs text-muted-foreground">No offsets selected.</span>
            ) : (
              sortedOffsets.map((n) => (
                <Badge key={n} variant="outline" className={`gap-1 bg-background ${offsetTone(n)}`}>
                  {offsetLabel(n)}
                  <button
                    type="button"
                    onClick={() => removeOffset(n)}
                    className="ml-0.5 rounded-full text-muted-foreground hover:text-foreground"
                    aria-label={`Remove ${offsetLabel(n)}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))
            )}
          </div>
          {/* Quick presets */}
          <div className="flex flex-wrap gap-1.5">
            {PRESET_OFFSETS.filter((n) => !draft.offsets.includes(n)).map((n) => (
              <Badge
                key={n}
                variant="outline"
                className="cursor-pointer hover:bg-accent"
                onClick={() => addOffset(n)}
              >
                <Plus className="h-3 w-3" /> {offsetLabel(n)}
              </Badge>
            ))}
          </div>
          {/* Custom */}
          <div className="flex items-center gap-2 pt-1">
            <Input
              type="number"
              placeholder="Custom days (e.g. 45 or -3)"
              value={customOffset}
              onChange={(e) => setCustomOffset(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  addCustom()
                }
              }}
              className="max-w-xs"
            />
            <Button type="button" variant="outline" size="sm" onClick={addCustom}>
              <Plus className="h-4 w-4" /> Add
            </Button>
          </div>
        </div>

        {/* Frequency + escalation */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-sm">Overdue frequency</Label>
            <NativeSelect
              value={draft.frequency}
              onChange={(v) => set('frequency', v as ReminderFrequency)}
              options={(['once', 'weekly', 'daily_overdue'] as ReminderFrequency[]).map((f) => ({
                value: f,
                label: FREQUENCY_LABELS[f],
              }))}
            />
            <p className="text-xs text-muted-foreground">{FREQUENCY_HELP[draft.frequency]}</p>
          </div>
          <div className="space-y-1.5">
            <Label className="flex items-center gap-2 text-sm">
              <ArrowUpRight className="h-4 w-4 text-muted-foreground" /> Escalate overdue to
            </Label>
            <NativeSelect
              value={draft.escalate_to}
              onChange={(v) => set('escalate_to', v as ReminderEscalateTo)}
              options={(['none', 'supervisor', 'admin'] as ReminderEscalateTo[]).map((e) => ({
                value: e,
                label: ESCALATE_LABELS[e],
              }))}
            />
            <p className="text-xs text-muted-foreground">
              When a cert is overdue (negative offset), also email this person.
            </p>
          </div>
        </div>

        {/* Email content */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Label className="flex items-center gap-2 text-sm">
              <Mail className="h-4 w-4 text-muted-foreground" /> Email content
            </Label>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowPreview((s) => !s)}
            >
              <Eye className="h-4 w-4" /> {showPreview ? 'Hide preview' : 'Show preview'}
            </Button>
          </div>

          {/* Token help */}
          <div className="flex flex-wrap gap-1.5">
            {TOKENS.map((t) => (
              <Badge key={t.token} variant="secondary" title={t.desc} className="font-mono">
                {t.token}
              </Badge>
            ))}
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Subject</Label>
            <Input
              value={draft.email_subject}
              onChange={(e) => set('email_subject', e.target.value)}
              placeholder="Your {{cert_name}} expires in {{days}} days"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Body (HTML)</Label>
            <Textarea
              value={draft.email_body_html}
              onChange={(e) => set('email_body_html', e.target.value)}
              className="min-h-32 font-mono text-xs"
            />
          </div>

          {showPreview ? (
            <div className="space-y-2 rounded-md border bg-muted/30 p-4">
              <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Eye className="h-3.5 w-3.5" /> Live preview (example data)
              </p>
              <p className="text-sm font-semibold text-foreground">
                {renderPreview(draft.email_subject) || (
                  <span className="text-muted-foreground">No subject</span>
                )}
              </p>
              <div
                className="prose prose-sm max-w-none text-sm text-foreground [&_p]:my-1"
                // Preview of admin-authored template with example data — admin-only surface.
                dangerouslySetInnerHTML={{ __html: renderPreview(draft.email_body_html) }}
              />
            </div>
          ) : null}
        </div>

        {/* Active toggle */}
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={draft.is_active}
            onChange={(e) => set('is_active', e.target.checked)}
            className="h-4 w-4 rounded border-input"
          />
          Active — include this reminder in scans
        </label>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 border-t pt-4">
          <Button variant="outline" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Saving…
              </>
            ) : (
              <>{isNew ? 'Create reminder' : 'Save changes'}</>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

/* -------------------------------- sends log -------------------------------- */

function SendsLog({ sends, loading }: { sends: SendLogRow[]; loading: boolean }) {
  return (
    <section className="space-y-3">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
        <History className="h-4 w-4" /> Recent reminders sent
      </h2>
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading history…
            </div>
          ) : sends.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-center text-sm text-muted-foreground">
              <Send className="h-10 w-10 opacity-30" />
              No reminders have been sent yet. They appear here after the next scan.
            </div>
          ) : (
            <div className="divide-y">
              <div className="grid grid-cols-12 gap-3 px-4 py-2.5 text-xs font-medium text-muted-foreground">
                <span className="col-span-5">Certification</span>
                <span className="col-span-4">Recipient</span>
                <span className="col-span-1 text-center">Timing</span>
                <span className="col-span-2 text-right">Sent</span>
              </div>
              {sends.map((s) => (
                <div key={s.id} className="grid grid-cols-12 items-center gap-3 px-4 py-2.5 text-sm">
                  <span className="col-span-5 truncate text-foreground">
                    {s.cert_name ?? 'Certification'}
                  </span>
                  <span className="col-span-4 truncate text-muted-foreground">
                    {s.recipient_name ?? '—'}
                  </span>
                  <span className="col-span-1 text-center">
                    <Badge variant="outline" className={`${offsetTone(s.offset_sent)} text-[10px]`}>
                      {offsetLabel(s.offset_sent)}
                    </Badge>
                  </span>
                  <span className="col-span-2 text-right text-xs text-muted-foreground">
                    {new Date(s.sent_at).toLocaleDateString('en-GB', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  )
}

/* ------------------------------- primitives -------------------------------- */

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto w-full max-w-5xl space-y-6 p-6">{children}</div>
}

function Header() {
  return (
    <h1 className="flex items-center gap-2 text-2xl font-semibold text-foreground">
      <BellRing className="h-6 w-6 text-muted-foreground" /> Expiry Reminders
    </h1>
  )
}

/** Lightweight native select styled to match the design system (see profile-settings). */
function NativeSelect({
  value,
  onChange,
  options,
}: {
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  )
}

/* --------------------------------- helpers --------------------------------- */

function toDraft(cfg: ReminderConfig): Draft {
  return {
    applies_to: cfg.applies_to,
    offsets: [...cfg.offsets],
    frequency: cfg.frequency,
    email_subject: cfg.email_subject,
    email_body_html: cfg.email_body_html,
    escalate_to: cfg.escalate_to,
    is_active: cfg.is_active,
  }
}
