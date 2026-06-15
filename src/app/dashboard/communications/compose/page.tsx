'use client'

// Phase 7 — Compose a targeted announcement.
//
// A polished composer: subject, a Markdown body editor with LIVE PREVIEW (rendered via
// the XSS-safe @/lib/communications/markdown), a template picker (apply + save), real
// audience targeting (All / Role / Department / Group / Individual — see
// <RecipientTargeting/>), a recipient-count preview, and Send / Save-draft actions
// with toasts.
//
// The wire contract is unchanged: POST /api/communications with
//   { subject, body_html: mdToHtml(markdown), targets: [{target_type,target_value}],
//     send_email, draft }.
// Targeting + recipient resolution stay server-side; we only build the request here.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  PenSquare, ArrowLeft, Send, FileText, Loader2, Eye, Code2, Mail, Inbox as InboxIcon,
  Settings2,
} from 'lucide-react'
import toast, { Toaster } from 'react-hot-toast'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { apiSend } from '@/services/phase7-client'
import { mdToHtml } from '@/lib/communications/markdown'
import { RecipientTargeting, type TargetSelection } from '@/components/communications/recipient-targeting'
import { TemplatePicker, TemplateManager } from '@/components/communications/template-manager'
import { COMPOSE_PREFILL_KEY } from '@/lib/communications/compose-prefill'

