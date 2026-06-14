'use client'

import { ReactNode } from 'react'

/**
 * DEPRECATED shell wrapper.
 *
 * The dashboard route layout (src/app/dashboard/layout.tsx) now provides the
 * sidebar / announcement banner / main chrome for EVERY /dashboard page. This
 * component is kept as a passthrough so the many existing call-sites still
 * compile and do NOT double-render the shell (which would show two sidebars).
 *
 * New pages do not need to use this — the route layout wraps them automatically.
 */
export function DashboardLayout({ children }: { children: ReactNode }) {
  return <>{children}</>
}
