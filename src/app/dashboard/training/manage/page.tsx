// src/app/dashboard/training/manage/page.tsx
//
// Staff/Admin module list + create. Links to the per-module builder. Role-gated
// (hr+) at the data layer; the nav already hides this for volunteers.

'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { trainingService } from '@/services/training'
import { useAuthStore } from '@/stores/auth'
import type { TrainingModule } from '@/types/training'
import toast from 'react-hot-toast'

export default function ManageTrainingPage() {
  const { user, isAuthenticated, checkAuth } = useAuthStore()
  const [modules, setModules] = useState<TrainingModule[]>([])
  const [loading, setLoading] = useState(true)
  const [title, setTitle] = useState('')
  const [creating, setCreating] = useState(false)

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
      setModules(await trainingService.getModules(true))
    } catch {
      toast.error('Failed to load modules')
    } finally {
      setLoading(false)
    }
  }

  const create = async () => {
    if (!title.trim()) return
    try {
      setCreating(true)
      await trainingService.createModule({ title: title.trim() })
      setTitle('')
      toast.success('Module created')
      await load()
    } catch {
      toast.error('Failed to create module')
    } finally {
      setCreating(false)
    }
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold">Manage Training</h1>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">New module</CardTitle>
          </CardHeader>
          <CardContent className="flex gap-2">
            <Input
              placeholder="Module title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <Button onClick={create} disabled={creating || !title.trim()}>
              Create
            </Button>
          </CardContent>
        </Card>

        {loading ? (
          <p className="text-sm text-gray-500">Loading…</p>
        ) : (
          <div className="space-y-2">
            {modules.map((m) => (
              <Link key={m.id} href={`/dashboard/training/manage/${m.id}`}>
                <Card className="cursor-pointer hover:bg-gray-50">
                  <CardContent className="flex items-center justify-between py-4">
                    <div>
                      <p className="font-medium">{m.title}</p>
                      {m.description && <p className="text-sm text-gray-500">{m.description}</p>}
                    </div>
                    <Badge
                      variant={
                        m.status === 'published'
                          ? 'default'
                          : m.status === 'archived'
                            ? 'outline'
                            : 'secondary'
                      }
                    >
                      {m.status}
                    </Badge>
                  </CardContent>
                </Card>
              </Link>
            ))}
            {modules.length === 0 && (
              <p className="text-sm text-gray-500">No modules yet. Create one above.</p>
            )}
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}
