'use client'

import { useEffect, useState } from 'react'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { TeamBalancesTable } from '@/components/team/team-balances-table'
import { useAuthStore } from '@/stores/auth'
import { teamCalendarService } from '@/services/team-calendar'
import { TeamMemberBalance } from '@/types/team-calendar'
import { Users } from 'lucide-react'
import toast from 'react-hot-toast'

export default function TeamBalancesPage() {
  const { user, isAuthenticated, checkAuth } = useAuthStore()
  const [members, setMembers] = useState<TeamMemberBalance[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { checkAuth() }, [checkAuth])

  useEffect(() => {
    if (isAuthenticated && user) loadData()
  }, [isAuthenticated, user])

  const loadData = async () => {
    try {
      setLoading(true)
      const data = await teamCalendarService.getTeamBalances()
      setMembers(data)
    } catch {
      toast.error('Failed to load team balances')
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
                <h1 className="text-2xl font-bold">Team Leave Balances</h1>
                <p className="text-muted-foreground text-sm">View your team&apos;s leave allocation and usage</p>
              </div>
            </div>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {loading ? (
            <div className="animate-pulse h-48 bg-muted rounded-xl" />
          ) : (
            <TeamBalancesTable members={members} />
          )}
        </div>
      </div>
    </DashboardLayout>
  )
}
