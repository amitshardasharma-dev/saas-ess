// "My compliance" — the signed-in person's required certificates + trainings
// with traffic-light status. RED until the certificate is validated or the
// training is completed. Actions deep-link to where the work is done.
'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import {
  Loader2, AlertCircle, ShieldCheck, GraduationCap, Award, CheckCircle2, ChevronRight, CircleAlert,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import type { PersonCompliance, ItemColor } from '@/lib/compliance/register'

function authHeaders(extra: HeadersInit = {}): HeadersInit {
  const token = typeof window !== 'undefined' ? localStorage.getItem('ess_access_token') : null
  return { ...extra, ...(token ? { Authorization: `Bearer ${token}` } : {}) }
}

const CHIP: Record<ItemColor, string> = {
  green: 'bg-green-100 text-green-800 hover:bg-green-100',
  amber: 'bg-amber-100 text-amber-800 hover:bg-amber-100',
  red: 'bg-red-100 text-red-800 hover:bg-red-100',
}

export function RegisterMy() {
  const [me, setMe] = useState<PersonCompliance | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(false)
    try {
      const res = await fetch('/api/compliance/register', { headers: authHeaders() })
      if (!res.ok) throw new Error('load failed')
      const data = await res.json()
      setMe((data.me ?? null) as PersonCompliance | null)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  if (loading) {
    return <Card><CardContent className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading your compliance…</CardContent></Card>
  }
  if (error) {
    return <Card><CardContent className="flex flex-col items-center gap-2 py-16 text-center text-sm text-muted-foreground"><AlertCircle className="h-10 w-10 opacity-30" /> Could not load your compliance.</CardContent></Card>
  }
  if (!me || me.total === 0) {
    return <Card><CardContent className="flex flex-col items-center gap-2 py-16 text-center text-sm text-muted-foreground"><CheckCircle2 className="h-10 w-10 opacity-30" /><p className="font-medium text-foreground">Nothing required right now</p><p>You have no assigned compliance items. We’ll let you know if that changes.</p></CardContent></Card>
  }

  const pct = me.total > 0 ? Math.round((me.complete / me.total) * 100) : 0
  const allDone = me.pending === 0

  return (
    <div className="space-y-6">
      {/* Summary */}
      <Card className={allDone ? 'border-green-200' : 'border-amber-200'}>
        <CardContent className="flex flex-wrap items-center justify-between gap-4 py-5">
          <div className="flex items-center gap-3">
            <div className={`rounded-lg p-2 ${allDone ? 'bg-green-100 text-green-600' : 'bg-amber-100 text-amber-600'}`}>
              {allDone ? <CheckCircle2 className="h-6 w-6" /> : <CircleAlert className="h-6 w-6" />}
            </div>
            <div>
              <div className="text-lg font-semibold text-foreground">{allDone ? 'You’re fully compliant' : `${me.pending} item${me.pending === 1 ? '' : 's'} need your attention`}</div>
              <div className="text-sm text-muted-foreground">{me.complete} of {me.total} complete</div>
            </div>
          </div>
          <div className="min-w-[160px] flex-1 sm:max-w-xs">
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div className={`h-full rounded-full ${allDone ? 'bg-green-500' : 'bg-amber-500'}`} style={{ width: `${pct}%` }} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Certificates */}
      <Section title="Certificates" Icon={ShieldCheck}>
        {me.certificates.length === 0 ? (
          <EmptyRow text="No certificates required." />
        ) : (
          me.certificates.map((c) => (
            <ItemRow
              key={c.cert_type_id}
              icon={<Award className="h-4 w-4 text-muted-foreground" />}
              title={c.name}
              color={c.color}
              label={c.label}
              action={
                c.color === 'green' ? null : (
                  <Button asChild size="sm" variant="outline">
                    <Link href="/dashboard/compliance">
                      {c.certification_id ? 'Manage' : 'Upload'} <ChevronRight className="h-4 w-4" />
                    </Link>
                  </Button>
                )
              }
            />
          ))
        )}
      </Section>

      {/* Trainings */}
      <Section title="Trainings" Icon={GraduationCap}>
        {me.trainings.length === 0 ? (
          <EmptyRow text="No trainings required." />
        ) : (
          me.trainings.map((t) => (
            <ItemRow
              key={t.module_id}
              icon={<GraduationCap className="h-4 w-4 text-muted-foreground" />}
              title={t.title}
              color={t.color}
              label={t.label}
              action={
                t.color === 'green' ? null : (
                  <Button asChild size="sm" variant="outline">
                    <Link href="/dashboard/training">
                      {t.status === 'in_progress' ? 'Continue' : t.status === 'expired' ? 'Redo' : 'Start'} <ChevronRight className="h-4 w-4" />
                    </Link>
                  </Button>
                )
              }
            />
          ))
        )}
      </Section>
    </div>
  )
}

function Section({ title, Icon, children }: { title: string; Icon: React.ComponentType<{ className?: string }>; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground"><Icon className="h-4 w-4 text-muted-foreground" /> {title}</h2>
      <Card><CardContent className="divide-y p-0">{children}</CardContent></Card>
    </div>
  )
}

function ItemRow({ icon, title, color, label, action }: { icon: React.ReactNode; title: string; color: ItemColor; label: string; action: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <span className={`h-2 w-2 shrink-0 rounded-full ${color === 'green' ? 'bg-green-500' : color === 'amber' ? 'bg-amber-500' : 'bg-red-500'}`} />
      {icon}
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{title}</span>
      <Badge variant="secondary" className={CHIP[color]}>{label}</Badge>
      {action}
    </div>
  )
}

function EmptyRow({ text }: { text: string }) {
  return <div className="px-4 py-6 text-center text-sm text-muted-foreground">{text}</div>
}
