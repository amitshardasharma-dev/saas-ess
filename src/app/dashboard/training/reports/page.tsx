// src/app/dashboard/training/reports/page.tsx
//
// Staff/Admin progress overview: all employees' module progress (scope=all).
// Feeds the simple in-app view; Phase 7 builds richer reporting on the same API.

'use client'

import { useEffect, useState } from 'react'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ProgressBar } from '@/components/training/progress-bar'
import { trainingService } from '@/services/training'
import { useAuthStore } from '@/stores/auth'
import type { TrainingModule, TrainingProgress } from '@/types/training'
import toast from 'react-hot-toast'

export default function TrainingReportsPage() {
  const { user, isAuthenticated, checkAuth } = useAuthStore()
  const [progress, setProgress] = useState<TrainingProgress[]>([])
  const [modules, setModules] = useState<TrainingModule[]>([])
  const [loading, setLoading] = useState(true)

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
      const [prog, mods] = await Promise.all([
        trainingService.getProgress('all'),
        trainingService.getModules(true),
      ])
      setProgress(prog)
      setModules(mods)
    } catch {
      toast.error('Failed to load progress')
    } finally {
      setLoading(false)
    }
  }

  const moduleTitle = (id: string) => modules.find((m) => m.id === id)?.title ?? id

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold">Training Progress</h1>
        {loading ? (
          <p className="text-sm text-gray-500">Loading…</p>
        ) : progress.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-gray-500">
              No progress recorded yet.
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">All volunteer progress</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {progress.map((p) => (
                <div key={p.id} className="flex items-center gap-4 border-b py-2 last:border-0">
                  <div className="w-1/3 truncate text-sm font-medium">{moduleTitle(p.module_id)}</div>
                  <div className="flex-1">
                    <ProgressBar percent={p.percent_complete} />
                  </div>
                  <Badge variant={p.status === 'complete' ? 'default' : 'secondary'}>
                    {p.status}
                  </Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  )
}
