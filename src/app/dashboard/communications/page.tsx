'use client'

// Phase 7 — Communications landing.
//
//   • Volunteers (role: employee) → their inbox, elevated as the primary view.
//   • Staff (manager / hr / admin) → the message console: compose + a sent/drafts
//     list with status chips, a read-only viewer, resend / continue-draft, and inline
//     template management.
//
// Role gates presentation only; the inbox + messages APIs stay unchanged.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  PenSquare, Inbox as InboxIcon, Loader2, AlertCircle, Send, FileText, MessageSquare,
  RefreshCw, Eye, X, Settings2, Search,
} from 'lucide-react'
import toast, { Toaster } from 'react-hot-toast'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { useAuthStore } from '@/stores/auth'
import { hasMinRole } from '@/types/roles'
import { apiGet } from '@/services/phase7-client'
import { InboxView } from '@/components/communications/inbox-view'
import { TemplateManager } from '@/components/communications/template-manager'
import { COMPOSE_PREFILL_KEY, type ComposePrefill } from '@/lib/communications/compose-prefill'

export default function CommunicationsPage() {
  const { user, isAuthenticated, checkAuth } = useAuthStore()

  useEffect(() => { void checkAuth() }, [checkAuth])

  if (!isAuthenticated || !user) return null

  const isStaff = hasMinRole(user.role, 'manager')

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 p-6">
      <Toaster position="top-center" />
      {isStaff ? <StaffConsole /> : <InboxView showHeader />}
    </div>
  )
}

/* ---------- staff console ---------- */

interface MessageRow {
  id: string
  subject: string
  body_html: string
  status: string
  sent_at: string | null
  created_at: string
}

