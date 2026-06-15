'use client'

// In-portal inbox route. The list/reader lives in <InboxView /> so the
// Communications landing page can surface the same inbox without duplication.

import { InboxView } from '@/components/communications/inbox-view'

export default function InboxPage() {
  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 p-6">
      <InboxView showHeader />
    </div>
  )
}
