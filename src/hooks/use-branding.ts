// Per-tenant branding (logo + name) for the portal chrome. Hydrates
// synchronously from a localStorage cache so the sidebar doesn't flash the
// default, then revalidates from /api/settings. Cleared on logout (auth-proxy).
import { useEffect, useState } from 'react'

export interface Branding {
  name: string
  logoUrl: string | null
}

const CACHE_KEY = 'ess_branding'
const DEFAULT: Branding = { name: 'ESS Portal', logoUrl: null }

function readCache(): Branding | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed.name === 'string') return { name: parsed.name, logoUrl: parsed.logoUrl ?? null }
    return null
  } catch {
    return null
  }
}
function writeCache(b: Branding): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(b))
  } catch {
    /* non-fatal */
  }
}

export function useBranding(): Branding {
  const [branding, setBranding] = useState<Branding>(() => readCache() ?? DEFAULT)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const token = localStorage.getItem('ess_access_token')
        const res = await fetch('/api/settings', { headers: token ? { Authorization: `Bearer ${token}` } : {} })
        if (!res.ok) return
        const data = await res.json()
        const s = data?.settings ?? {}
        const next: Branding = {
          name: (s.brand_name && String(s.brand_name).trim()) || s.company_name || 'ESS Portal',
          logoUrl: s.logo_url ?? null,
        }
        if (!cancelled) setBranding(next)
        writeCache(next)
      } catch {
        /* keep cached / default */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return branding
}
