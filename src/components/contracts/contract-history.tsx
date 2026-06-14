// src/components/contracts/contract-history.tsx

'use client'

import { ContractHistoryEntry } from '@/types/contract'
import { Plus, RefreshCw, XCircle, Edit } from 'lucide-react'

interface ContractHistoryProps {
  entries: ContractHistoryEntry[]
}

function getActionIcon(action: ContractHistoryEntry['action']) {
  switch (action) {
    case 'created':
      return <Plus className="h-4 w-4 text-green-600" />
    case 'renewed':
      return <RefreshCw className="h-4 w-4 text-blue-600" />
    case 'terminated':
      return <XCircle className="h-4 w-4 text-red-600" />
    case 'amended':
      return <Edit className="h-4 w-4 text-amber-600" />
    default:
      return <Edit className="h-4 w-4 text-muted-foreground" />
  }
}

function getActionIconBg(action: ContractHistoryEntry['action']) {
  switch (action) {
    case 'created':
      return 'bg-green-100'
    case 'renewed':
      return 'bg-blue-100'
    case 'terminated':
      return 'bg-red-100'
    case 'amended':
      return 'bg-amber-100'
    default:
      return 'bg-muted'
  }
}

function getActionLabel(action: ContractHistoryEntry['action']) {
  switch (action) {
    case 'created':
      return 'Created'
    case 'renewed':
      return 'Renewed'
    case 'terminated':
      return 'Terminated'
    case 'amended':
      return 'Amended'
    default:
      return action
  }
}

export function ContractHistory({ entries }: ContractHistoryProps) {
  if (entries.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4 text-center">No history entries yet.</p>
    )
  }

  return (
    <div className="space-y-0">
      {entries.map((entry, idx) => (
        <div key={entry.id} className="flex gap-3">
          {/* Timeline connector */}
          <div className="flex flex-col items-center">
            <div className={`p-1.5 rounded-full shrink-0 ${getActionIconBg(entry.action)}`}>
              {getActionIcon(entry.action)}
            </div>
            {idx < entries.length - 1 && (
              <div className="w-px flex-1 bg-border mt-1 mb-1 min-h-[1rem]" />
            )}
          </div>

          {/* Content */}
          <div className={`pb-4 flex-1 min-w-0 ${idx < entries.length - 1 ? '' : ''}`}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <span className="text-sm font-medium">{getActionLabel(entry.action)}</span>
                {entry.performer_name && (
                  <span className="text-sm text-muted-foreground"> by {entry.performer_name}</span>
                )}
              </div>
              <span className="text-xs text-muted-foreground shrink-0">
                {new Date(entry.action_date).toLocaleDateString('en-GB', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })}
              </span>
            </div>
            {entry.notes && (
              <p className="text-xs text-muted-foreground mt-0.5">{entry.notes}</p>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
