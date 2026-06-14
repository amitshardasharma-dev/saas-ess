// src/components/documents/acknowledgment-table.tsx

'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { CheckCircle, XCircle, ClipboardList } from 'lucide-react'

interface AckEmployee {
  id: string
  name: string
  employee_no: string
  department: string
  acknowledged: boolean
  acknowledged_at: string | null
}

interface AcknowledgmentTableProps {
  employees: AckEmployee[]
  version: number
  acknowledgedCount: number
  total: number
}

export function AcknowledgmentTable({ employees, version, acknowledgedCount, total }: AcknowledgmentTableProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-base">
          <div className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-primary" />
            Acknowledgment Status (v{version})
          </div>
          <Badge variant="outline">
            {acknowledgedCount} / {total} acknowledged
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="py-2 px-3 font-medium text-muted-foreground">Employee</th>
                <th className="py-2 px-3 font-medium text-muted-foreground">Department</th>
                <th className="py-2 px-3 font-medium text-muted-foreground">Status</th>
                <th className="py-2 px-3 font-medium text-muted-foreground">Date</th>
              </tr>
            </thead>
            <tbody>
              {employees.map(emp => (
                <tr key={emp.id} className="border-b last:border-0">
                  <td className="py-2 px-3">
                    <div>
                      <p className="font-medium">{emp.name}</p>
                      <p className="text-xs text-muted-foreground">{emp.employee_no}</p>
                    </div>
                  </td>
                  <td className="py-2 px-3 text-muted-foreground">{emp.department || '—'}</td>
                  <td className="py-2 px-3">
                    {emp.acknowledged ? (
                      <div className="flex items-center gap-1 text-green-600">
                        <CheckCircle className="h-4 w-4" />
                        <span className="text-xs">Acknowledged</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 text-amber-500">
                        <XCircle className="h-4 w-4" />
                        <span className="text-xs">Pending</span>
                      </div>
                    )}
                  </td>
                  <td className="py-2 px-3 text-xs text-muted-foreground">
                    {emp.acknowledged_at
                      ? new Date(emp.acknowledged_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
                      : '—'
                    }
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}
