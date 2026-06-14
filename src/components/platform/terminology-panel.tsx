'use client'

import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { Type } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { platformService } from '@/services/platform'
import { DEFAULT_LABELS, TERM_KEYS, TermKey } from '@/lib/labels/defaults'

interface TerminologyPanelProps {
  companyId: string
}

type Draft = Record<TermKey, { singular: string; plural: string }>

function emptyDraft(): Draft {
  const draft = {} as Draft
  for (const key of TERM_KEYS) {
    draft[key] = { ...DEFAULT_LABELS[key] }
  }
  return draft
}

/**
 * Platform-side per-tenant terminology editor. Each term shows the effective
 * singular/plural (override or default); Save upserts one override row. Empty
 * placeholders show the platform default so admins see the fallback.
 */
export function TerminologyPanel({ companyId }: TerminologyPanelProps) {
  const [draft, setDraft] = useState<Draft>(emptyDraft)
  const [loading, setLoading] = useState(true)
  const [savingKey, setSavingKey] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    platformService
      .getTenantLabels(companyId)
      .then(overrides => {
        if (!active) return
        const next = emptyDraft()
        for (const row of overrides) {
          if ((TERM_KEYS as readonly string[]).includes(row.term_key)) {
            next[row.term_key as TermKey] = { singular: row.singular, plural: row.plural }
          }
        }
        setDraft(next)
      })
      .catch(() => toast.error('Failed to load terminology'))
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [companyId])

  const update = (key: TermKey, field: 'singular' | 'plural', value: string) => {
    setDraft(prev => ({ ...prev, [key]: { ...prev[key], [field]: value } }))
  }

  const save = async (key: TermKey) => {
    const { singular, plural } = draft[key]
    if (!singular.trim() || !plural.trim()) {
      toast.error('Singular and plural are required')
      return
    }
    setSavingKey(key)
    try {
      await platformService.updateTenantLabel(companyId, { termKey: key, singular, plural })
      toast.success('Terminology updated')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update terminology')
    } finally {
      setSavingKey(null)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Type className="h-5 w-5 text-primary" /> Terminology
        </CardTitle>
        <CardDescription>
          Rename core concepts for this tenant. Blank fields fall back to platform defaults.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="space-y-3">
            {TERM_KEYS.map(key => (
              <div key={key} className="h-16 bg-muted/40 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {TERM_KEYS.map(key => (
              <div key={key} className="rounded-lg border border-border p-3">
                <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {key.replace(/_/g, ' ')}
                </div>
                <div className="flex flex-col sm:flex-row sm:items-end gap-2">
                  <div className="flex-1">
                    <Label className="text-xs text-muted-foreground">Singular</Label>
                    <input
                      className="mt-1 w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      value={draft[key].singular}
                      placeholder={DEFAULT_LABELS[key].singular}
                      onChange={e => update(key, 'singular', e.target.value)}
                      aria-label={`${key} singular`}
                    />
                  </div>
                  <div className="flex-1">
                    <Label className="text-xs text-muted-foreground">Plural</Label>
                    <input
                      className="mt-1 w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      value={draft[key].plural}
                      placeholder={DEFAULT_LABELS[key].plural}
                      onChange={e => update(key, 'plural', e.target.value)}
                      aria-label={`${key} plural`}
                    />
                  </div>
                  <Button
                    size="sm"
                    onClick={() => save(key)}
                    disabled={savingKey === key}
                    className="shrink-0"
                  >
                    {savingKey === key ? 'Saving...' : 'Save'}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
