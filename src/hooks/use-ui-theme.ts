// Per-user interface design ("classic" = the original look, "pro" = the
// Professional / Northbridge design).
//
// The design itself is applied before paint by the blocking script in
// src/app/layout.tsx, which reads the same localStorage key. This hook only
// drives the *switcher UI* and persistence, so it deliberately does NOT read
// localStorage during render — doing that is what causes hydration mismatches
// (React #418). It starts from the default and reconciles in an effect.
'use client'

import { useCallback, useEffect, useState } from 'react'
import { useAuthStore } from '@/stores/auth'
import type { UiTheme } from '@/types/auth'

const KEY = 'ess_ui_theme'

function applyToDocument(theme: UiTheme) {
  if (typeof document === 'undefined') return
  if (theme === 'pro') document.documentElement.setAttribute('data-ui', 'pro')
  else document.documentElement.removeAttribute('data-ui')
}

export function useUiTheme() {
  const { user } = useAuthStore()
  const [theme, setThemeState] = useState<UiTheme>('classic')
  const [saving, setSaving] = useState(false)

  // Reconcile after mount: the account is the source of truth across devices,
  // falling back to whatever this browser last applied.
  useEffect(() => {
    const serverTheme = user?.ui_theme
    const local = (() => {
      try {
        return localStorage.getItem(KEY) as UiTheme | null
      } catch {
        return null
      }
    })()

    const resolved: UiTheme = serverTheme ?? local ?? 'classic'
    setThemeState(resolved)
    applyToDocument(resolved)
    if (local !== resolved) {
      try {
        localStorage.setItem(KEY, resolved)
      } catch {
        /* private mode — the account value still wins next load */
      }
    }
  }, [user?.ui_theme])

  const setTheme = useCallback(async (next: UiTheme) => {
    // Apply immediately so the switch feels instant, then persist.
    setThemeState(next)
    applyToDocument(next)
    try {
      localStorage.setItem(KEY, next)
    } catch {
      /* non-fatal */
    }

    setSaving(true)
    try {
      const token = localStorage.getItem('ess_access_token')
      await fetch('/api/profile/ui-theme', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ theme: next }),
      })
    } catch {
      /* the local choice still applies; it re-syncs on next login */
    } finally {
      setSaving(false)
    }
  }, [])

  return { theme, setTheme, saving }
}
