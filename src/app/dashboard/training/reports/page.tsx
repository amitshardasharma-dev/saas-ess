// src/app/dashboard/training/reports/page.tsx
//
// Deduped: the training progress overview that used to live here was a thinner,
// confusing duplicate of the canonical, world-class Training Report. There is now
// ONE report. This route permanently redirects to it so old links / nav entries /
// bookmarks keep working.
//
// Canonical report: /dashboard/reports/training (hr+ gated; stat cards, charts,
// filterable table, CSV/Excel export). See src/app/dashboard/reports/training.

import { redirect } from 'next/navigation'

export default function TrainingReportsRedirect() {
  redirect('/dashboard/reports/training')
}
