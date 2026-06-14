'use client'

import { useEffect, useState } from 'react'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { CalendarGrid } from '@/components/team/calendar-grid'
import { CalendarList } from '@/components/team/calendar-list'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/stores/auth'
import { teamCalendarService } from '@/services/team-calendar'
import { TeamLeaveEntry } from '@/types/team-calendar'
import { CalendarDays, LayoutGrid, List } from 'lucide-react'
import toast from 'react-hot-toast'

export default function TeamCalendarPage() {
  const { user, isAuthenticated, checkAuth } = useAuthStore()
  const [leaves, setLeaves] = useState<TeamLeaveEntry[]>([])
  const [employees, setEmployees] = useState<Array<{ id: string; name: string; employeeNo: string }>>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'grid' | 'list'>('grid')
  const [year, setYear] = useState(new Date().getFullYear())
  const [month, setMonth] = useState(new Date().getMonth() + 1)

  useEffect(() => { checkAuth() }, [checkAuth])

  useEffect(() => {
    if (isAuthenticated && user) loadData()
  }, [isAuthenticated, user, year, month])

  const loadData = async () => {
    try {
      setLoading(true)
      const data = await teamCalendarService.getTeamLeaves(year, month)
      setLeaves(data.leaves)
      setEmployees(data.employees)
    } catch {
      toast.error('Failed to load team calendar')
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
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-primary/10 rounded-xl">
                  <CalendarDays className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold">Team Leave Calendar</h1>
                  <p className="text-muted-foreground text-sm">View your team&apos;s leave schedule</p>
                </div>
              </div>
              <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
                <Button
                  variant={view === 'grid' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setView('grid')}
                >
                  <LayoutGrid className="h-4 w-4 mr-1" /> Calendar
                </Button>
                <Button
                  variant={view === 'list' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setView('list')}
                >
                  <List className="h-4 w-4 mr-1" /> List
                </Button>
              </div>
            </div>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {loading ? (
            <div className="animate-pulse h-64 bg-muted rounded-xl" />
          ) : view === 'grid' ? (
            <CalendarGrid
              leaves={leaves}
              employees={employees}
              year={year}
              month={month}
              onMonthChange={(y, m) => { setYear(y); setMonth(m) }}
            />
          ) : (
            <CalendarList leaves={leaves} />
          )}
        </div>
      </div>
    </DashboardLayout>
  )
}
