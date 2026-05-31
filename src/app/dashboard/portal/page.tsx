'use client'

// Phase 7 — Volunteer portal home. Aggregates the current user's training,
// certifications, documents, and organizational messages into one overview.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { apiGet } from '@/services/phase7-client'

interface PortalData {
  counts: { training: number; certifications: number; documents: number; unreadMessages: number }
  messages: { recipient_id: string; subject: string; sent_at: string | null; read_at: string | null }[]
}

function StatCard({ label, value, href }: { label: string; value: number; href: string }) {
  return (
    <Link href={href} className="rounded border p-5 hover:bg-gray-50">
      <div className="text-3xl font-semibold">{value}</div>
      <div className="text-sm text-gray-500">{label}</div>
    </Link>
  )
}

export default function PortalHomePage() {
  const [data, setData] = useState<PortalData | null>(null)

  useEffect(() => {
    apiGet<PortalData>('/api/portal/home').then(setData).catch(() => setData(null))
  }, [])

  const counts = data?.counts ?? { training: 0, certifications: 0, documents: 0, unreadMessages: 0 }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <h1 className="text-2xl font-semibold">My Portal</h1>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Training" value={counts.training} href="/dashboard/training" />
        <StatCard label="Certifications" value={counts.certifications} href="/dashboard/compliance" />
        <StatCard label="Documents" value={counts.documents} href="/dashboard/documents" />
        <StatCard label="Unread messages" value={counts.unreadMessages} href="/dashboard/communications/inbox" />
      </div>

      <div className="space-y-2">
        <h2 className="font-medium">Latest updates</h2>
        {(data?.messages ?? []).length === 0 && <p className="text-sm text-gray-500">Nothing new.</p>}
        <ul className="space-y-1">
          {(data?.messages ?? []).slice(0, 5).map((m) => (
            <li key={m.recipient_id} className="flex justify-between rounded border px-4 py-2 text-sm">
              <span className={m.read_at ? 'text-gray-600' : 'font-semibold'}>{m.subject}</span>
              <span className="text-xs text-gray-400">{m.sent_at?.slice(0, 10)}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
