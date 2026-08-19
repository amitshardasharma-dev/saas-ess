'use client'

import { useState, type ReactNode } from 'react'
import { Menu, X } from 'lucide-react'
import { Sidebar } from '@/components/layout/sidebar'
import { AnnouncementBanner } from '@/components/layout/announcement-banner'

/**
 * Route-group shell for ALL /dashboard/* pages: sidebar + announcement banner +
 * scrollable main content. On mobile the sidebar becomes an off-canvas drawer
 * (opened via the top-bar hamburger); on desktop it's the persistent column.
 */
export default function DashboardRouteLayout({ children }: { children: ReactNode }) {
  const [drawerOpen, setDrawerOpen] = useState(false)

  return (
    <div className="flex h-screen bg-background">
      {/* Backdrop (mobile only, when the drawer is open) */}
      {drawerOpen ? (
        <div className="fixed inset-0 z-40 bg-black/40 lg:hidden" onClick={() => setDrawerOpen(false)} aria-hidden />
      ) : null}

      <Sidebar mobileOpen={drawerOpen} onNavigate={() => setDrawerOpen(false)} />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Mobile top bar with the menu button */}
        <div className="flex items-center gap-3 border-b border-border bg-background/80 px-3 py-2 backdrop-blur lg:hidden">
          <button
            type="button"
            onClick={() => setDrawerOpen((v) => !v)}
            aria-label={drawerOpen ? 'Close menu' : 'Open menu'}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border text-foreground"
          >
            {drawerOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          <span className="text-sm font-semibold text-foreground">ESS Portal</span>
        </div>

        <AnnouncementBanner />
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  )
}
