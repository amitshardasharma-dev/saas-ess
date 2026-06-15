// src/hooks/use-modules.ts

import { useState, useEffect } from 'react'
import { ModuleId } from '@/types/roles'

interface UseModulesReturn {
  modules: ModuleId[]
  loading: boolean
  isModuleEnabled: (moduleId: ModuleId) => boolean
}

// The per-tenant module set rarely changes between sessions, but it's fetched
// from /api/modules asynchronously — so on a cold render the sidebar would show
// only the ungated items (Dashboard, Profile) until that request resolves, then
// the rest of the nav would "pop in" a few hundred ms later. We cache the last
// known module set in localStorage and hydrate from it synchronously (via lazy
// useState initializers) so the full nav paints on the first client render, then
// revalidate in the background. The cache is cleared on logout (see auth-proxy)
// so a different tenant never sees stale nav.
const MODULES_CACHE_KEY = 'ess_modules_enabled'

function readCachedModules(): ModuleId[] | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(MODULES_CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as ModuleId[]) : null
  } catch {
    return null
  }
}

function writeCachedModules(modules: ModuleId[]): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(MODULES_CACHE_KEY, JSON.stringify(modules))
  } catch {
    /* localStorage unavailable (private mode / quota) — non-fatal */
  }
}

export function useModules(): UseModulesReturn {
  // Hydrate synchronously from the cached module set so the full nav renders on
  // the first client paint instead of popping in after the fetch resolves.
  const [modules, setModules] = useState<ModuleId[]>(() => readCachedModules() ?? [])
  // Only surface a loading state when there's no cache to render from yet.
  const [loading, setLoading] = useState<boolean>(() => readCachedModules() === null)

  useEffect(() => {
    let cancelled = false

    const fetchModules = async () => {
      const hadCache = readCachedModules() !== null
      try {
        const token = localStorage.getItem('ess_access_token')
        const response = await fetch('/api/modules', {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        })

        if (!response.ok) {
          // Only fall back to defaults when there's nothing cached; otherwise
          // keep the cached nav rather than collapsing it on a transient error.
          if (!hadCache && !cancelled) setModules(['leave', 'expense'])
          return
        }

        const data = await response.json()
        const next: ModuleId[] = Array.isArray(data.modules_enabled)
          ? data.modules_enabled
          : ['leave', 'expense']
        if (!cancelled) setModules(next)
        writeCachedModules(next)
      } catch {
        if (!hadCache && !cancelled) setModules(['leave', 'expense'])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchModules()
    return () => {
      cancelled = true
    }
  }, [])

  const isModuleEnabled = (moduleId: ModuleId) => modules.includes(moduleId)

  return { modules, loading, isModuleEnabled }
}
