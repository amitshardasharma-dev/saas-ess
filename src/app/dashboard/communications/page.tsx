'use client'

// Phase 7 — Communications landing: sent/draft list + links to compose and templates.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { apiGet } from '@/services/phase7-client'

interface MessageRow {
  id: string
  subject: string
  status: string
  sent_at: string | null
  created_at: string
}

export default function CommunicationsPage() {
  const [messages, setMessages] = useState<MessageRow[]>([])

  useEffect(() => {
    apiGet<MessageRow[]>('/api/communications').then(setMessages).catch(() => setMessages([]))
  }, [])

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Communications</h1>
        <div className="flex gap-3">
          <Link className="rounded bg-blue-600 px-4 py-2 text-sm text-white" href="/dashboard/communications/compose">
            Compose
          </Link>
          <Link className="rounded border px-4 py-2 text-sm" href="/dashboard/communications/inbox">
            Inbox
          </Link>
        </div>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-gray-500">
            <th className="py-2">Subject</th>
            <th>Status</th>
            <th>Sent</th>
          </tr>
        </thead>
        <tbody>
          {messages.map((m) => (
            <tr key={m.id} className="border-b">
              <td className="py-2">{m.subject}</td>
              <td>{m.status}</td>
              <td>{m.sent_at?.slice(0, 10) ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {messages.length === 0 && <p className="text-sm text-gray-500">No messages yet.</p>}
    </div>
  )
}
