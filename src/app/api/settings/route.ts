import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'

export async function GET(request: NextRequest) {
	try {
		const authHeader = request.headers.get('authorization')
		const token = authHeader?.replace('Bearer ', '')

		if (!token) {
			return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
		}

		const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
		if (authError || !user) {
			return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
		}

		// Find user's company
		const { data: appUser } = await supabaseAdmin
			.from('ess_app_users')
			.select('company_id, role')
			.eq('auth_user_id', user.id)
			.eq('is_active', true)
			.single()

		if (!appUser) {
			return NextResponse.json({ error: 'Not registered for ESS' }, { status: 403 })
		}

		// Get company settings
		const { data: company, error } = await supabaseAdmin
			.from('ess_companies')
			.select('*')
			.eq('id', appUser.company_id)
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
	} catch (error) {
		console.error('Settings fetch error:', error)
		return NextResponse.json(
			{ error: 'Failed to fetch settings' },
			{ status: 500 }
		)
	}
}

export async function POST(request: NextRequest) {
	try {
		const authHeader = request.headers.get('authorization')
		const token = authHeader?.replace('Bearer ', '')

		if (!token) {
			return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
		}

		const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
		if (authError || !user) {
			return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
		}

		// Find user's company — only admins can update settings
		const { data: appUser } = await supabaseAdmin
			.from('ess_app_users')
			.select('company_id, role')
			.eq('auth_user_id', user.id)
			.eq('is_active', true)
			.single()

		if (!appUser) {
			return NextResponse.json({ error: 'Not registered for ESS' }, { status: 403 })
		}

		if (appUser.role !== 'admin') {
			return NextResponse.json({ error: 'Only admins can update settings' }, { status: 403 })
		}

		const updates = await request.json()

		// Get current settings and merge
		const { data: company } = await supabaseAdmin
			.from('ess_companies')
			.select('settings')
			.eq('id', appUser.company_id)
			.single()

		const mergedSettings = { ...(company?.settings || {}), ...updates }

		const { error: updateError } = await supabaseAdmin
			.from('ess_companies')
			.update({ settings: mergedSettings })
			.eq('id', appUser.company_id)

		if (updateError) throw updateError

		return NextResponse.json({
			settings: mergedSettings,
			message: 'Settings updated successfully',
		})
	} catch (error) {
		console.error('Settings update error:', error)
		return NextResponse.json(
			{ error: 'Failed to update settings' },
			{ status: 500 }
		)
	}
}
