import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { withAuth } from '@/lib/auth-middleware'

export const GET = withAuth(async (_request, { companyId }) => {
	const { data: company, error } = await supabaseAdmin
		.from('ess_companies')
		.select('*')
		.eq('id', companyId)
		.single()

	if (error || !company) {
		return NextResponse.json({ error: 'Company not found' }, { status: 404 })
	}

	const settings = company.settings || {}
	return NextResponse.json({
		settings: {
			company_name: company.name,
			company_slug: company.slug,
			bc_enabled: company.bc_enabled,
			bc_api_url: company.bc_api_url,
			bc_company_id: company.bc_company_id,
			modules_enabled: settings.modules_enabled || ['leave', 'expense'],
			...settings,
		},
	})
})

export const POST = withAuth(async (request, { companyId }) => {
	const updates = await request.json()

	const { data: company } = await supabaseAdmin
		.from('ess_companies')
		.select('settings')
		.eq('id', companyId)
		.single()

	const mergedSettings = { ...(company?.settings || {}), ...updates }

	const { error: updateError } = await supabaseAdmin
		.from('ess_companies')
		.update({ settings: mergedSettings })
		.eq('id', companyId)

	if (updateError) throw updateError

	return NextResponse.json({
		settings: mergedSettings,
		message: 'Settings updated successfully',
	})
}, { minRole: 'admin' })
