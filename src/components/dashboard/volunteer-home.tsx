'use client'

// Volunteer Dashboard home — a welcoming, on-brand overview of the things a
// volunteer actually cares about: onboarding progress, training, certifications,
// documents that need action, unread messages, and the latest updates.
//
// Data sources (all self-scoped, Bearer-authed from the browser):
//   GET /api/portal/home  -> training / certifications / documents(signed) /
//                            messages + counts (see api/portal/home/route.ts)
//   GET /api/onboarding   -> { state, steps }; we compute % the same way the
//                            onboarding checklist does (done|skipped / total)
//   documentService.getDocuments() -> the volunteer-visible library, so the
//                            "needs action" stat matches the Documents page.
//
// Styling matches the onboarding/documents reference pages: Card/Button/Badge,
// lucide icons, neutral tokens, ProgressBar for percentages, real loading and
// empty states. No fluid-bg / gradients / DashboardLayout.

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import {
  ArrowRight,
  BadgeCheck,
  Bell,
  CheckCircle2,
  FileText,
  GraduationCap,
  Inbox,
  ListChecks,
  Mail,
  type LucideIcon,
} from 'lucide-react'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ProgressBar } from '@/components/training/progress-bar'
import { documentService } from '@/services/document'
import type { DocumentWithVersion } from '@/types/document'
import type { OnboardingState, OnboardingStep } from '@/types/onboarding'

// Bearer header — the portal/onboarding APIs (withAuth) require it.
function authHeaders(): HeadersInit {
  const token = typeof window !== 'undefined' ? localStorage.getItem('ess_access_token') : null
  return token ? { Authorization: `Bearer ${token}` } : {}
}

// Same "needs your action" rule the Documents page uses.
const needsAction = (d: DocumentWithVersion) =>
  (d.signable && !d.signed) || (d.requires_acknowledgment && !d.acknowledged)

interface PortalMessage {
  recipient_id: string
  subject: string
  sent_at: string | null
  read_at: string | null
}

interface PortalHome {
  training: { status?: string }[]
  certifications: { status?: string }[]
  messages: PortalMessage[]
  counts: {
    training: number
    certifications: number
    documents: number
    unreadMessages: number
  }
}

interface OnboardingResponse {
  state: OnboardingState | null
  steps: OnboardingStep[]
}

interface VolunteerData {
  onboardingPct: number
  onboardingResolved: number
  onboardingTotal: number
  onboardingComplete: boolean
  trainingTotal: number
  trainingInProgress: number
  trainingComplete: number
  certsTotal: number
  certsAttention: number
  docsNeedAction: number
  unreadMessages: number
  updates: PortalMessage[]
}

const EMPTY: VolunteerData = {
  onboardingPct: 0,
  onboardingResolved: 0,
  onboardingTotal: 0,
  onboardingComplete: false,
  trainingTotal: 0,
  trainingInProgress: 0,
  trainingComplete: 0,
  certsTotal: 0,
  certsAttention: 0,
  docsNeedAction: 0,
  unreadMessages: 0,
  updates: [],
}

