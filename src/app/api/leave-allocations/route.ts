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

		// Get app user + employee
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
			.select('id, employee_no, full_name')
			.eq('app_user_id', appUser.id)
			.single()

		if (!employee) {
			return NextResponse.json({ leave_allocations: [] })
		}

		const currentYear = new Date().getFullYear()

		// Get allocations for this employee for the current year
		const { data: allocations, error } = await supabaseAdmin
			.from('ess_leave_allocations')
			.select(`
				id,
				fiscal_year,
				allocated_days,
				carry_forward_days,
				leave_type_id,
				ess_leave_types (
					code,
					name
				)
			`)
			.eq('employee_id', employee.id)
			.eq('fiscal_year', currentYear)

		if (error) {
			throw error
		}

		// Calculate leaves taken from approved applications
		const { data: approvedLeaves } = await supabaseAdmin
			.from('ess_leave_applications')
			.select('leave_type_id, total_days')
			.eq('employee_id', employee.id)
			.eq('status', 'Approved')

		const takenByType: Record<string, number> = {}
		for (const leave of approvedLeaves || []) {
			const key = leave.leave_type_id
			takenByType[key] = (takenByType[key] || 0) + Number(leave.total_days)
		}

		const processedAllocations = (allocations || []).map(alloc => {
			const leaveType = alloc.ess_leave_types as any
			const totalAllocated = Number(alloc.allocated_days) + Number(alloc.carry_forward_days)
			const taken = takenByType[alloc.leave_type_id] || 0

			return {
				name: alloc.id,
				employee: employee.employee_no || employee.id,
				employee_name: employee.full_name,
				leave_type: leaveType?.name || '',
				from_date: `${alloc.fiscal_year}-01-01`,
				to_date: `${alloc.fiscal_year}-12-31`,
				new_leaves_allocated: Number(alloc.allocated_days),
				leaves_taken: taken,
				total_leaves_allocated: totalAllocated,
				unused_leaves: totalAllocated - taken,
				expired_leaves: 0,
				carry_forwarded_leaves: Number(alloc.carry_forward_days),
				remaining_leaves: totalAllocated - taken,
			}
		})

		return NextResponse.json({ leave_allocations: processedAllocations })
	} catch (error) {
		console.error('Leave Allocations fetch error:', error)
		return NextResponse.json(
			{ error: 'Failed to fetch leave allocations' },
			{ status: 500 }
		)
	}
}
