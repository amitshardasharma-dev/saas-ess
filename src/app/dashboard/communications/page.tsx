'use client'

// Phase 7 — Communications landing.
//
//   • Volunteers (role: employee) → their inbox, elevated as the primary view.
//   • Staff (manager / hr / admin) → the message console: compose + sent/draft list,
//     plus a link to their own inbox.
//
// Role gates presentation only; the inbox + messages APIs stay unchanged.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { PenSquare, Inbox as InboxIcon, Loader2, AlertCircle, Send, FileText, MessageSquare } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useAuthStore } from '@/stores/auth'
import { hasMinRole } from '@/types/roles'
import { apiGet } from '@/services/phase7-client'
import { InboxView } from './inbox/page'

export default function CommunicationsPage() {
  const { user, isAuthenticated, checkAuth } = useAuthStore()

  useEffect(() => { void checkAuth() }, [checkAuth])

  if (!isAuthenticated || !user) return null

  const isStaff = hasMinRole(user.role, 'manager')

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 p-6">
      {isStaff ? <StaffConsole /> : <VolunteerInbox />}
    </div>
  )
}

/* ---------- volunteer view ---------- */

function VolunteerInbox() {
  return <InboxView showHeader />
}

/* ---------- staff view ---------- */

interface MessageRow {
  id: string
  subject: string
  status: string
  sent_at: string | null
  created_at: string
}

function StaffConsole() {
  const [messages, setMessages] = useState<MessageRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError(false)
      try {
        const rows = await apiGet<MessageRow[]>('/api/communications')
        if (!cancelled) setMessages(rows)
      } catch {
        if (!cancelled) { setError(true); setMessages([]) }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  return (
    <div className="space-y-6">
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

      <div>
        <h2 className="mb-3 text-sm font-semibold text-muted-foreground">Sent &amp; drafts</h2>

        {loading ? (
          <Card><CardContent className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading messages…
          </CardContent></Card>
        ) : error ? (
          <Card><CardContent className="flex flex-col items-center gap-2 py-16 text-center text-sm text-muted-foreground">
            <AlertCircle className="h-10 w-10 text-destructive/50" /> We couldn’t load your messages.
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
        ) : (
          <Card className="overflow-hidden py-0">
            <ul className="divide-y">
              {messages.map((m) => (
                <li key={m.id} className="flex items-center gap-3 px-4 py-3.5">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center text-muted-foreground" aria-hidden>
                    {m.status === 'sent' ? <Send className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground">{m.subject || '(no subject)'}</span>
                    <span className="text-xs text-muted-foreground">
                      {m.status === 'sent'
                        ? `Sent ${formatDate(m.sent_at)}`
                        : `Created ${formatDate(m.created_at)}`}
                    </span>
                  </span>
                  <StatusBadge status={m.status} />
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'sent') {
    return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Sent</Badge>
  }
  if (status === 'draft') {
    return <Badge variant="secondary">Draft</Badge>
  }
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
