'use client'

import { useEffect, useState } from 'react'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { TimesheetList } from '@/components/timesheets/timesheet-list'
import { useAuthStore } from '@/stores/auth'
import { timesheetService } from '@/services/timesheet'
import { Timesheet } from '@/types/timesheet'
import { Users } from 'lucide-react'
import toast from 'react-hot-toast'

export default function TeamTimesheetsPage() {
  const { user, isAuthenticated, checkAuth } = useAuthStore()
  const [timesheets, setTimesheets] = useState<Timesheet[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { checkAuth() }, [checkAuth])

  useEffect(() => {
    if (isAuthenticated && user) {
      loadData()
    }
  }, [isAuthenticated, user])

  const loadData = async () => {
    try {
      setLoading(true)
      const ts = await timesheetService.getTimesheets(true)
      setTimesheets(ts)
    } catch {
      toast.error('Failed to load team timesheets')
    } finally {
      setLoading(false)
    }
  }

  if (!isAuthenticated || !user) return null

  return (
    <DashboardLayout>
      <div className="min-h-screen fluid-bg">
        <div className="border-b border-border bg-background/50 backdrop-blur-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-primary/10 rounded-xl">
                <Users className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-foreground">Team Timesheets</h1>
                <p className="text-muted-foreground text-sm">Review your team's timesheet submissions</p>
              </div>
            </div>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {loading ? (
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="animate-pulse h-16 bg-muted rounded-xl" />
              ))}
            </div>
          ) : (
            <TimesheetList timesheets={timesheets} title="Team Timesheets" showEmployee />
          )}
        </div>
      </div>
    </DashboardLayout>
  )
}
