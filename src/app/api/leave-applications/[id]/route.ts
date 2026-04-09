import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'

export async function GET(
	request: NextRequest,
	{ params }: { params: Promise<{ id: string }> }
) {
	const { id } = await params
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

		// Find the leave application by display_id or UUID
		let query = supabaseAdmin
			.from('ess_leave_applications')
			.select(`
				*,
				ess_leave_types (code, name),
				ess_employees!ess_leave_applications_employee_id_fkey (
					id, employee_no, full_name, bc_employee_id
				)
			`)

		const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
		if (uuidRegex.test(id)) {
			query = query.eq('id', id)
		} else {
			query = query.eq('display_id', id)
		}

		const { data: application, error } = await query.single()

		if (error || !application) {
			return NextResponse.json({ error: 'Leave application not found' }, { status: 404 })
		}

		const leaveType = application.ess_leave_types as any
		const emp = application.ess_employees as any

		// Get approval entries
		const { data: approvalEntries } = await supabaseAdmin
			.from('ess_leave_approval_entries')
			.select(`
				*,
				ess_employees!ess_leave_approval_entries_approver_id_fkey (
					full_name, employee_no
				)
			`)
			.eq('leave_application_id', application.id)
			.order('level_no')

		const lastApprover = approvalEntries?.find(e => e.status === 'Approved' || e.status === 'Rejected')
		const approverEmp = lastApprover?.ess_employees as any

		const processedApplication = {
			name: application.display_id,
			employee: emp?.employee_no || '',
			employee_name: emp?.full_name || '',
			bc_employee_id: emp?.bc_employee_id || '',
			leave_type: leaveType?.name || '',
			from_date: application.from_date,
			to_date: application.till_date,
			total_leave_days: Number(application.total_days),
			leave_status: application.status,
			posting_date: application.from_date,
			description: application.reason || '',
			leave_approver: approverEmp?.employee_no || '',
			leave_approver_name: approverEmp?.full_name || '',
			leave_approver_bc_id: '',
			creation: application.created_at,
			modified: application.updated_at,
			owner: '',
			half_day: application.half_day ? 1 : 0,
		}

		return NextResponse.json({ leave_application: processedApplication })
	} catch (error) {
		console.error(`Leave Application ${id} fetch error:`, error)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}
