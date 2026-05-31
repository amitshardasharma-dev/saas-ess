import { NextRequest, NextResponse } from 'next/server'
import { withSuperAdmin } from '@/lib/super-admin-middleware'
import { supabaseAdmin } from '@/lib/supabase-server'
import { recordAudit } from '@/lib/audit'

// GET /api/platform/tenants/[id] — get a single tenant with details
export const GET = withSuperAdmin(async (request: NextRequest, context, params) => {
	const tenantId = params?.id as string

	const { data: company, error } = await supabaseAdmin
		.from('ess_companies')
		.select('*')
		.eq('id', tenantId)
		.single()

	if (error || !company) {
		return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })
	}

	// Get user count
	const { count: userCount } = await supabaseAdmin
		.from('ess_app_users')
		.select('*', { count: 'exact', head: true })
		.eq('company_id', tenantId)

	// Get employee count
	const { count: employeeCount } = await supabaseAdmin
		.from('ess_employees')
		.select('*', { count: 'exact', head: true })
		.eq('company_id', tenantId)

	return NextResponse.json({
		company: {
			...company,
			userCount: userCount || 0,
			employeeCount: employeeCount || 0,
		},
	})
})

// PATCH /api/platform/tenants/[id] — update a tenant
export const PATCH = withSuperAdmin(async (request: NextRequest, context, params) => {
	const tenantId = params?.id as string
	const body = await request.json()

	const { data: existing } = await supabaseAdmin
		.from('ess_companies')
		.select('id')
		.eq('id', tenantId)
		.single()

	if (!existing) {
		return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })
	}

	const updates: Record<string, unknown> = {}
	if (typeof body.name === 'string') updates.name = body.name
	if (typeof body.is_active === 'boolean') updates.is_active = body.is_active
	if (body.settings && typeof body.settings === 'object') updates.settings = body.settings

	// Validate module dependencies if settings.modules_enabled is being updated
	if (updates.settings && typeof updates.settings === 'object') {
		const mods = (updates.settings as Record<string, unknown>).modules_enabled
		if (Array.isArray(mods)) {
			const { validateModuleSet } = await import('@/lib/modules-deps')
			const result = validateModuleSet(mods as string[])
			if (!result.valid) {
				return NextResponse.json({ error: result.error }, { status: 409 })
			}
		}
	}

	const { data: updated, error } = await supabaseAdmin
		.from('ess_companies')
		.update(updates)
		.eq('id', tenantId)
		.select()
		.single()

	if (error) {
		return NextResponse.json({ error: 'Failed to update tenant' }, { status: 500 })
	}

	await recordAudit({
		companyId: tenantId,
		actorAppUserId: context.appUser.id,
		action: 'tenant.updated',
		targetType: 'company',
		targetId: tenantId,
	})

	return NextResponse.json({ company: updated })
})

// DELETE /api/platform/tenants/[id] — soft-delete a tenant
export const DELETE = withSuperAdmin(async (request: NextRequest, context, params) => {
	const tenantId = params?.id as string

	const { data: existing } = await supabaseAdmin
		.from('ess_companies')
		.select('id')
		.eq('id', tenantId)
		.single()

	if (!existing) {
		return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })
	}

	const { data: updated, error } = await supabaseAdmin
		.from('ess_companies')
		.update({ is_active: false })
		.eq('id', tenantId)
		.select()
		.single()

	if (error) {
		return NextResponse.json({ error: 'Failed to delete tenant' }, { status: 500 })
	}

	await recordAudit({
		companyId: tenantId,
		actorAppUserId: context.appUser.id,
		action: 'tenant.deleted',
		targetType: 'company',
		targetId: tenantId,
	})

	return NextResponse.json({ company: updated })
})
