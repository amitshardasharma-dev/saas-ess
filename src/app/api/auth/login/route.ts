import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

export async function POST(request: NextRequest) {
	try {
		const body = await request.text()
		const params = new URLSearchParams(body)
		const email = params.get('usr') || ''
		const password = params.get('pwd') || ''

		if (!email || !password) {
			return NextResponse.json(
				{ message: 'Email and password are required' },
				{ status: 400 }
			)
		}

		// Sign in with Supabase Auth
		const supabase = createClient(supabaseUrl, supabaseServiceKey, {
			auth: { persistSession: false },
		})

		const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
			email,
			password,
		})

		if (authError || !authData.user) {
			return NextResponse.json(
				{ message: authError?.message || 'Invalid credentials' },
				{ status: 401 }
			)
		}

		// Check if user is registered for ESS app
		const { data: appUser, error: appError } = await supabase
			.from('ess_app_users')
			.select('id, company_id, role, is_active')
			.eq('auth_user_id', authData.user.id)
			.eq('is_active', true)
			.single()

		if (appError || !appUser) {
			return NextResponse.json(
				{ message: 'You are not registered for the ESS application. Please contact your administrator.' },
				{ status: 403 }
			)
		}

		// Get employee record
		const { data: employee } = await supabase
			.from('ess_employees')
			.select('*')
			.eq('app_user_id', appUser.id)
			.single()

		return NextResponse.json({
			message: 'Logged In',
			home_page: '/dashboard',
			full_name: employee?.full_name || authData.user.email,
			user: authData.user.email,
			role: appUser.role,
			access_token: authData.session?.access_token,
			refresh_token: authData.session?.refresh_token,
		})
	} catch (error) {
		console.error('Login error:', error)
		return NextResponse.json(
			{ message: 'Internal server error' },
			{ status: 500 }
		)
	}
}
