'use client'

// Phase 7 — Compose a targeted memo with a rich-text (markdown) body and reusable
// templates. Rich text: a markdown textarea with live HTML preview (no editor dep —
// see MERGE_NOTES). Targeted delivery resolves server-side.

import { useEffect, useState } from 'react'
import { apiGet, apiSend } from '@/services/phase7-client'
import { mdToHtml } from '@/lib/communications/markdown'

interface Template {
  id: string
  name: string
  subject: string
  body_html: string
}

type TargetType = 'all' | 'role' | 'org_unit' | 'group' | 'user'

export default function ComposeMessagePage() {
  const [subject, setSubject] = useState('')
  const [markdown, setMarkdown] = useState('')
  const [targetType, setTargetType] = useState<TargetType>('all')
  const [targetValue, setTargetValue] = useState('')
  const [sendEmail, setSendEmail] = useState(false)
  const [templates, setTemplates] = useState<Template[]>([])
  const [status, setStatus] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    apiGet<Template[]>('/api/templates').then(setTemplates).catch(() => setTemplates([]))
  }, [])

  function applyTemplate(id: string) {
    const tpl = templates.find((t) => t.id === id)
    if (!tpl) return
    setSubject(tpl.subject)
    setMarkdown(tpl.body_html)
  }

  async function send(draft: boolean) {
    setBusy(true)
    setStatus(null)
    try {
      const targets =
        targetType === 'all'
          ? [{ target_type: 'all' as const, target_value: null }]
          : [{ target_type: targetType, target_value: targetValue }]
      const result = await apiSend<{ recipientCount: number }>('/api/communications', 'POST', {
        subject,
        body_html: mdToHtml(markdown),
        targets,
        send_email: sendEmail,
        draft,
      })
      setStatus(draft ? 'Saved as draft.' : `Sent to ${result?.recipientCount ?? 0} recipient(s).`)
      if (!draft) {
        setSubject('')
        setMarkdown('')
      }
    } catch (e) {
      setStatus(`Failed: ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <h1 className="text-2xl font-semibold">Compose Memo</h1>

      <div className="space-y-2">
        <label className="block text-sm font-medium">Start from template</label>
        <select
          className="w-full rounded border px-3 py-2"
          defaultValue=""
          onChange={(e) => applyTemplate(e.target.value)}
        >
          <option value="" disabled>
            Select a template (optional)
          </option>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-medium">Subject</label>
        <input
          className="w-full rounded border px-3 py-2"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Announcement subject"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <label className="block text-sm font-medium">Body (Markdown)</label>
          <textarea
            className="h-56 w-full rounded border px-3 py-2 font-mono text-sm"
            value={markdown}
            onChange={(e) => setMarkdown(e.target.value)}
            placeholder="**Bold**, _italic_, lists, [links](https://…)"
          />
        </div>
        <div className="space-y-2">
          <label className="block text-sm font-medium">Preview</label>
          <div
            className="prose h-56 w-full overflow-auto rounded border bg-gray-50 px-3 py-2 text-sm"
            dangerouslySetInnerHTML={{ __html: mdToHtml(markdown) }}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <label className="block text-sm font-medium">Audience</label>
          <select
            className="w-full rounded border px-3 py-2"
            value={targetType}
            onChange={(e) => setTargetType(e.target.value as TargetType)}
          >
            <option value="all">Everyone</option>
            <option value="role">By role</option>
            <option value="org_unit">By org unit (department)</option>
            <option value="group">By training group</option>
            <option value="user">A single person</option>
          </select>
        </div>
        {targetType !== 'all' && (
          <div className="space-y-2">
            <label className="block text-sm font-medium">
              {targetType === 'role'
                ? 'Role (admin/hr/manager/employee)'
                : targetType === 'org_unit'
                  ? 'Department name'
                  : targetType === 'group'
                    ? 'Training group id'
                    : 'Employee id'}
            </label>
            <input
              className="w-full rounded border px-3 py-2"
              value={targetValue}
              onChange={(e) => setTargetValue(e.target.value)}
            />
          </div>
        )}
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={sendEmail} onChange={(e) => setSendEmail(e.target.checked)} />
        Also send by email
      </label>

      <div className="flex gap-3">
        <button
          className="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50"
          disabled={busy || !subject || !markdown}
          onClick={() => send(false)}
        >
          Send
        </button>
        <button
          className="rounded border px-4 py-2 disabled:opacity-50"
          disabled={busy || !subject}
          onClick={() => send(true)}
        >
          Save draft
        </button>
      </div>

      {status && <p className="text-sm text-gray-700">{status}</p>}
    </div>
  )
}
