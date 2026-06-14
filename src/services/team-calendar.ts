// src/services/team-calendar.ts

import { TeamLeaveEntry, TeamMemberBalance } from '@/types/team-calendar'

const getToken = () => typeof window !== 'undefined' ? localStorage.getItem('ess_access_token') : null
const authHeaders = (): HeadersInit => {
  const token = getToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export const teamCalendarService = {
  async getTeamLeaves(year: number, month: number): Promise<{
    leaves: TeamLeaveEntry[]
    employees: Array<{ id: string; name: string; employeeNo: string }>
  }> {
    const res = await fetch(`/api/team-calendar?year=${year}&month=${month}`, { headers: authHeaders() })
    if (!res.ok) return { leaves: [], employees: [] }
    return res.json()
  },

  async getTeamBalances(): Promise<TeamMemberBalance[]> {
    const res = await fetch('/api/team-balances', { headers: authHeaders() })
    if (!res.ok) return []
    const data = await res.json()
    return data.members || []
  },
}
