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
			.select('company_id')
			.eq('auth_user_id', authUser.id)
			.eq('is_active', true)
			.single()

		if (!appUser) {
			return NextResponse.json({ error: 'Not registered for ESS' }, { status: 403 })
		}

		const { data: categories, error } = await supabaseAdmin
			.from('ess_expense_categories')
			.select('*')
			.eq('company_id', appUser.company_id)
			.eq('is_active', true)
			.order('name')

		if (error) throw error

		return NextResponse.json({ categories: categories || [] })
	} catch (error) {
		console.error('Expense categories fetch error:', error)
		return NextResponse.json({ error: 'Failed to fetch categories' }, { status: 500 })
	}
}
