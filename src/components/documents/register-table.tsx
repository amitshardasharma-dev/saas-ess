// src/components/documents/register-table.tsx
//
// Per-document admin register: who has / hasn't completed a document, where
// "completed" means SIGNED (e-sign docs) or ACKNOWLEDGED (ack docs). One table
// drives both modes — the signed mode adds audit columns (signing location +
// a short content-hash chip for tamper-evidence). Filter to Pending vs Done.
//
// Presentational only: the page owns all data fetching. Styling matches the
// document library + acknowledgment-table (Card/Badge primitives, lucide icons,
// neutral tokens, real empty state).

'use client'

import { useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  CheckCircle2,
  Clock,
  Users,
  MapPin,
  Fingerprint,
  Search,
} from 'lucide-react'

/** A unified register row — `done` collapses signed/acknowledged. */
export interface RegisterPerson {
  id: string
  name: string
  employee_no: string | null
  department: string | null
  /** Signed (e-sign mode) OR acknowledged (ack mode). */
  done: boolean
  /** ISO timestamp of completion, or null when pending. */
  doneAt: string | null
  /** e-sign only: free-text place of signing. */
  location?: string | null
  /** e-sign only: sha256 of the signed PDF (tamper-evidence). */
  contentHash?: string | null
}

type RegisterMode = 'signed' | 'acknowledged'
type StatusFilter = 'all' | 'pending' | 'done'

interface RegisterTableProps {
  people: RegisterPerson[]
  mode: RegisterMode
}

const COPY = {
  signed: { done: 'Signed', pending: 'Awaiting signature', noun: 'signers' },
  acknowledged: { done: 'Acknowledged', pending: 'Awaiting acknowledgment', noun: 'people' },
} as const

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export function RegisterTable({ people, mode }: RegisterTableProps) {
  const [filter, setFilter] = useState<StatusFilter>('all')
  const [query, setQuery] = useState('')

  const copy = COPY[mode]
  const showAudit = mode === 'signed'

  const doneCount = useMemo(() => people.filter((p) => p.done).length, [people])
  const pendingCount = people.length - doneCount

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return people
      .filter((p) => {
        if (filter === 'pending' && p.done) return false
        if (filter === 'done' && !p.done) return false
        if (!q) return true
        return (
          p.name.toLowerCase().includes(q) ||
          (p.employee_no ?? '').toLowerCase().includes(q) ||
          (p.department ?? '').toLowerCase().includes(q)
        )
      })
      // Pending first (action-oriented), then alphabetical by name.
      .sort((a, b) => {
        if (a.done !== b.done) return a.done ? 1 : -1
        return a.name.localeCompare(b.name)
      })
  }, [people, filter, query])

  return (
    <Card>
      <CardHeader className="gap-4 pb-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-5 w-5 text-muted-foreground" />
            Register
          </CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="gap-1 text-green-700">
              <CheckCircle2 className="h-3.5 w-3.5" /> {doneCount} {copy.done.toLowerCase()}
            </Badge>
            <Badge variant="outline" className="gap-1 text-amber-700">
              <Clock className="h-3.5 w-3.5" /> {pendingCount} pending
            </Badge>
          </div>
        </div>

        {/* Controls: status filter + search */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex flex-wrap gap-2">
            <FilterChip active={filter === 'all'} onClick={() => setFilter('all')}>
              All ({people.length})
            </FilterChip>
            <FilterChip active={filter === 'pending'} onClick={() => setFilter('pending')}>
              Pending ({pendingCount})
            </FilterChip>
            <FilterChip active={filter === 'done'} onClick={() => setFilter('done')}>
              {copy.done} ({doneCount})
            </FilterChip>
          </div>
          <div className="relative ml-auto w-full max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search name, ID, team…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-9 w-full rounded-md border bg-background pl-9 pr-3 text-sm shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            />
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        {rows.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-16 text-center text-sm text-muted-foreground">
            <Users className="h-10 w-10 opacity-30" />
            {people.length === 0
              ? `No ${copy.noun} to show yet.`
              : 'No people match these filters.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="px-4 py-2.5 font-medium text-muted-foreground">Person</th>
                  <th className="px-4 py-2.5 font-medium text-muted-foreground">Team</th>
                  <th className="px-4 py-2.5 font-medium text-muted-foreground">Status</th>
                  <th className="px-4 py-2.5 font-medium text-muted-foreground">Date</th>
                  {showAudit ? (
                    <th className="px-4 py-2.5 font-medium text-muted-foreground">Audit</th>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id} className="border-b last:border-0 hover:bg-muted/40">
                    <td className="px-4 py-3">
                      <p className="font-medium text-foreground">{p.name}</p>
                      {p.employee_no ? (
                        <p className="text-xs text-muted-foreground">{p.employee_no}</p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{p.department || '—'}</td>
                    <td className="px-4 py-3">
                      {p.done ? (
                        <span className="inline-flex items-center gap-1 text-green-600">
                          <CheckCircle2 className="h-4 w-4" />
                          <span className="text-xs font-medium">{copy.done}</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-amber-600">
                          <Clock className="h-4 w-4" />
                          <span className="text-xs font-medium">Pending</span>
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{formatDate(p.doneAt)}</td>
                    {showAudit ? (
                      <td className="px-4 py-3">
                        {p.done ? (
                          <div className="flex flex-wrap items-center gap-1.5">
                            {p.location ? (
                              <Badge variant="outline" className="gap-1 font-normal text-muted-foreground">
                                <MapPin className="h-3 w-3" /> {p.location}
                              </Badge>
                            ) : null}
                            {p.contentHash ? (
                              <Badge
                                variant="outline"
                                title={p.contentHash}
                                className="gap-1 font-mono text-[10px] font-normal text-muted-foreground"
                              >
                                <Fingerprint className="h-3 w-3" /> {p.contentHash.slice(0, 10)}
                              </Badge>
                            ) : null}
                            {!p.location && !p.contentHash ? (
                              <span className="text-xs text-muted-foreground">—</span>
                            ) : null}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <Badge
      variant={active ? 'default' : 'outline'}
      className="cursor-pointer select-none"
      onClick={onClick}
    >
      {children}
    </Badge>
  )
}
