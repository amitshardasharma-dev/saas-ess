// The per-certification review conversation: the back-and-forth between the
// volunteer (owner) and reviewers (hr+). Self-contained — fetches and posts to
// /api/certifications/:id/messages. Used on both the volunteer "My
// certifications" cards and the staff review panel. The server decides the
// author kind from the caller's role, so the same composer serves both sides.
'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2, Send, MessagesSquare } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { CertMessage } from '@/types/compliance'

function authHeaders(extra: HeadersInit = {}): HeadersInit {
  const token = typeof window !== 'undefined' ? localStorage.getItem('ess_access_token') : null
  return { ...extra, ...(token ? { Authorization: `Bearer ${token}` } : {}) }
}

interface Props {
  certId: string
  /** Whether to show the reply composer. */
  canReply?: boolean
  /** Bump to force a reload (e.g. after a review action elsewhere on the page). */
  reloadKey?: number
  /** Called after the viewer posts a message (parent can refresh status). */
  onChanged?: () => void
}

export function CertConversation({ certId, canReply = true, reloadKey = 0, onChanged }: Props) {
  const [messages, setMessages] = useState<CertMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [draft, setDraft] = useState('')
  const [posting, setPosting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(false)
    try {
      const res = await fetch(`/api/certifications/${certId}/messages`, { headers: authHeaders() })
      if (!res.ok) throw new Error('load failed')
      const data = await res.json()
      setMessages((data.messages ?? []) as CertMessage[])
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [certId])

  useEffect(() => { void load() }, [load, reloadKey])

  const send = async () => {
    const body = draft.trim()
    if (!body) return
    setPosting(true)
    try {
      const res = await fetch(`/api/certifications/${certId}/messages`, {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ body }),
      })
      if (!res.ok) throw new Error('post failed')
      const data = await res.json()
      setMessages((data.messages ?? []) as CertMessage[])
      setDraft('')
      onChanged?.()
    } catch {
      setError(true)
    } finally {
      setPosting(false)
    }
  }

  return (
    <div className="space-y-3">
      {loading ? (
        <div className="flex items-center gap-2 py-4 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading conversation…
        </div>
      ) : error && messages.length === 0 ? (
        <div className="py-4 text-xs text-destructive">Couldn’t load the conversation.</div>
      ) : messages.length === 0 ? (
        <div className="flex items-center gap-2 py-3 text-xs text-muted-foreground">
          <MessagesSquare className="h-4 w-4 opacity-40" /> No messages yet.
        </div>
      ) : (
        <ul className="space-y-3">
          {messages.map((m) => (
            <MessageRow key={m.id} m={m} />
          ))}
        </ul>
      )}

      {canReply ? (
        <div className="flex items-end gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Write a message…"
            rows={2}
            className="min-h-[40px] flex-1 resize-y rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') void send()
            }}
          />
          <Button type="button" size="sm" onClick={() => void send()} disabled={posting || !draft.trim()}>
            {posting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Send
          </Button>
        </div>
      ) : null}
    </div>
  )
}

function MessageRow({ m }: { m: CertMessage }) {
  if (m.author_kind === 'system') {
    return (
      <li className="text-center text-[11px] text-muted-foreground">{m.body}</li>
    )
  }
  const isReviewer = m.author_kind === 'reviewer'
  const roleLabel = isReviewer ? 'Reviewer' : 'Volunteer'
  const roleClass = isReviewer ? 'text-primary' : 'text-foreground'
  const wrap = isReviewer ? 'bg-primary/5 border-primary/15' : 'bg-muted/40 border-border/60'
  return (
    <li className={`rounded-lg border px-3 py-2 ${wrap}`}>
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className={`text-xs font-medium ${roleClass}`}>
          {m.author_name || roleLabel}
          <span className="ml-1.5 font-normal text-muted-foreground">· {roleLabel}</span>
        </span>
        <time className="shrink-0 text-[11px] text-muted-foreground" dateTime={m.created_at}>
          {formatWhen(m.created_at)}
        </time>
      </div>
      <p className="whitespace-pre-wrap text-sm text-foreground">{m.body}</p>
    </li>
  )
}

function formatWhen(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
}
