// src/app/api/labels/route.ts

import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth-middleware'
import { getLabels } from '@/lib/labels/server'

/**
 * GET /api/labels -> { labels: ResolvedLabels }
 * Returns the resolved terminology map (tenant overrides + defaults) for the
 * caller's company. Consumed once by the client useLabels() hook.
 */
export const GET = withAuth(async (_request, { companyId }) => {
  const labels = await getLabels(companyId)
  return NextResponse.json({ labels })
})
