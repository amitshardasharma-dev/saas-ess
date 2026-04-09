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

		const { data: appUser } = await supabaseAdmin
			.from('ess_app_users')
			.select('id')
			.eq('auth_user_id', authUser.id)
			.eq('is_active', true)
			.single()

		if (!appUser) {
			return NextResponse.json({ claims: [] })
		}

		const { data: employee } = await supabaseAdmin
			.from('ess_employees')
			.select('id')
			.eq('app_user_id', appUser.id)
			.single()

		if (!employee) {
			return NextResponse.json({ claims: [] })
		}

		// Get query params for filtering
		const { searchParams } = new URL(request.url)
		const status = searchParams.get('status')

		let query = supabaseAdmin
			.from('ess_expense_claims')
			.select('*')
			.eq('employee_id', employee.id)
			.order('updated_at', { ascending: false })

		if (status && status !== 'all') {
			query = query.eq('status', status)
		}

		const { data: claims, error } = await query

		if (error) throw error

		return NextResponse.json({ claims: claims || [] })
	} catch (error) {
		console.error('Expense claims fetch error:', error)
		return NextResponse.json({ error: 'Failed to fetch claims' }, { status: 500 })
	}
}

export async function POST(request: NextRequest) {
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

		const { data: appUser } = await supabaseAdmin
			.from('ess_app_users')
			.select('id, company_id')
			.eq('auth_user_id', authUser.id)
			.eq('is_active', true)
			.single()

		if (!appUser) {
			return NextResponse.json({ error: 'Not registered for ESS' }, { status: 403 })
		}

		const { data: employee } = await supabaseAdmin
			.from('ess_employees')
			.select('id')
			.eq('app_user_id', appUser.id)
			.single()

		if (!employee) {
			return NextResponse.json({ error: 'Employee not found' }, { status: 404 })
		}

		const body = await request.json()

		// Generate display ID
		const { count } = await supabaseAdmin
			.from('ess_expense_claims')
			.select('*', { count: 'exact', head: true })
			.eq('employee_id', employee.id)

		const displayId = `EC-${new Date().getFullYear()}-${String((count || 0) + 1).padStart(3, '0')}`

		const { data: newClaim, error } = await supabaseAdmin
			.from('ess_expense_claims')
			.insert({
				display_id: displayId,
				employee_id: employee.id,
				title: body.title,
				description: body.description || '',
				total_amount: 0,
				currency: body.currency || 'INR',
				status: 'Draft',
			})
			.select()
			.single()

		if (error) throw error

		return NextResponse.json({
			message: 'Expense claim created',
			claim: newClaim,
		})
	} catch (error) {
		console.error('Create expense claim error:', error)
		return NextResponse.json({ error: 'Failed to create claim' }, { status: 500 })
	}
}
