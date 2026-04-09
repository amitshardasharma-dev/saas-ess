'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { TimesheetList } from '@/components/timesheets/timesheet-list'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/stores/auth'
import { timesheetService } from '@/services/timesheet'
import { Timesheet, TimesheetConfig } from '@/types/timesheet'
import { Plus, Timer } from 'lucide-react'
import toast from 'react-hot-toast'

export default function TimesheetsPage() {
  const router = useRouter()
  const { user, isAuthenticated, checkAuth } = useAuthStore()
  const [timesheets, setTimesheets] = useState<Timesheet[]>([])
  const [config, setConfig] = useState<TimesheetConfig | null>(null)
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
      const [ts, cfg] = await Promise.all([
        timesheetService.getTimesheets(),
        timesheetService.getConfig(),
      ])
      setTimesheets(ts)
      setConfig(cfg)
    } catch (error) {
      toast.error('Failed to load timesheets')
    } finally {
      setLoading(false)
    }
  }

  const handleCreateNew = async () => {
    if (!config) return
    try {
      const { start, end } = timesheetService.getCurrentPeriod(config)

      // Check if a timesheet already exists for this period
      const existing = timesheets.find(
        ts => ts.period_start === start && ts.period_end === end
      )
      if (existing) {
        router.push(`/dashboard/timesheets/${existing.id}`)
        return
      }

      const result = await timesheetService.createTimesheet(start, end)
      toast.success(`Timesheet ${result.display_id} created`)
      router.push(`/dashboard/timesheets/${result.timesheet.id}`)
    } catch (error) {
      toast.error('Failed to create timesheet')
    }
  }

  if (!isAuthenticated || !user) return null

  return (
    <DashboardLayout>
      <div className="min-h-screen fluid-bg">
        <div className="border-b border-border bg-background/50 backdrop-blur-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-primary/10 rounded-xl">
                  <Timer className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-foreground">My Timesheets</h1>
                  <p className="text-muted-foreground text-sm">Submit and track your timesheets</p>
                </div>
              </div>
              <Button onClick={handleCreateNew} disabled={!config}>
                <Plus className="h-4 w-4 mr-2" /> New Timesheet
              </Button>
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
            <TimesheetList timesheets={timesheets} />
          )}
        </div>
      </div>
    </DashboardLayout>
  )
}
