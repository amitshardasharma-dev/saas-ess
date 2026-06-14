'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { TimesheetGrid } from '@/components/timesheets/timesheet-grid'
import { TimesheetSummary } from '@/components/timesheets/timesheet-summary'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useAuthStore } from '@/stores/auth'
import { timesheetService } from '@/services/timesheet'
import { Timesheet, TimesheetEntry, TimesheetConfig, Project, TimesheetApprovalEntry } from '@/types/timesheet'
import { ArrowLeft, Save, Send, CheckCircle, XCircle, Clock } from 'lucide-react'
import toast from 'react-hot-toast'

export default function TimesheetDetailPage() {
  const params = useParams()
  const router = useRouter()
  const { user, isAuthenticated, checkAuth } = useAuthStore()
  const [timesheet, setTimesheet] = useState<Timesheet | null>(null)
  const [entries, setEntries] = useState<TimesheetEntry[]>([])
  const [approvals, setApprovals] = useState<TimesheetApprovalEntry[]>([])
  const [config, setConfig] = useState<TimesheetConfig | null>(null)
  const [projects, setProjects] = useState<Project[]>([])
  const [pendingEntries, setPendingEntries] = useState<Omit<TimesheetEntry, 'id' | 'timesheet_id'>[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => { checkAuth() }, [checkAuth])

  useEffect(() => {
    if (isAuthenticated && user && params.id) {
      loadData()
    }
  }, [isAuthenticated, user, params.id])

  const loadData = async () => {
    try {
      setLoading(true)
      const [tsData, cfg, projs] = await Promise.all([
        timesheetService.getTimesheet(params.id as string),
        timesheetService.getConfig(),
        timesheetService.getProjects(),
      ])
      setTimesheet(tsData.timesheet)
      setEntries(tsData.entries)
      setApprovals(tsData.approvals || [])
      setConfig(cfg)
      setProjects(projs)
    } catch {
      toast.error('Failed to load timesheet')
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    if (!timesheet) return
    try {
      setSaving(true)
      await timesheetService.updateEntries(timesheet.id, pendingEntries)
      toast.success('Timesheet saved')
      await loadData()
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const handleSubmit = async () => {
    if (!timesheet) return
    try {
      setSubmitting(true)
      // Save first, then submit
      if (pendingEntries.length > 0) {
        await timesheetService.updateEntries(timesheet.id, pendingEntries)
      }
      await timesheetService.submitTimesheet(timesheet.id)
      toast.success('Timesheet submitted for approval')
      await loadData()
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Failed to submit')
    } finally {
      setSubmitting(false)
    }
  }

  const isEditable = timesheet && ['Draft', 'Revision Requested'].includes(timesheet.status)
  const dates = timesheet && config ? timesheetService.getPeriodDates(timesheet.period_start, timesheet.period_end) : []

  if (!isAuthenticated || !user) return null

  if (loading) {
    return (
      <DashboardLayout>
        <div className="min-h-screen fluid-bg flex items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
        </div>
      </DashboardLayout>
    )
  }

  if (!timesheet || !config) {
    return (
      <DashboardLayout>
        <div className="min-h-screen fluid-bg flex items-center justify-center">
          <p className="text-muted-foreground">Timesheet not found</p>
        </div>
      </DashboardLayout>
    )
  }

  const statusColors: Record<string, string> = {
    Draft: 'bg-gray-100 text-gray-800',
    Submitted: 'bg-amber-100 text-amber-800',
    Approved: 'bg-green-100 text-green-800',
    Rejected: 'bg-red-100 text-red-800',
    'Revision Requested': 'bg-orange-100 text-orange-800',
  }

  return (
    <DashboardLayout>
      <div className="min-h-screen fluid-bg">
        <div className="border-b border-border bg-background/50 backdrop-blur-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <Button variant="ghost" size="sm" onClick={() => router.push('/dashboard/timesheets')}>
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <div>
                  <div className="flex items-center space-x-2">
                    <h1 className="text-2xl font-bold">{timesheet.display_id}</h1>
                    <Badge className={statusColors[timesheet.status]}>{timesheet.status}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {new Date(timesheet.period_start).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                    {' — '}
                    {new Date(timesheet.period_end).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </p>
                </div>
              </div>
              {isEditable && (
                <div className="flex space-x-2">
                  <Button variant="outline" onClick={handleSave} disabled={saving}>
                    <Save className="h-4 w-4 mr-2" />{saving ? 'Saving...' : 'Save Draft'}
                  </Button>
                  <Button onClick={handleSubmit} disabled={submitting}>
                    <Send className="h-4 w-4 mr-2" />{submitting ? 'Submitting...' : 'Submit'}
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
          <TimesheetSummary
            totalHours={timesheet.total_hours}
            periodDays={dates.length}
            config={config}
          />

          <TimesheetGrid
            config={config}
            dates={dates}
            entries={entries}
            projects={projects}
            disabled={!isEditable}
            onChange={setPendingEntries}
          />

          {/* Approval Chain */}
          {approvals.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Approval Chain</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {approvals.map((a) => {
                    const Icon = a.status === 'Approved' ? CheckCircle : a.status === 'Rejected' ? XCircle : Clock
                    const color = a.status === 'Approved' ? 'text-green-600' : a.status === 'Rejected' ? 'text-red-600' : 'text-amber-500'
                    return (
                      <div key={a.id} className="flex items-center space-x-3 p-3 rounded-lg border">
                        <div className={`flex items-center justify-center w-8 h-8 rounded-full bg-muted font-semibold text-sm`}>
                          {a.level_no}
                        </div>
                        <Icon className={`h-5 w-5 ${color}`} />
                        <div className="flex-1">
                          <p className="text-sm font-medium">{a.approver_name || 'Approver'}</p>
                          <p className="text-xs text-muted-foreground">{a.status}</p>
                        </div>
                        {a.remarks && <p className="text-xs text-muted-foreground italic">&quot;{a.remarks}&quot;</p>}
                        {a.action_time && (
                          <p className="text-xs text-muted-foreground">
                            {new Date(a.action_time).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                          </p>
                        )}
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </DashboardLayout>
  )
}
