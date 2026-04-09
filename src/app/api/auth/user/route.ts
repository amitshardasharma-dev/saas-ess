import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'

export async function GET(request: NextRequest) {
	try {
		// Get token from Authorization header or cookie
		const authHeader = request.headers.get('Authorization')
		const token = authHeader?.replace('Bearer ', '')

		if (!token) {
			return NextResponse.json({ user: null, authenticated: false })
		}

		// Verify the token and get user
		const { data: { user: authUser }, error } = await supabaseAdmin.auth.getUser(token)

		if (error || !authUser) {
			return NextResponse.json({ user: null, authenticated: false })
		}

		// Check ESS app registration
		const { data: appUser } = await supabaseAdmin
			.from('ess_app_users')
			.select('id, company_id, role, is_active')
			.eq('auth_user_id', authUser.id)
			.eq('is_active', true)
			.single()

		if (!appUser) {
			return NextResponse.json({ user: null, authenticated: false })
		}

		// Get employee record
		const { data: employee } = await supabaseAdmin
			.from('ess_employees')
			.select('*')
			.eq('app_user_id', appUser.id)
			.single()

		const user = {
			name: authUser.email,
			email: authUser.email,
			full_name: employee?.full_name || authUser.email,
			user_image: employee?.photo_url,
			photo: employee?.photo_url,
			roles: [appUser.role],
			role: appUser.role,
			employee: employee?.employee_no,
			employee_name: employee?.full_name,
			department: employee?.department,
			designation: employee?.designation,
		}

		return NextResponse.json({ user, authenticated: true })
	} catch (error) {
		console.error('User check error:', error)
		return NextResponse.json(
			{ user: null, authenticated: false },
			{ status: 500 }
		)
	}
}
