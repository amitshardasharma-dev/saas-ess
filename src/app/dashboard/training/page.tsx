// src/app/dashboard/training/page.tsx
//
// Volunteer learning view: the modules assigned to me, each with progress and a
// player. Module-gated on 'training'; uses the label resolver for the section
// noun (training_module).

'use client'

import { useEffect, useState } from 'react'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ProgressBar } from '@/components/training/progress-bar'
import { ModulePlayer } from '@/components/training/module-player'
import { trainingService } from '@/services/training'
import { useAuthStore } from '@/stores/auth'
import { useLabels } from '@/hooks/use-labels'
import type { AssignedModule } from '@/types/training'
import { GraduationCap } from 'lucide-react'
import toast from 'react-hot-toast'

export default function TrainingPage() {
  const { user, isAuthenticated, checkAuth } = useAuthStore()
  const { t } = useLabels()
  const [modules, setModules] = useState<AssignedModule[]>([])
  const [loading, setLoading] = useState(true)
  const [activeId, setActiveId] = useState<string | null>(null)

  useEffect(() => {
    checkAuth()
  }, [checkAuth])

  useEffect(() => {
    if (isAuthenticated && user) load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, user])

  const load = async () => {
    try {
      setLoading(true)
      const data = await trainingService.getAssignedModules()
      setModules(data)
    } catch {
      toast.error('Failed to load training')
    } finally {
      setLoading(false)
    }
  }

  const active = modules.find((m) => m.id === activeId) ?? null

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <GraduationCap className="h-6 w-6 text-gray-700" />
          <h1 className="text-2xl font-semibold">{t('training_module', { plural: true })}</h1>
        </div>

        {loading ? (
          <p className="text-sm text-gray-500">Loading…</p>
        ) : active ? (
          <div className="space-y-4">
            <Button variant="ghost" onClick={() => setActiveId(null)}>
              ← Back to all
            </Button>
            <h2 className="text-xl font-medium">{active.title}</h2>
            {active.description && <p className="text-sm text-gray-600">{active.description}</p>}
            <ModulePlayer module={active} onProgress={load} />
          </div>
        ) : modules.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-gray-500">
              Nothing assigned to you yet.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {modules.map((m) => {
              const remaining = m.items.filter((i) => i.required && i.progress?.status !== 'complete').length
              return (
                <Card key={m.id} className="flex flex-col">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base">{m.title}</CardTitle>
                      <Badge variant={m.module_status === 'complete' ? 'default' : 'secondary'}>
                        {m.module_status === 'complete' ? 'Complete' : m.module_status === 'in_progress' ? 'In progress' : 'Not started'}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="flex flex-1 flex-col gap-3">
                    {m.description && <p className="text-sm text-gray-600">{m.description}</p>}
                    <ProgressBar percent={m.percent_complete} />
                    <p className="text-xs text-gray-500">
                      {remaining === 0 ? 'All required items done' : `${remaining} required item(s) remaining`}
                    </p>
                    <Button className="mt-auto" onClick={() => setActiveId(m.id)}>
                      {m.module_status === 'not_started' ? 'Start' : 'Continue'}
                    </Button>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}
