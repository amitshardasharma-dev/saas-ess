// /dashboard/compliance-register — the Compliance Document Register.
// Role-aware tabs:
//   • Everyone: "My compliance" (their required certs + trainings, RED until done)
//   • hr+:      "Organisation" overview + CSV export
//   • admin:    "Requirements" manager (define what's required, for whom)
'use client'

import { useEffect, useState } from 'react'
import { useAuthStore } from '@/stores/auth'
import { hasMinRole, type UserRole } from '@/types/roles'
import { Card, CardContent } from '@/components/ui/card'
import { Loader2 } from 'lucide-react'
import { RegisterMy } from '@/components/compliance/register-my'
import { RegisterOrg } from '@/components/compliance/register-org'
import { RegisterRequirements } from '@/components/compliance/register-requirements'

type Tab = 'my' | 'org' | 'requirements'

export default function ComplianceRegisterPage() {
  const { user, isAuthenticated, checkAuth } = useAuthStore()
  useEffect(() => { checkAuth() }, [checkAuth])

  const role = (user?.role || 'employee') as UserRole
  const isStaff = hasMinRole(role, 'hr')
  const isAdmin = role === 'admin'
  const [tab, setTab] = useState<Tab>('my')

  // Staff/admin land on the org overview by default; volunteers on their own.
  useEffect(() => { if (isStaff) setTab('org') }, [isStaff])

  if (!isAuthenticated || !user) {
    return (
      <div className="mx-auto w-full max-w-5xl p-6">
        <Card><CardContent className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</CardContent></Card>
      </div>
    )
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'my', label: 'My compliance' },
    ...(isStaff ? [{ key: 'org' as Tab, label: 'Organisation' }] : []),
    ...(isAdmin ? [{ key: 'requirements' as Tab, label: 'Requirements' }] : []),
  ]

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Compliance Register</h1>
        <p className="mt-1 text-sm text-muted-foreground">Required certificates &amp; trainings — and where each person stands.</p>
      </div>

      {tabs.length > 1 ? (
        <div className="flex gap-1 border-b">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors ${tab === t.key ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      ) : null}

      {tab === 'my' ? <RegisterMy /> : tab === 'org' && isStaff ? <RegisterOrg /> : tab === 'requirements' && isAdmin ? <RegisterRequirements /> : <RegisterMy />}
    </div>
  )
}
