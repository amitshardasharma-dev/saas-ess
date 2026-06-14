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
			return NextResponse.json([])
		}

		const { data: employee } = await supabaseAdmin
			.from('ess_employees')
			.select('id')
			.eq('app_user_id', appUser.id)
			.single()

		if (!employee) {
			return NextResponse.json([])
		}

		type EmployeeRef = { employee_no: string | null; full_name: string | null } | null
		type LeaveApplicationRef = {
			display_id: string | null
			from_date: string | null
			till_date: string | null
			total_days: number | string | null
			reason: string | null
			status: string | null
			created_at: string | null
			employee_id: string | null
			ess_leave_types: { name: string | null } | null
			ess_employees: EmployeeRef
		} | null
		type ExpenseClaimRef = {
			display_id: string | null
			title: string | null
			total_amount: number | string | null
			currency: string | null
			status: string | null
			created_at: string | null
			employee_id: string | null
			ess_employees: EmployeeRef
		} | null

		type ApprovalHistoryItem = {
			leave_id: string | null | undefined
			type: 'leave' | 'expense'
			employee: string
			employee_name: string
			leave_type?: string
			title?: string
			total_amount?: number
			currency?: string
			from_date?: string | null
			till_date?: string | null
			total_days?: number
			reason?: string
			my_action: string
			action_date: string | null
			remarks: string
			final_status: string
			creation: string | null | undefined
			approved_level: number
		}

		const approvalHistory: ApprovalHistoryItem[] = []

		// Get leave approval history
		const { data: leaveEntries } = await supabaseAdmin
			.from('ess_leave_approval_entries')
			.select(`
				*,
				ess_leave_applications (
					display_id, from_date, till_date, total_days, reason, status, created_at,
					employee_id,
					ess_leave_types (name),
					ess_employees!ess_leave_applications_employee_id_fkey (employee_no, full_name)
				)
			`)
			.eq('approver_id', employee.id)
			.in('status', ['Approved', 'Rejected'])
			.order('action_time', { ascending: false })

		for (const entry of leaveEntries || []) {
			const app = entry.ess_leave_applications as unknown as LeaveApplicationRef
			const emp = app?.ess_employees
			const lt = app?.ess_leave_types

			approvalHistory.push({
				leave_id: app?.display_id,
				type: 'leave',
				employee: emp?.employee_no || '',
				employee_name: emp?.full_name || '',
				leave_type: lt?.name || '',
				from_date: app?.from_date,
				till_date: app?.till_date,
				total_days: Number(app?.total_days) || 0,
				reason: app?.reason || '',
				my_action: entry.status,
				action_date: entry.action_time,
				remarks: entry.remarks || '',
				final_status: app?.status || '',
				creation: app?.created_at,
				approved_level: entry.level_no,
			})
		}

		// Get expense approval history
		const { data: expenseEntries } = await supabaseAdmin
			.from('ess_expense_approval_entries')
			.select(`
				*,
				ess_expense_claims (
					display_id, title, total_amount, currency, status, created_at,
					employee_id,
					ess_employees!ess_expense_claims_employee_id_fkey (employee_no, full_name)
				)
			`)
			.eq('approver_id', employee.id)
			.in('status', ['Approved', 'Rejected'])
			.order('action_time', { ascending: false })

		for (const entry of expenseEntries || []) {
			const claim = entry.ess_expense_claims as unknown as ExpenseClaimRef
			const emp = claim?.ess_employees

			approvalHistory.push({
				leave_id: claim?.display_id,
				type: 'expense',
				employee: emp?.employee_no || '',
				employee_name: emp?.full_name || '',
				title: claim?.title || '',
				total_amount: Number(claim?.total_amount) || 0,
				currency: claim?.currency || 'INR',
				my_action: entry.status,
				action_date: entry.action_time,
				remarks: entry.remarks || '',
				final_status: claim?.status || '',
				creation: claim?.created_at,
				approved_level: entry.level_no,
			})
		}

		// Sort by action date descending
		approvalHistory.sort((a, b) =>
			new Date(b.action_date || 0).getTime() - new Date(a.action_date || 0).getTime()
		)

		return NextResponse.json(approvalHistory)
	} catch (error) {
		console.error('Error in approval history API:', error)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}
