// src/hooks/use-labels.ts

import { useEffect, useState } from 'react'
import { DEFAULT_LABELS, TermKey } from '@/lib/labels/defaults'
import { LabelOptions, ResolvedLabels, makeLabelFn } from '@/lib/labels/resolve'

interface UseLabelsReturn {
  labels: ResolvedLabels
  loading: boolean
  t: (key: TermKey, options?: LabelOptions) => string
}

/**
 * Fetch the resolved terminology map for the current company once, then cache
 * it at module scope so repeated mounts don't refetch (mirrors useModules).
 * `t` is always callable — it falls back to platform defaults until loaded.
 */
let cache: ResolvedLabels | null = null
let inflight: Promise<ResolvedLabels> | null = null

async function fetchLabels(): Promise<ResolvedLabels> {
  if (cache) return cache
  if (inflight) return inflight
  inflight = (async () => {
    const token = localStorage.getItem('ess_access_token')
    const res = await fetch('/api/labels', {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
    if (!res.ok) throw new Error('Failed to load labels')
    const data = await res.json()
    cache = data.labels as ResolvedLabels
    return cache
  })()
  return inflight
}

export function useLabels(): UseLabelsReturn {
  const [labels, setLabels] = useState<ResolvedLabels>(cache ?? DEFAULT_LABELS)
  const [loading, setLoading] = useState(!cache)

  useEffect(() => {
    let active = true
    if (cache) {
      setLabels(cache)
      setLoading(false)
      return
    }
    fetchLabels()
      .then(map => {
        if (!active) return
        setLabels(map)
        setLoading(false)
      })
      .catch(() => {
        if (!active) return
        // Keep defaults on failure.
        setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  const t = (key: TermKey, options?: LabelOptions) => makeLabelFn(labels)(key, options)

  return { labels, loading, t }
}
