import type { ReactNode } from 'react'
import { Sidebar } from '@/components/layout/sidebar'
import { AnnouncementBanner } from '@/components/layout/announcement-banner'

/**
 * Route-group shell for ALL /dashboard/* pages: sidebar + announcement banner +
 * scrollable main content. Defined here (not per-page) so every module renders
 * inside the same application chrome (consistent sidebar/header/footer).
 *
 * The legacy <DashboardLayout> component is now a passthrough, so pages that
 * still wrap themselves in it do NOT double-render this shell.
 */
export default function DashboardRouteLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-screen bg-background">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <AnnouncementBanner />
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  )
}
