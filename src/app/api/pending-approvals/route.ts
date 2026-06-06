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

		// Get current user's employee record
		const { data: appUser } = await supabaseAdmin
			.from('ess_app_users')
			.select('id')
			.eq('auth_user_id', authUser.id)
			.eq('is_active', true)
			.single()

		if (!appUser) {
			return NextResponse.json({ pending_approvals: [] })
		}

		const { data: employee } = await supabaseAdmin
			.from('ess_employees')
			.select('id')
			.eq('app_user_id', appUser.id)
			.single()

		if (!employee) {
			return NextResponse.json({ pending_approvals: [] })
		}

		// Get pending LEAVE approval entries for this approver
		const { data: leaveEntries } = await supabaseAdmin
			.from('ess_leave_approval_entries')
			.select(`
				*,
				ess_leave_applications (
					id, display_id, from_date, till_date, total_days, reason, status, created_at,
					leave_type_id,
					employee_id,
					ess_leave_types (name),
					ess_employees!ess_leave_applications_employee_id_fkey (
						employee_no, full_name
					)
				)
			`)
			.eq('approver_id', employee.id)
			.eq('status', 'Pending')

		// Filter: only show if all previous levels are approved
		const pendingApprovals: any[] = []

		for (const entry of leaveEntries || []) {
			if (entry.level_no > 1) {
				// Check all previous levels
				const { data: prevEntries } = await supabaseAdmin
					.from('ess_leave_approval_entries')
					.select('status')
					.eq('leave_application_id', entry.leave_application_id)
					.lt('level_no', entry.level_no)

				const allPrevApproved = (prevEntries || []).every(e => e.status === 'Approved')
				if (!allPrevApproved) continue
			}

			const app = entry.ess_leave_applications as any
			const emp = app?.ess_employees as any
			const lt = app?.ess_leave_types as any

			pendingApprovals.push({
				name: app?.display_id,
				type: 'leave',
				employee: emp?.employee_no || '',
				employee_name: emp?.full_name || '',
				leave_type: lt?.name || '',
				from_date: app?.from_date,
				till_date: app?.till_date,
				total_leave_days: Number(app?.total_days) || 0,
				leave_reason: app?.reason || '',
				workflow_state: app?.status || 'Pending Approval',
				creation: app?.created_at,
				level_no: entry.level_no,
			})
		}

		// Get pending EXPENSE approval entries for this approver
		const { data: expenseEntries } = await supabaseAdmin
			.from('ess_expense_approval_entries')
			.select(`
				*,
				ess_expense_claims (
					id, display_id, title, total_amount, currency, status, created_at,
					employee_id,
					ess_employees!ess_expense_claims_employee_id_fkey (
						employee_no, full_name
					)
				)
			`)
			.eq('approver_id', employee.id)
			.eq('status', 'Pending')

		for (const entry of expenseEntries || []) {
			if (entry.level_no > 1) {
				const { data: prevEntries } = await supabaseAdmin
					.from('ess_expense_approval_entries')
					.select('status')
					.eq('expense_claim_id', entry.expense_claim_id)
					.lt('level_no', entry.level_no)

				const allPrevApproved = (prevEntries || []).every(e => e.status === 'Approved')
				if (!allPrevApproved) continue
			}

			const claim = entry.ess_expense_claims as any
			const emp = claim?.ess_employees as any

			pendingApprovals.push({
				name: claim?.display_id,
				expense_id: claim?.id, // UUID for detail navigation (display_id stays the label)
				type: 'expense',
				employee: emp?.employee_no || '',
				employee_name: emp?.full_name || '',
				title: claim?.title || '',
				total_amount: Number(claim?.total_amount) || 0,
				currency: claim?.currency || 'INR',
				workflow_state: claim?.status || 'Pending Approval',
				creation: claim?.created_at,
				level_no: entry.level_no,
			})
		}

		// Get pending TIMESHEET approval entries for this approver
		const { data: timesheetApprovals } = await supabaseAdmin
			.from('ess_timesheet_approval_entries')
			.select(`
				id, level_no, status, remarks,
				ess_timesheets!inner (
					id, display_id, period_start, period_end, total_hours, status,
					employee_id,
					ess_employees!inner (full_name, employee_no)
				)
			`)
			.eq('approver_id', employee.id)
			.eq('status', 'Pending')

		for (const entry of timesheetApprovals || []) {
			if (entry.level_no > 1) {
				const { data: prevEntries } = await supabaseAdmin
					.from('ess_timesheet_approval_entries')
					.select('status')
					.eq('timesheet_id', (entry.ess_timesheets as any)?.id)
					.lt('level_no', entry.level_no)

				const allPrevApproved = (prevEntries || []).every(e => e.status === 'Approved')
				if (!allPrevApproved) continue
			}

			const ts = entry.ess_timesheets as any
			const emp = ts?.ess_employees as any

			pendingApprovals.push({
				name: ts?.display_id,
				type: 'timesheet',
				employee: emp?.employee_no || '',
				employee_name: emp?.full_name || '',
				period_start: ts?.period_start,
				period_end: ts?.period_end,
				total_hours: Number(ts?.total_hours) || 0,
				workflow_state: ts?.status || 'Pending Approval',
				creation: ts?.created_at,
				level_no: entry.level_no,
			})
		}

		return NextResponse.json({ pending_approvals: pendingApprovals })
	} catch (error) {
		console.error('Pending Approvals fetch error:', error)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}
