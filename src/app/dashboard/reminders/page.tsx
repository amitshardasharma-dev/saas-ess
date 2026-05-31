'use client'

// Phase 7 — Expiry reminder settings (Admin). Create/list reminder configs and run
// an on-demand scan.

import { useEffect, useState } from 'react'
import { apiGet, apiSend } from '@/services/phase7-client'

interface ReminderConfig {
  id: string
  applies_to: string
  offsets: number[]
  frequency: string
  email_subject: string
  escalate_to: string
  is_active: boolean
}

export default function RemindersPage() {
  const [configs, setConfigs] = useState<ReminderConfig[]>([])
  const [offsets, setOffsets] = useState('90,30,7,0,-7')
  const [frequency, setFrequency] = useState('weekly')
  const [escalateTo, setEscalateTo] = useState('supervisor')
  const [subject, setSubject] = useState('Your certification expires in {{days}} days')
  const [body, setBody] = useState('<p>Hi {{name}}, your certification expires on {{expiry}}.</p>')
  const [status, setStatus] = useState<string | null>(null)

  async function load() {
    try {
      setConfigs(await apiGet<ReminderConfig[]>('/api/reminders'))
    } catch {
      setConfigs([])
    }
  }
  useEffect(() => {
    load()
  }, [])

  async function create() {
    setStatus(null)
    try {
      await apiSend('/api/reminders', 'POST', {
        applies_to: 'certification',
        offsets: offsets
          .split(',')
          .map((s) => parseInt(s.trim(), 10))
          .filter((n) => !Number.isNaN(n)),
        frequency,
        email_subject: subject,
        email_body_html: body,
        escalate_to: escalateTo,
        is_active: true,
      })
      setStatus('Reminder config saved.')
      await load()
    } catch (e) {
      setStatus(`Failed: ${(e as Error).message}`)
    }
  }

  async function runScan() {
    setStatus(null)
    try {
      await apiSend('/api/reminders/run', 'POST')
      setStatus('Scan enqueued — emails go out on the next cron tick.')
    } catch (e) {
      setStatus(`Failed: ${(e as Error).message}`)
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Expiry Reminders</h1>
        <button className="rounded border px-4 py-2 text-sm" onClick={runScan}>
          Run scan now
        </button>
      </div>

      <div className="space-y-3 rounded border p-4">
        <h2 className="font-medium">New reminder config</h2>
        <label className="block text-sm">Offsets (days; negative = overdue)</label>
        <input className="w-full rounded border px-3 py-2" value={offsets} onChange={(e) => setOffsets(e.target.value)} />
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm">Frequency</label>
            <select className="w-full rounded border px-3 py-2" value={frequency} onChange={(e) => setFrequency(e.target.value)}>
              <option value="once">Once</option>
              <option value="weekly">Weekly</option>
              <option value="daily_overdue">Daily while overdue</option>
            </select>
          </div>
          <div>
            <label className="block text-sm">Escalate to</label>
            <select className="w-full rounded border px-3 py-2" value={escalateTo} onChange={(e) => setEscalateTo(e.target.value)}>
              <option value="none">No one</option>
              <option value="supervisor">Supervisor</option>
              <option value="admin">Admin</option>
            </select>
          </div>
        </div>
        <label className="block text-sm">Email subject ({'{{name}} {{days}} {{expiry}}'})</label>
        <input className="w-full rounded border px-3 py-2" value={subject} onChange={(e) => setSubject(e.target.value)} />
        <label className="block text-sm">Email body (HTML)</label>
        <textarea className="h-24 w-full rounded border px-3 py-2 font-mono text-xs" value={body} onChange={(e) => setBody(e.target.value)} />
        <button className="rounded bg-blue-600 px-4 py-2 text-sm text-white" onClick={create}>
          Save config
        </button>
      </div>

      {status && <p className="text-sm text-gray-700">{status}</p>}

      <div className="space-y-2">
        <h2 className="font-medium">Active configs</h2>
        {configs.length === 0 && <p className="text-sm text-gray-500">None yet.</p>}
        <ul className="space-y-2">
          {configs.map((c) => (
            <li key={c.id} className="rounded border px-4 py-2 text-sm">
              <span className="font-medium">{c.applies_to}</span> · offsets [{c.offsets.join(', ')}] · {c.frequency} ·
              escalate: {c.escalate_to} · {c.is_active ? 'active' : 'inactive'}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
