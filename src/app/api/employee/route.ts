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

		// Get app user registration
		const { data: appUser } = await supabaseAdmin
			.from('ess_app_users')
			.select('id, company_id, role, is_active')
			.eq('auth_user_id', authUser.id)
			.eq('is_active', true)
			.single()

		if (!appUser) {
			return NextResponse.json({ error: 'Not registered for ESS' }, { status: 403 })
		}

		// Get employee record
		const { data: employee } = await supabaseAdmin
			.from('ess_employees')
			.select('*')
			.eq('app_user_id', appUser.id)
			.single()

		if (!employee) {
			return NextResponse.json({ error: 'No employee record found' }, { status: 404 })
		}

		const responseData = {
			employee: {
				name: employee.employee_no || employee.id,
				employee_name: employee.full_name,
				user_id: authUser.email,
				employee_id: employee.employee_no || employee.id,
				full_name: employee.full_name,
				bc_employee_id: employee.bc_employee_id || '',
				company: '',
				department: employee.department || '',
				leave_approval_enabled: employee.is_approver ? 1 : 0,
				expense_approval_enabled: employee.is_approver ? 1 : 0,
			}
		}

		const response = NextResponse.json(responseData)
		response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate')
		return response
	} catch (error) {
		console.error('Employee fetch error:', error)
		return NextResponse.json(
			{ error: 'Failed to fetch employee data' },
			{ status: 500 }
		)
	}
}
