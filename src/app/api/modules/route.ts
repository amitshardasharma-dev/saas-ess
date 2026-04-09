// src/app/api/modules/route.ts

import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth-middleware'
import { MODULE_IDS, ModuleId } from '@/types/roles'

const DEFAULT_MODULES: ModuleId[] = ['leave', 'expense']

export const GET = withAuth(async (_request, { companyId }) => {
	const { supabaseAdmin } = await import('@/lib/supabase-server')

	const { data: company } = await supabaseAdmin
		.from('ess_companies')
		.select('settings')
		.eq('id', companyId)
		.single()

	const settings = company?.settings as Record<string, unknown> | null
	const rawModules = settings?.modules_enabled

	let enabledModules: ModuleId[]
	if (Array.isArray(rawModules)) {
		enabledModules = rawModules.filter(
			(m): m is ModuleId => MODULE_IDS.includes(m as ModuleId)
		)
	} else {
		enabledModules = DEFAULT_MODULES
	}

	return NextResponse.json({ modules_enabled: enabledModules })
})
