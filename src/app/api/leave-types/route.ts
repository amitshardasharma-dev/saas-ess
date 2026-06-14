import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'

export async function GET(request: NextRequest) {
	try {
		const authHeader = request.headers.get('Authorization')
		const token = authHeader?.replace('Bearer ', '')

		if (!token) {
			return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
		}

		const { data: { user: authUser }, error: authError } = await supabaseAdmin.auth.getUser(token)
		if (authError || !authUser) {
			return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
		}

		// Get user's company
		const { data: appUser } = await supabaseAdmin
			.from('ess_app_users')
			.select('company_id')
			.eq('auth_user_id', authUser.id)
			.eq('is_active', true)
			.single()

		if (!appUser) {
			return NextResponse.json({ error: 'Not registered for ESS' }, { status: 403 })
		}

		// Get leave types for this company
		const { data: leaveTypes, error } = await supabaseAdmin
			.from('ess_leave_types')
			.select('*')
			.eq('company_id', appUser.company_id)
			.eq('is_active', true)
			.order('name')

		if (error) {
			throw error
		}

		const processedLeaveTypes = (leaveTypes || []).map(lt => ({
			name: lt.code,
			leave_type_name: lt.name,
			leave_mapping_code: lt.code,
			bc_leave_code: lt.code,
			eligible_days: lt.eligible_days || 0,
			description: lt.description || '',
			without_pay: lt.without_pay ? 1 : 0,
			leave_applicable_to_gender: lt.applicable_gender || 'Both',
		}))

		return NextResponse.json({ leave_types: processedLeaveTypes })
	} catch (error) {
		console.error('Leave Types fetch error:', error)
		return NextResponse.json(
			{ error: 'Failed to fetch leave types' },
			{ status: 500 }
		)
	}
}
