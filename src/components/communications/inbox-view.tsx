'use client'

// In-portal inbox: a two-pane reader (message list + reading pane, responsive).
// Lives in a component (not a page file) so both the /inbox route and the
// Communications landing page can render it.

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  MailOpen, Inbox as InboxIcon, Loader2, AlertCircle, X, RefreshCw,
  Megaphone, ArrowLeft, CheckCheck, Search,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { apiGet, apiSend } from '@/services/phase7-client'

interface InboxItem {
  recipient_id: string
  message_id: string
  subject: string
  body_html: string
  sent_at: string | null
  read_at: string | null
}

export function InboxView({ showHeader = false }: { showHeader?: boolean }) {
  const [items, setItems] = useState<InboxItem[]>([])
  const [openId, setOpenId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [markingAll, setMarkingAll] = useState(false)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'unread'>('all')

  const load = useCallback(async () => {
    setLoading(true)
    setError(false)
    try {
      setItems(await apiGet<InboxItem[]>('/api/communications/inbox'))
    } catch {
      setError(true)
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const unreadCount = useMemo(() => items.filter((m) => !m.read_at).length, [items])

  const markRead = useCallback(async (recipientId: string) => {
    setItems((prev) => prev.map((m) => (m.recipient_id === recipientId && !m.read_at ? { ...m, read_at: new Date().toISOString() } : m)))
    try {
      await apiSend(`/api/communications/inbox/${recipientId}`, 'PATCH', { action: 'read' })
    } catch { /* non-fatal; a reload reconciles */ }
  }, [])

  const markAllRead = useCallback(async () => {
    const unread = items.filter((m) => !m.read_at)
    if (unread.length === 0) return
    setMarkingAll(true)
    setItems((prev) => prev.map((m) => (m.read_at ? m : { ...m, read_at: new Date().toISOString() })))
    try {
      await Promise.all(unread.map((m) => apiSend(`/api/communications/inbox/${m.recipient_id}`, 'PATCH', { action: 'read' })))
    } catch { /* non-fatal */ } finally { setMarkingAll(false) }
  }, [items])

  const dismiss = useCallback(async (recipientId: string) => {
    setBusyId(recipientId)
    const snapshot = items
    setItems((prev) => prev.filter((m) => m.recipient_id !== recipientId))
    if (openId === recipientId) setOpenId(null)
    try {
      await apiSend(`/api/communications/inbox/${recipientId}`, 'PATCH', { action: 'dismiss' })
    } catch { setItems(snapshot) } finally { setBusyId(null) }
  }, [items, openId])

  const openMessage = useCallback((m: InboxItem) => {
    setOpenId(m.recipient_id)
    if (!m.read_at) void markRead(m.recipient_id)
  }, [markRead])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return items.filter((m) => {
      if (filter === 'unread' && m.read_at) return false
      if (q && !`${m.subject} ${htmlToText(m.body_html)}`.toLowerCase().includes(q)) return false
      return true
    })
  }, [items, search, filter])

  const open = items.find((m) => m.recipient_id === openId) ?? null

  return (
    <div className="space-y-4">
      {showHeader ? (
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Inbox</h1>
            <p className="mt-1 text-sm text-muted-foreground">Messages and announcements sent to you.</p>
          </div>
          <div className="flex items-center gap-2">
            {unreadCount > 0 ? <Badge className="bg-primary/10 text-primary hover:bg-primary/10">{unreadCount} unread</Badge> : null}
            <Button variant="outline" size="sm" onClick={() => void markAllRead()} disabled={markingAll || unreadCount === 0}>
              {markingAll ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCheck className="h-4 w-4" />} Mark all read
            </Button>
            <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
            </Button>
          </div>
        </div>
      ) : null}

      <Card className="overflow-hidden p-0">
        {loading ? (
          <CardContent className="flex items-center justify-center gap-2 py-20 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading your messages…
          </CardContent>
        ) : error ? (
          <CardContent className="flex flex-col items-center gap-3 py-20 text-center text-sm text-muted-foreground">
            <AlertCircle className="h-10 w-10 text-destructive/50" />
            <p>We couldn’t load your inbox.</p>
            <Button variant="outline" size="sm" onClick={() => void load()}><RefreshCw className="h-4 w-4" /> Try again</Button>
          </CardContent>
        ) : items.length === 0 ? (
          <CardContent className="flex flex-col items-center gap-2 py-20 text-center text-sm text-muted-foreground">
            <InboxIcon className="h-10 w-10 opacity-30" />
            <p className="font-medium text-foreground">No messages yet</p>
            <p>Announcements and messages sent to you will appear here.</p>
          </CardContent>
        ) : (
          <div className="flex h-[68vh] min-h-[420px]">
            {/* List pane */}
            <aside className={`${open ? 'hidden md:flex' : 'flex'} w-full flex-col border-r md:w-80 lg:w-96`}>
              <div className="space-y-2 border-b p-3">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input placeholder="Search messages…" value={search} onChange={(e) => setSearch(e.target.value)} className="h-9 pl-9" />
                </div>
                <div className="flex gap-2">
                  {(['all', 'unread'] as const).map((f) => (
                    <Badge key={f} variant={filter === f ? 'default' : 'outline'} className="cursor-pointer capitalize" onClick={() => setFilter(f)}>
                      {f === 'unread' ? `Unread${unreadCount ? ` (${unreadCount})` : ''}` : 'All'}
                    </Badge>
                  ))}
                </div>
              </div>
              <ul className="flex-1 divide-y overflow-y-auto">
                {filtered.length === 0 ? (
                  <li className="p-6 text-center text-sm text-muted-foreground">No messages match.</li>
                ) : filtered.map((m) => {
                  const unread = !m.read_at
                  const active = m.recipient_id === openId
                  return (
                    <li key={m.recipient_id}>
                      <button
                        type="button"
                        onClick={() => openMessage(m)}
                        className={`flex w-full items-start gap-3 px-3 py-3 text-left transition-colors ${active ? 'bg-primary/5' : unread ? 'bg-primary/[0.03] hover:bg-muted/50' : 'hover:bg-muted/50'}`}
                      >
                        <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${unread ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
                          <Megaphone className="h-4 w-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2">
                            {unread ? <span className="h-2 w-2 shrink-0 rounded-full bg-primary" aria-label="Unread" /> : null}
                            <span className={`truncate text-sm ${unread ? 'font-semibold text-foreground' : 'font-medium text-foreground/80'}`}>{m.subject || '(no subject)'}</span>
                          </span>
                          <span className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{htmlToText(m.body_html) || 'No preview'}</span>
                        </span>
                        <time className="mt-0.5 shrink-0 text-[11px] text-muted-foreground" dateTime={m.sent_at ?? undefined}>{formatDate(m.sent_at)}</time>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </aside>

            {/* Reading pane */}
            <section className={`${open ? 'flex' : 'hidden md:flex'} min-w-0 flex-1 flex-col`}>
              {open ? (
                <>
                  <div className="flex items-start justify-between gap-3 border-b p-4">
                    <div className="flex min-w-0 items-start gap-3">
                      <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setOpenId(null)} aria-label="Back"><ArrowLeft className="h-4 w-4" /></Button>
                      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"><Megaphone className="h-4 w-4" /></span>
                      <div className="min-w-0">
                        <h2 className="truncate text-base font-semibold text-foreground">{open.subject || '(no subject)'}</h2>
                        <p className="mt-0.5 text-xs text-muted-foreground">Birch Foundation · {formatFull(open.sent_at)}</p>
                      </div>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => void dismiss(open.recipient_id)} disabled={busyId === open.recipient_id}>
                      {busyId === open.recipient_id ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />} Dismiss
                    </Button>
                  </div>
                  <div className="flex-1 overflow-y-auto p-5">
                    <div
                      className="prose prose-sm max-w-none text-foreground prose-headings:text-foreground prose-a:text-primary"
                      // body_html is produced server-side by the whitelisted markdown converter.
                      dangerouslySetInnerHTML={{ __html: open.body_html }}
                    />
                  </div>
                </>
              ) : (
                <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center text-sm text-muted-foreground">
                  <MailOpen className="h-10 w-10 opacity-30" />
                  <p>Select a message to read it.</p>
                </div>
              )}
            </section>
          </div>
        )}
      </Card>
    </div>
  )
}

/* ---------- helpers ---------- */

function htmlToText(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ').trim()
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const now = new Date()
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const dayDiff = Math.round((startOfDay(now) - startOfDay(d)) / 86_400_000)
  if (dayDiff === 0) return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  if (dayDiff === 1) return 'Yesterday'
  if (dayDiff > 1 && dayDiff < 7) return d.toLocaleDateString(undefined, { weekday: 'short' })
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: now.getFullYear() === d.getFullYear() ? undefined : 'numeric' })
}

function formatFull(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString(undefined, { day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}