function relativeDate(iso: string | null): string {
  if (!iso) return ''
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const days = Math.round((Date.now() - then) / 86_400_000)
  if (days <= 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days} days ago`
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

// ── Stat card ──────────────────────────────────────────────────────────────
interface StatCardProps {
  href: string
  icon: LucideIcon
  label: string
  value: string
  hint?: string
  children?: React.ReactNode
}

function StatCard({ href, icon: Icon, label, value, hint, children }: StatCardProps) {
  return (
    <Link
      href={href}
      className="group rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <Card className="h-full gap-3 py-5 transition-colors group-hover:border-foreground/20 group-hover:bg-accent/40">
        <CardHeader className="px-5">
          <div className="flex items-center justify-between">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <Icon className="h-5 w-5" />
            </span>
            <ArrowRight className="h-4 w-4 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5 group-hover:text-muted-foreground" />
          </div>
        </CardHeader>
        <CardContent className="space-y-1 px-5">
          <p className="text-3xl font-semibold tabular-nums text-foreground">{value}</p>
          <p className="text-sm font-medium text-foreground">{label}</p>
          {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
          {children}
        </CardContent>
      </Card>
    </Link>
  )
}

// ── Loading skeleton ─────────────────────────────────────────────────────────
function HomeSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading your dashboard">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Card key={i} className="gap-3 py-5">
            <CardHeader className="px-5">
              <div className="h-9 w-9 animate-pulse rounded-lg bg-muted" />
            </CardHeader>
            <CardContent className="space-y-2 px-5">
              <div className="h-8 w-16 animate-pulse rounded bg-muted" />
              <div className="h-4 w-24 animate-pulse rounded bg-muted" />
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardContent className="space-y-3 py-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-5 w-full animate-pulse rounded bg-muted" />
          ))}
        </CardContent>
      </Card>
    </div>
  )
}

export function VolunteerHome({ firstName }: { firstName?: string }) {
  const [data, setData] = useState<VolunteerData>(EMPTY)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [homeRes, onbRes, docs] = await Promise.all([
        fetch('/api/portal/home', { headers: authHeaders() })
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null) as Promise<{ data: PortalHome } | null>,
        fetch('/api/onboarding', { headers: authHeaders() })
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null) as Promise<OnboardingResponse | null>,
        documentService.getDocuments().catch(() => [] as DocumentWithVersion[]),
      ])

      const home = homeRes?.data
      const training = home?.training ?? []
      const certifications = home?.certifications ?? []
      const messages = home?.messages ?? []

      // Onboarding %: resolved (done|skipped) over total — matches the checklist.
      const steps = onbRes?.steps ?? []
      const onbTotal = steps.length
      const onbResolved = steps.filter((s) => s.status === 'done' || s.status === 'skipped').length
      const onbPct = onbTotal > 0 ? Math.round((onbResolved / onbTotal) * 100) : 0

      const updates = [...messages].sort((a, b) => {
        const ta = a.sent_at ? new Date(a.sent_at).getTime() : 0
        const tb = b.sent_at ? new Date(b.sent_at).getTime() : 0
        return tb - ta
      })

      setData({
        onboardingPct: onbPct,
        onboardingResolved: onbResolved,
        onboardingTotal: onbTotal,
        onboardingComplete: onbTotal > 0 && onbResolved === onbTotal,
        trainingTotal: training.length,
        trainingInProgress: training.filter((t) => t.status === 'in_progress').length,
        trainingComplete: training.filter((t) => t.status === 'complete').length,
        certsTotal: certifications.length,
        certsAttention: certifications.filter((c) => c.status === 'expiring' || c.status === 'expired').length,
        docsNeedAction: docs.filter(needsAction).length,
        unreadMessages: home?.counts.unreadMessages ?? messages.filter((m) => !m.read_at).length,
        updates,
      })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  // Friendly, time-aware greeting.
  const hour = new Date().getHours()
  const partOfDay = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening'
  const greeting = firstName ? `Good ${partOfDay}, ${firstName}` : `Good ${partOfDay}`

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-foreground">{greeting}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Here&apos;s your volunteer hub — pick up where you left off.
        </p>
      </div>

      {loading ? (
        <HomeSkeleton />
      ) : (
        <>
          {/* Stat cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {/* Onboarding — with progress bar + continue CTA */}
            <Link
              href="/dashboard/onboarding"
              className="group rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:col-span-2 lg:col-span-3 xl:col-span-2"
            >
              <Card className="h-full gap-3 py-5 transition-colors group-hover:border-foreground/20 group-hover:bg-accent/40">
                <CardHeader className="px-5">
                  <div className="flex items-center justify-between">
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                      <ListChecks className="h-5 w-5" />
                    </span>
                    {data.onboardingComplete ? (
                      <Badge variant="secondary" className="bg-green-100 text-green-800 hover:bg-green-100">
                        <CheckCircle2 className="h-3.5 w-3.5" /> All done
                      </Badge>
                    ) : (
                      <span className="inline-flex items-center text-sm font-medium text-primary">
                        Continue onboarding
                        <ArrowRight className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                      </span>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-2 px-5">
                  <p className="text-sm font-medium text-foreground">Onboarding</p>
                  {data.onboardingTotal > 0 ? (
                    <>
                      <ProgressBar percent={data.onboardingPct} />
                      <p className="text-xs text-muted-foreground">
                        {data.onboardingResolved} of {data.onboardingTotal} steps complete
                      </p>
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">No steps assigned yet.</p>
                  )}
                </CardContent>
              </Card>
            </Link>

            <StatCard
              href="/dashboard/training"
              icon={GraduationCap}
              label="Training"
              value={String(data.trainingTotal)}
              hint={
                data.trainingTotal === 0
                  ? 'Nothing assigned'
                  : data.trainingInProgress > 0
                    ? `${data.trainingInProgress} in progress`
                    : `${data.trainingComplete} complete`
              }
            />

            <StatCard
              href="/dashboard/compliance"
              icon={BadgeCheck}
              label="Certifications"
              value={String(data.certsTotal)}
              hint={
                data.certsAttention > 0
                  ? `${data.certsAttention} need${data.certsAttention === 1 ? 's' : ''} attention`
                  : data.certsTotal === 0
                    ? 'None on file'
                    : 'All up to date'
              }
            />

            <StatCard
              href="/dashboard/documents"
              icon={FileText}
              label="Documents"
              value={String(data.docsNeedAction)}
              hint={data.docsNeedAction > 0 ? 'Need your action' : 'Nothing to sign'}
            />

            <StatCard
              href="/dashboard/communications"
              icon={Mail}
              label="Messages"
              value={String(data.unreadMessages)}
              hint={data.unreadMessages > 0 ? 'Unread' : 'All caught up'}
            />
          </div>

          {/* Latest updates */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Bell className="h-4 w-4 text-muted-foreground" />
                  Latest updates
                </CardTitle>
                {data.updates.length > 0 ? (
                  <Button asChild variant="link" size="sm" className="h-auto p-0">
                    <Link href="/dashboard/communications">
                      View all
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </Button>
                ) : null}
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {data.updates.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-12 text-center text-sm text-muted-foreground">
                  <Inbox className="h-10 w-10 opacity-30" />
                  You&apos;re all caught up — no new updates.
                </div>
              ) : (
                <ul className="divide-y">
                  {data.updates.slice(0, 5).map((m) => {
                    const unread = !m.read_at
                    return (
                      <li key={m.recipient_id}>
                        <Link
                          href="/dashboard/communications"
                          className="flex items-start gap-3 px-6 py-3.5 transition-colors hover:bg-accent/40"
                        >
                          <span
                            className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${unread ? 'bg-primary' : 'bg-transparent'}`}
                            aria-hidden
                          />
                          <span className="min-w-0 flex-1">
                            <span
                              className={`block truncate text-sm ${unread ? 'font-semibold text-foreground' : 'font-medium text-foreground'}`}
                            >
                              {m.subject}
                            </span>
                            <span className="text-xs text-muted-foreground">{relativeDate(m.sent_at)}</span>
                          </span>
                          {unread ? (
                            <Badge variant="secondary" className="shrink-0">
                              New
                            </Badge>
                          ) : null}
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
