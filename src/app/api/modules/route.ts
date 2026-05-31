// src/app/api/modules/route.ts

import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth-middleware'
import { MODULE_IDS, ModuleId } from '@/types/roles'
import {
	ModuleDependencyError,
	assertToggleAllowed,
	getEnabledModules,
} from '@/lib/modules'

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

/**
 * PUT /api/modules — admin toggles a single module for their own company.
 * Body: { moduleId: ModuleId, enabled: boolean }. Enforces the dependency graph
 * (returns 409 with a clear message when the toggle would break dependencies).
 */
export const PUT = withAuth(
	async (request, { companyId }) => {
		const { supabaseAdmin } = await import('@/lib/supabase-server')

		let body: { moduleId?: string; enabled?: boolean }
		try {
			body = await request.json()
		} catch {
			return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
		}

		const { moduleId, enabled } = body
		if (!moduleId || typeof enabled !== 'boolean') {
			return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
		}
		if (!MODULE_IDS.includes(moduleId as ModuleId)) {
			return NextResponse.json({ error: 'Unknown module' }, { status: 400 })
		}

		const current = await getEnabledModules(companyId)
		try {
			assertToggleAllowed(moduleId as ModuleId, enabled, current)
		} catch (e) {
			if (e instanceof ModuleDependencyError) {
				return NextResponse.json({ error: e.message }, { status: 409 })
			}
			throw e
		}

		const next = enabled
			? Array.from(new Set([...current, moduleId as ModuleId]))
			: current.filter(m => m !== moduleId)

		const { data: company } = await supabaseAdmin
			.from('ess_companies')
			.select('settings')
			.eq('id', companyId)
			.single()

		const settings = { ...((company?.settings as Record<string, unknown>) || {}), modules_enabled: next }

		const { error } = await supabaseAdmin
			.from('ess_companies')
			.update({ settings })
			.eq('id', companyId)

		if (error) {
			return NextResponse.json({ error: error.message }, { status: 500 })
		}

		return NextResponse.json({ modules_enabled: next })
	},
	{ minRole: 'admin' }
)
