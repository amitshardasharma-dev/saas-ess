'use client'

// Phase 7 — in-portal inbox. Lists messages delivered to the current user; mark read
// / dismiss. This is the recipient-facing side of targeted delivery.
//
// The list/detail UI lives in <InboxView /> (exported) so the Communications landing
// page can surface the same inbox for volunteers without duplicating the logic.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Mail, MailOpen, Inbox as InboxIcon, Loader2, AlertCircle, X, RefreshCw } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { apiGet, apiSend } from '@/services/phase7-client'

interface InboxItem {
  recipient_id: string
  message_id: string
  subject: string
  body_html: string
  sent_at: string | null
  read_at: string | null
}

export default function InboxPage() {
  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 p-6">
      <InboxView showHeader />
    </div>
  )
}

/**
 * The inbox list + reader. Rendered standalone on /inbox and embedded on the
 * Communications landing page for volunteers. `showHeader` toggles the page title
 * (the landing page supplies its own heading).
 */
export function InboxView({ showHeader = false }: { showHeader?: boolean }) {
  const [items, setItems] = useState<InboxItem[]>([])
  const [openId, setOpenId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

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

  useEffect(() => {
    void load()
  }, [load])

  const unreadCount = useMemo(() => items.filter((m) => !m.read_at).length, [items])

  const markRead = useCallback(async (recipientId: string) => {
    // Optimistic — flip locally, then persist. The list endpoint stays the source of truth.
    setItems((prev) => prev.map((m) => (m.recipient_id === recipientId && !m.read_at ? { ...m, read_at: new Date().toISOString() } : m)))
    try {
      await apiSend(`/api/communications/inbox/${recipientId}`, 'PATCH', { action: 'read' })
    } catch {
      /* non-fatal: a reload will reconcile */
    }
  }, [])

  const dismiss = useCallback(async (recipientId: string) => {
    setBusyId(recipientId)
    const snapshot = items
    // Optimistic removal.
    setItems((prev) => prev.filter((m) => m.recipient_id !== recipientId))
    if (openId === recipientId) setOpenId(null)
    try {
      await apiSend(`/api/communications/inbox/${recipientId}`, 'PATCH', { action: 'dismiss' })
    } catch {
      setItems(snapshot) // restore on failure
    } finally {
      setBusyId(null)
    }
  }, [items, openId])

  const toggleOpen = useCallback((m: InboxItem) => {
    setOpenId((cur) => {
      const next = cur === m.recipient_id ? null : m.recipient_id
      if (next && !m.read_at) void markRead(m.recipient_id)
      return next
    })
  }, [markRead])

  return (
    <div className="space-y-6">
      {showHeader ? (
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Inbox</h1>
            <p className="mt-1 text-sm text-muted-foreground">Messages and announcements sent to you.</p>
          </div>
          <div className="flex items-center gap-2">
            {unreadCount > 0 ? (
              <Badge className="bg-primary/10 text-primary hover:bg-primary/10">
                {unreadCount} unread
              </Badge>
            ) : null}
            <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
            </Button>
          </div>
        </div>
      ) : null}

      {loading ? (
        <Card><CardContent className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading your messages…
        </CardContent></Card>
      ) : error ? (
        <Card><CardContent className="flex flex-col items-center gap-3 py-16 text-center text-sm text-muted-foreground">
          <AlertCircle className="h-10 w-10 text-destructive/50" />
          <p>We couldn’t load your inbox.</p>
          <Button variant="outline" size="sm" onClick={() => void load()}>
            <RefreshCw className="h-4 w-4" /> Try again
          </Button>
        </CardContent></Card>
      ) : items.length === 0 ? (
        <Card><CardContent className="flex flex-col items-center gap-2 py-16 text-center text-sm text-muted-foreground">
          <InboxIcon className="h-10 w-10 opacity-30" />
          <p className="font-medium text-foreground">No messages yet</p>
          <p>Announcements and messages sent to you will appear here.</p>
        </CardContent></Card>
      ) : (
        <Card className="overflow-hidden py-0">
          <ul className="divide-y">
            {items.map((m) => (
              <MessageRow
                key={m.recipient_id}
                item={m}
                open={openId === m.recipient_id}
                busy={busyId === m.recipient_id}
                onToggle={() => toggleOpen(m)}
                onDismiss={() => void dismiss(m.recipient_id)}
              />
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}

/* ---------- row ---------- */

function MessageRow({
  item, open, busy, onToggle, onDismiss,
}: {
  item: InboxItem
  open: boolean
  busy: boolean
  onToggle: () => void
  onDismiss: () => void
}) {
  const unread = !item.read_at
  const preview = useMemo(() => htmlToText(item.body_html), [item.body_html])

  return (
    <li className={unread ? 'bg-primary/[0.03]' : undefined}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-start gap-3 px-4 py-3.5 text-left transition-colors hover:bg-muted/50"
      >
        {/* Read/unread glyph */}
        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center" aria-hidden>
          {unread ? <Mail className="h-4 w-4 text-primary" /> : <MailOpen className="h-4 w-4 text-muted-foreground" />}
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            {unread ? <span className="h-2 w-2 shrink-0 rounded-full bg-primary" aria-label="Unread" /> : null}
            <span className={`truncate text-sm ${unread ? 'font-semibold text-foreground' : 'font-medium text-foreground/80'}`}>
              {item.subject || '(no subject)'}
            </span>
          </span>
          {!open && preview ? (
            <span className="mt-0.5 line-clamp-1 text-sm text-muted-foreground">{preview}</span>
          ) : null}
        </span>

        <time className="mt-0.5 shrink-0 text-xs text-muted-foreground" dateTime={item.sent_at ?? undefined}>
          {formatDate(item.sent_at)}
        </time>
      </button>

      {open ? (
        <div className="border-t bg-muted/20 px-4 py-4">
          <div
            className="prose prose-sm max-w-none text-sm text-foreground prose-headings:text-foreground prose-a:text-primary"
            // body_html is produced server-side by the whitelisted markdown converter
            // (@/lib/communications/markdown escapes input, emits only safe tags) — we
            // preserve that sanitization model and render it as-is here.
            dangerouslySetInnerHTML={{ __html: item.body_html }}
          />
          <div className="mt-4 flex justify-end">
            <Button variant="outline" size="sm" onClick={onDismiss} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
              Dismiss
            </Button>
          </div>
        </div>
      ) : null}
    </li>
  )
}

/* ---------- helpers ---------- */

/** Strip tags + collapse whitespace for a one-line preview (decodes the few entities the converter emits). */
function htmlToText(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

/** Friendly relative-ish date: time today, “Yesterday”, weekday this week, else short date. */
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