function StaffConsole() {
  const router = useRouter()
  const [messages, setMessages] = useState<MessageRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'sent' | 'draft'>('all')
  const [viewing, setViewing] = useState<MessageRow | null>(null)
  const [showTemplates, setShowTemplates] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(false)
    try {
      setMessages(await apiGet<MessageRow[]>('/api/communications'))
    } catch {
      setError(true)
      setMessages([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const counts = useMemo(() => ({
    sent: messages.filter((m) => m.status === 'sent').length,
    draft: messages.filter((m) => m.status === 'draft').length,
  }), [messages])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return messages.filter((m) => {
      if (filter !== 'all' && m.status !== filter) return false
      if (q && !(m.subject || '').toLowerCase().includes(q)) return false
      return true
    })
  }, [messages, search, filter])

  // Resend a sent message / continue a draft: hand the subject to the composer. Sent
  // messages persist rendered HTML (not markdown), so we prefill the subject and let
  // the author re-pick the audience + body; the viewer shows the original verbatim.
  const reuse = useCallback((m: MessageRow) => {
    const payload: ComposePrefill = { subject: m.subject }
    try {
      window.sessionStorage.setItem(COMPOSE_PREFILL_KEY, JSON.stringify(payload))
    } catch {
      /* sessionStorage unavailable — composer simply opens blank */
    }
    if (m.status === 'sent') toast('Re-pick the audience, then send.', { icon: '↻' })
    router.push('/dashboard/communications/compose')
  }, [router])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Communications</h1>
          <p className="mt-1 text-sm text-muted-foreground">Compose announcements and review what you’ve sent.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard/communications/inbox"><InboxIcon className="h-4 w-4" /> Inbox</Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/dashboard/communications/compose"><PenSquare className="h-4 w-4" /> Compose</Link>
          </Button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-3 sm:max-w-sm">
        <SummaryStat icon={Send} label="Sent" value={counts.sent} />
        <SummaryStat icon={FileText} label="Drafts" value={counts.draft} />
      </div>

      {/* List + controls */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-muted-foreground">Sent &amp; drafts</h2>
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-full max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search by subject…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
          <div className="flex flex-wrap gap-2">
            {(['all', 'sent', 'draft'] as const).map((f) => (
              <Badge
                key={f}
                variant={filter === f ? 'default' : 'outline'}
                className="cursor-pointer capitalize"
                onClick={() => setFilter(f)}
              >
                {f === 'all' ? 'All' : f}
              </Badge>
            ))}
          </div>
        </div>

        {loading ? (
          <Card><CardContent className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading messages…
          </CardContent></Card>
        ) : error ? (
          <Card><CardContent className="flex flex-col items-center gap-3 py-16 text-center text-sm text-muted-foreground">
            <AlertCircle className="h-10 w-10 text-destructive/50" />
            <p>We couldn’t load your messages.</p>
            <Button variant="outline" size="sm" onClick={() => void load()}><RefreshCw className="h-4 w-4" /> Try again</Button>
          </CardContent></Card>
        ) : messages.length === 0 ? (
          <Card><CardContent className="flex flex-col items-center gap-2 py-16 text-center text-sm text-muted-foreground">
            <MessageSquare className="h-10 w-10 opacity-30" />
            <p className="font-medium text-foreground">No messages yet</p>
            <p>Compose an announcement to get started.</p>
            <Button asChild size="sm" className="mt-2">
              <Link href="/dashboard/communications/compose"><PenSquare className="h-4 w-4" /> Compose a message</Link>
            </Button>
          </CardContent></Card>
        ) : filtered.length === 0 ? (
          <Card><CardContent className="flex flex-col items-center gap-2 py-16 text-center text-sm text-muted-foreground">
            <Search className="h-10 w-10 opacity-30" /> No messages match your filters.
          </CardContent></Card>
        ) : (
          <Card className="overflow-hidden py-0">
            <ul className="divide-y">
              {filtered.map((m) => (
                <li key={m.id} className="flex items-center gap-3 px-4 py-3.5">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center text-muted-foreground" aria-hidden>
                    {m.status === 'sent' ? <Send className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                  </span>
                  <button type="button" onClick={() => setViewing(m)} className="min-w-0 flex-1 text-left">
                    <span className="block truncate text-sm font-medium text-foreground">{m.subject || '(no subject)'}</span>
                    <span className="text-xs text-muted-foreground">
                      {m.status === 'sent' ? `Sent ${formatDate(m.sent_at)}` : `Created ${formatDate(m.created_at)}`}
                    </span>
                  </button>
                  <StatusBadge status={m.status} />
                  <div className="flex shrink-0 gap-1">
                    <Button type="button" variant="ghost" size="sm" onClick={() => setViewing(m)} aria-label="View message">
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button type="button" variant="ghost" size="sm" onClick={() => reuse(m)}>
                      {m.status === 'sent'
                        ? <><RefreshCw className="h-4 w-4" /> Resend</>
                        : <><PenSquare className="h-4 w-4" /> Continue</>}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>

      {/* Templates */}
      <div className="border-t pt-4">
        <Button type="button" variant="ghost" size="sm" className="-ml-2 text-muted-foreground" onClick={() => setShowTemplates((s) => !s)}>
          <Settings2 className="h-4 w-4" /> {showTemplates ? 'Hide templates' : 'Manage templates'}
        </Button>
        {showTemplates ? <div className="mt-3"><TemplateManager /></div> : null}
      </div>

      {viewing ? <MessageViewer message={viewing} onClose={() => setViewing(null)} onReuse={() => { reuse(viewing) }} /> : null}
    </div>
  )
}

function SummaryStat({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: number }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 py-4">
        <span className="flex h-9 w-9 items-center justify-center rounded-md bg-muted text-muted-foreground" aria-hidden>
          <Icon className="h-4 w-4" />
        </span>
        <span>
          <span className="block text-xl font-semibold leading-none text-foreground">{value}</span>
          <span className="text-xs text-muted-foreground">{label}</span>
        </span>
      </CardContent>
    </Card>
  )
}

/* ---------- read-only message viewer ---------- */

function MessageViewer({ message, onClose, onReuse }: { message: MessageRow; onClose: () => void; onReuse: () => void }) {
  // Close on Escape for keyboard users.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Message">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden />
      <Card className="relative z-10 flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden py-0">
        <div className="flex items-start justify-between gap-3 border-b px-5 py-4">
          <div className="min-w-0">
            <h3 className="truncate text-base font-semibold text-foreground">{message.subject || '(no subject)'}</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {message.status === 'sent' ? `Sent ${formatDate(message.sent_at)}` : `Draft · created ${formatDate(message.created_at)}`}
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close"><X className="h-4 w-4" /></Button>
        </div>

        <div className="overflow-y-auto px-5 py-4">
          <div
            className="prose prose-sm max-w-none text-sm text-foreground prose-headings:text-foreground prose-a:text-primary"
            // body_html was produced server-side by the whitelisted markdown converter
            // (escaped input, safe tags only) — the same content the inbox renders.
            dangerouslySetInnerHTML={{ __html: message.body_html }}
          />
        </div>

        <div className="flex justify-end gap-2 border-t px-5 py-3">
          <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
          <Button size="sm" onClick={onReuse}>
            {message.status === 'sent' ? <><RefreshCw className="h-4 w-4" /> Resend</> : <><PenSquare className="h-4 w-4" /> Continue editing</>}
          </Button>
        </div>
      </Card>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'sent') return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Sent</Badge>
  if (status === 'draft') return <Badge variant="secondary">Draft</Badge>
  return <Badge variant="outline" className="capitalize">{status}</Badge>
}

/* ---------- helpers ---------- */

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const now = new Date()
  return d.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: now.getFullYear() === d.getFullYear() ? undefined : 'numeric',
  })
}
