'use client'

// Phase 7 — in-portal inbox. Lists messages delivered to the current user; mark read
// / dismiss. This is the recipient-facing side of targeted delivery.

import { useEffect, useState } from 'react'
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
  const [items, setItems] = useState<InboxItem[]>([])
  const [openId, setOpenId] = useState<string | null>(null)

  async function load() {
    try {
      setItems(await apiGet<InboxItem[]>('/api/communications/inbox'))
    } catch {
      setItems([])
    }
  }
  useEffect(() => {
    load()
  }, [])

  async function act(recipientId: string, action: 'read' | 'dismiss') {
    await apiSend(`/api/communications/inbox/${recipientId}`, 'PATCH', { action }).catch(() => {})
    await load()
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-6">
      <h1 className="text-2xl font-semibold">Inbox</h1>
      {items.length === 0 && <p className="text-sm text-gray-500">No messages.</p>}
      <ul className="space-y-2">
        {items.map((m) => (
          <li key={m.recipient_id} className="rounded border">
            <button
              className="flex w-full items-center justify-between px-4 py-3 text-left"
              onClick={() => {
                const next = openId === m.recipient_id ? null : m.recipient_id
                setOpenId(next)
                if (next && !m.read_at) act(m.recipient_id, 'read')
              }}
            >
              <span className={m.read_at ? 'text-gray-600' : 'font-semibold'}>{m.subject}</span>
              <span className="text-xs text-gray-400">{m.sent_at?.slice(0, 10)}</span>
            </button>
            {openId === m.recipient_id && (
              <div className="border-t px-4 py-3">
                <div className="prose text-sm" dangerouslySetInnerHTML={{ __html: m.body_html }} />
                <button className="mt-3 text-xs text-red-600" onClick={() => act(m.recipient_id, 'dismiss')}>
                  Dismiss
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