export default function ComposeMessagePage() {
  const router = useRouter()

  const [subject, setSubject] = useState('')
  const [markdown, setMarkdown] = useState('')
  const [target, setTarget] = useState<TargetSelection>({ type: 'all', value: null })
  const [sendEmail, setSendEmail] = useState(false)
  const [tab, setTab] = useState<'write' | 'preview'>('write')
  const [showTemplates, setShowTemplates] = useState(false)
  const [busy, setBusy] = useState<false | 'send' | 'draft'>(false)

  // Resend / continue-draft hands off a subject (and, when it's a template-sourced
  // draft, a markdown body) via sessionStorage so we don't grow the URL or change the
  // server. Read once on mount.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const raw = window.sessionStorage.getItem(COMPOSE_PREFILL_KEY)
    if (!raw) return
    window.sessionStorage.removeItem(COMPOSE_PREFILL_KEY)
    try {
      const data = JSON.parse(raw) as { subject?: string; body?: string }
      if (data.subject) setSubject(data.subject)
      if (data.body) setMarkdown(data.body)
    } catch {
      /* ignore malformed prefill */
    }
  }, [])

  const bodyHtml = useMemo(() => mdToHtml(markdown), [markdown])

  // A target needs a value unless it's 'all'. Send is gated on a complete message.
  const targetReady = target.type === 'all' || !!target.value
  const canSend = !!subject.trim() && !!markdown.trim() && targetReady && !busy
  const canDraft = !!subject.trim() && !busy

  const applyTemplate = useCallback((tplSubject: string, tplBody: string) => {
    setSubject(tplSubject)
    setMarkdown(tplBody)
    setTab('write')
  }, [])

  async function submit(draft: boolean) {
    setBusy(draft ? 'draft' : 'send')
    try {
      const targets =
        target.type === 'all'
          ? [{ target_type: 'all' as const, target_value: null }]
          : [{ target_type: target.type, target_value: target.value }]

      const result = await apiSend<{ recipientCount?: number }>('/api/communications', 'POST', {
        subject: subject.trim(),
        body_html: bodyHtml,
        targets,
        send_email: sendEmail,
        draft,
      })

      if (draft) {
        toast.success('Saved as draft')
        router.push('/dashboard/communications')
      } else {
        const n = result?.recipientCount ?? 0
        toast.success(`Sent to ${n} recipient${n === 1 ? '' : 's'}`)
        router.push('/dashboard/communications')
      }
    } catch (e) {
      toast.error(`Couldn’t ${draft ? 'save draft' : 'send'}: ${(e as Error).message}`)
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 p-6">
      <Toaster position="top-center" />

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Button asChild variant="ghost" size="sm" className="-ml-2 mb-1 h-7 text-muted-foreground">
            <Link href="/dashboard/communications"><ArrowLeft className="h-4 w-4" /> Communications</Link>
          </Button>
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-foreground">
            <PenSquare className="h-5 w-5 text-muted-foreground" /> Compose
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">Write an announcement and choose who receives it.</p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/dashboard/communications/inbox"><InboxIcon className="h-4 w-4" /> Inbox</Link>
        </Button>
      </div>

      {/* Template tools */}
      <Card>
        <CardContent className="space-y-3 py-4">
          <TemplatePicker onApply={applyTemplate} current={{ subject, body: markdown }} />
          <div>
            <Button type="button" variant="ghost" size="sm" className="-ml-2 text-muted-foreground" onClick={() => setShowTemplates((s) => !s)}>
              <Settings2 className="h-4 w-4" /> {showTemplates ? 'Hide template management' : 'Manage templates'}
            </Button>
            {showTemplates ? (
              <div className="mt-3 border-t pt-4">
                <TemplateManager />
              </div>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {/* Message */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><FileText className="h-4 w-4 text-muted-foreground" /> Message</CardTitle>
          <CardDescription>Markdown is supported — preview before you send.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-sm" htmlFor="subject">Subject</Label>
            <Input id="subject" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Announcement subject" maxLength={300} />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-sm">Body</Label>
              <div className="inline-flex rounded-md border p-0.5">
                <button
                  type="button"
                  onClick={() => setTab('write')}
                  className={`flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors ${tab === 'write' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                  aria-pressed={tab === 'write'}
                >
                  <Code2 className="h-3.5 w-3.5" /> Write
                </button>
                <button
                  type="button"
                  onClick={() => setTab('preview')}
                  className={`flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors ${tab === 'preview' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                  aria-pressed={tab === 'preview'}
                >
                  <Eye className="h-3.5 w-3.5" /> Preview
                </button>
              </div>
            </div>

            {tab === 'write' ? (
              <Textarea
                value={markdown}
                onChange={(e) => setMarkdown(e.target.value)}
                className="min-h-64 font-mono text-sm"
                placeholder={'# A clear heading\n\nWrite your message here. You can use **bold**, _italic_, `code`,\n\n- bullet points\n- and [links](https://example.org).'}
              />
            ) : bodyHtml ? (
              <div
                className="prose prose-sm min-h-64 max-w-none rounded-md border bg-muted/20 px-4 py-3 text-sm text-foreground prose-headings:text-foreground prose-a:text-primary"
                // body_html is produced by the whitelisted markdown converter; it escapes
                // input and emits only safe tags (same model the inbox renders with).
                dangerouslySetInnerHTML={{ __html: bodyHtml }}
              />
            ) : (
              <div className="flex min-h-64 items-center justify-center rounded-md border border-dashed bg-muted/20 text-sm text-muted-foreground">
                Nothing to preview yet.
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Supports headings, <strong>bold</strong>, <em>italic</em>, <code>code</code>, lists and links.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Audience */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><Send className="h-4 w-4 text-muted-foreground" /> Recipients</CardTitle>
          <CardDescription>Choose who should receive this announcement.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <RecipientTargeting selection={target} onChange={setTarget} />
          <label className="flex w-fit items-center gap-2 text-sm">
            <Checkbox checked={sendEmail} onCheckedChange={(v) => setSendEmail(v === true)} />
            <span className="flex items-center gap-1.5"><Mail className="h-4 w-4 text-muted-foreground" /> Also send a copy by email</span>
          </label>
        </CardContent>
      </Card>

      {/* Sticky actions */}
      <div className="sticky bottom-0 -mx-6 border-t bg-background/95 px-6 py-3 backdrop-blur">
        <div className="flex flex-wrap items-center justify-end gap-3">
          {!targetReady ? <span className="mr-auto text-xs text-muted-foreground">Pick an audience to send.</span> : null}
          <Button variant="outline" onClick={() => void submit(true)} disabled={!canDraft}>
            {busy === 'draft' ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</> : <><FileText className="h-4 w-4" /> Save draft</>}
          </Button>
          <Button onClick={() => void submit(false)} disabled={!canSend}>
            {busy === 'send' ? <><Loader2 className="h-4 w-4 animate-spin" /> Sending…</> : <><Send className="h-4 w-4" /> Send</>}
          </Button>
        </div>
      </div>
    </div>
  )
}
