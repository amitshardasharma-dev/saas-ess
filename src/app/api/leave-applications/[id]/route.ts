import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { withAuth } from '@/lib/auth-middleware'

// IDOR fix: this route previously authenticated the user but did NOT scope the
// leave application by company, so any authenticated user (incl. approvers) could
// read another tenant's leave. It is now wrapped in withAuth and the application
// lookup is constrained to the caller's company_id; cross-tenant -> 404.
export const GET = withAuth(async (request: NextRequest, { companyId }, params) => {
	const id = params?.id
	if (!id) {
		return NextResponse.json({ error: 'Leave application ID required' }, { status: 400 })
	}

	// Find the leave application by display_id or UUID, always scoped to company.
	let query = supabaseAdmin
		.from('ess_leave_applications')
		.select(`
			*,
			ess_leave_types (code, name),
			ess_employees!ess_leave_applications_employee_id_fkey (
				id, employee_no, full_name, bc_employee_id
			)
		`)
		.eq('company_id', companyId)

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

	const leaveType = application.ess_leave_types as { name?: string } | null
	const emp = application.ess_employees as { employee_no?: string; full_name?: string; bc_employee_id?: string } | null

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

	const lastApprover = approvalEntries?.find((e) => e.status === 'Approved' || e.status === 'Rejected')
	const approverEmp = lastApprover?.ess_employees as { employee_no?: string; full_name?: string } | null

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
})
