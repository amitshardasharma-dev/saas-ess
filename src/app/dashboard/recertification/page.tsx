'use client'

// Phase 7 — Recertification tracking (Staff/Admin). Lists recerts and triggers a scan.

import { useEffect, useState } from 'react'
import { apiGet, apiSend } from '@/services/phase7-client'

interface Recert {
  id: string
  employee_id: string
  certification_id: string
  status: string
  triggered_at: string
  assigned_module_id: string | null
  completed_at: string | null
}

export default function RecertificationPage() {
  const [items, setItems] = useState<Recert[]>([])
  const [status, setStatus] = useState<string | null>(null)

  async function load() {
    try {
      setItems(await apiGet<Recert[]>('/api/recertification'))
    } catch {
      setItems([])
    }
  }
  useEffect(() => {
    load()
  }, [])

  async function scan() {
    setStatus(null)
    try {
      await apiSend('/api/recertification', 'POST')
      setStatus('Recert scan enqueued — runs on the next cron tick.')
    } catch (e) {
      setStatus(`Failed: ${(e as Error).message}`)
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Recertification</h1>
        <button className="rounded border px-4 py-2 text-sm" onClick={scan}>
          Scan expired certs
        </button>
      </div>
      {status && <p className="text-sm text-gray-700">{status}</p>}
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-gray-500">
            <th className="py-2">Status</th>
            <th>Triggered</th>
            <th>Assigned module</th>
            <th>Completed</th>
          </tr>
        </thead>
        <tbody>
          {items.map((r) => (
            <tr key={r.id} className="border-b">
              <td className="py-2">{r.status}</td>
              <td>{r.triggered_at?.slice(0, 10)}</td>
              <td>{r.assigned_module_id ?? '—'}</td>
              <td>{r.completed_at?.slice(0, 10) ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {items.length === 0 && <p className="text-sm text-gray-500">No recertifications yet.</p>}
    </div>
  )
}
