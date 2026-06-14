'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Users } from 'lucide-react'
import { TeamMemberBalance } from '@/types/team-calendar'

interface TeamBalancesTableProps {
  members: TeamMemberBalance[]
}

export function TeamBalancesTable({ members }: TeamBalancesTableProps) {
  if (members.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          <Users className="h-8 w-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">No direct reports found</p>
        </CardContent>
      </Card>
    )
  }

  // Collect all leave types across members
  const allLeaveTypes = Array.from(
    new Set(members.flatMap(m => m.balances.map(b => b.leaveType)))
  )

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Users className="h-5 w-5 text-primary" />
          Team Leave Balances ({new Date().getFullYear()})
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 px-3 font-medium text-muted-foreground sticky left-0 bg-background">Employee</th>
                {allLeaveTypes.map(lt => (
                  <th key={lt} className="text-center py-2 px-2 font-medium text-muted-foreground" colSpan={3}>
                    <div className="text-xs">{lt}</div>
                    <div className="flex text-[10px] text-muted-foreground/70 mt-0.5">
                      <span className="flex-1">Alloc</span>
                      <span className="flex-1">Taken</span>
                      <span className="flex-1">Left</span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {members.map(m => (
                <tr key={m.employeeId} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="py-2 px-3 sticky left-0 bg-background">
                    <div className="font-medium">{m.employeeName}</div>
                    <div className="text-xs text-muted-foreground">{m.department || m.employeeNo}</div>
                  </td>
                  {allLeaveTypes.map(lt => {
                    const bal = m.balances.find(b => b.leaveType === lt)
                    const remaining = bal?.remaining ?? 0
                    const lowBalance = remaining <= 2 && (bal?.allocated ?? 0) > 0
                    return (
                      <td key={lt} className="text-center py-2" colSpan={3}>
                        <div className="flex text-xs">
                          <span className="flex-1">{bal?.allocated ?? 0}</span>
                          <span className="flex-1 text-muted-foreground">{bal?.taken ?? 0}</span>
                          <span className={`flex-1 font-semibold ${lowBalance ? 'text-red-500' : 'text-green-600'}`}>
                            {remaining}
                          </span>
                        </div>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}
