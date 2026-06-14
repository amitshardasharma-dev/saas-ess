import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'

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

		const body = await request.json()
		const { leave_id, action, remarks, type = 'leave' } = body

		if (!leave_id || !action) {
			return NextResponse.json({ error: 'ID and action are required' }, { status: 400 })
		}

		if (!['approve', 'reject'].includes(action)) {
			return NextResponse.json({ error: 'Action must be "approve" or "reject"' }, { status: 400 })
		}

		// Get current user's employee ID + company (company used for an explicit
		// defense-in-depth tenant assertion on every parent lookup below).
		const { data: appUser } = await supabaseAdmin
			.from('ess_app_users')
			.select('id, company_id')
			.eq('auth_user_id', authUser.id)
			.eq('is_active', true)
			.single()

		if (!appUser) {
			return NextResponse.json({ error: 'Not registered for ESS' }, { status: 403 })
		}

		const companyId = appUser.company_id

		const { data: employee } = await supabaseAdmin
			.from('ess_employees')
			.select('id')
			.eq('app_user_id', appUser.id)
			.single()

		if (!employee) {
			return NextResponse.json({ error: 'Employee not found' }, { status: 404 })
		}

		const newStatus = action === 'approve' ? 'Approved' : 'Rejected'

		if (type === 'expense') {
			// Process expense approval
			// Find the claim by display_id
			const { data: claim } = await supabaseAdmin
				.from('ess_expense_claims')
				.select('id')
				.eq('display_id', leave_id)
				.eq('company_id', companyId)
				.single()

			if (!claim) {
				return NextResponse.json({ error: 'Expense claim not found' }, { status: 404 })
			}

			// Update the approval entry
			await supabaseAdmin
				.from('ess_expense_approval_entries')
				.update({
					status: newStatus,
					action_time: new Date().toISOString(),
					remarks: remarks || '',
				})
				.eq('expense_claim_id', claim.id)
				.eq('approver_id', employee.id)
				.eq('status', 'Pending')

			// Check if all levels are done
			const { data: allEntries } = await supabaseAdmin
				.from('ess_expense_approval_entries')
				.select('status')
				.eq('expense_claim_id', claim.id)

			if (action === 'reject') {
				await supabaseAdmin
					.from('ess_expense_claims')
					.update({ status: 'Rejected', updated_at: new Date().toISOString() })
					.eq('id', claim.id)
			} else {
				const allApproved = (allEntries || []).every(e => e.status === 'Approved')
				if (allApproved) {
					await supabaseAdmin
						.from('ess_expense_claims')
						.update({ status: 'Approved', updated_at: new Date().toISOString() })
						.eq('id', claim.id)
				}
			}
		} else if (type === 'timesheet') {
			// Process timesheet approval
			const { data: timesheet } = await supabaseAdmin
				.from('ess_timesheets')
				.select('id')
				.eq('display_id', leave_id)
				.eq('company_id', companyId)
				.eq('status', 'Submitted')
				.limit(1)
				.single()

			if (!timesheet) {
				return NextResponse.json({ error: 'Timesheet not found' }, { status: 404 })
			}

			// Update the approval entry
			await supabaseAdmin
				.from('ess_timesheet_approval_entries')
				.update({
					status: newStatus,
					action_time: new Date().toISOString(),
					remarks: remarks || '',
				})
				.eq('timesheet_id', timesheet.id)
				.eq('approver_id', employee.id)
				.eq('status', 'Pending')

			// Check if all levels are done
			const { data: allEntries } = await supabaseAdmin
				.from('ess_timesheet_approval_entries')
				.select('status')
				.eq('timesheet_id', timesheet.id)

			if (action === 'reject') {
				await supabaseAdmin
					.from('ess_timesheets')
					.update({ status: 'Rejected', updated_at: new Date().toISOString() })
					.eq('id', timesheet.id)
			} else {
				const allApproved = (allEntries || []).every(e => e.status === 'Approved')
				if (allApproved) {
					await supabaseAdmin
						.from('ess_timesheets')
						.update({ status: 'Approved', updated_at: new Date().toISOString() })
						.eq('id', timesheet.id)
				}
			}
		} else {
			// Process leave approval
			const { data: leaveApp } = await supabaseAdmin
				.from('ess_leave_applications')
				.select('id')
				.eq('display_id', leave_id)
				.eq('company_id', companyId)
				.single()

			if (!leaveApp) {
				return NextResponse.json({ error: 'Leave application not found' }, { status: 404 })
			}

			// Update the approval entry
			await supabaseAdmin
				.from('ess_leave_approval_entries')
				.update({
					status: newStatus,
					action_time: new Date().toISOString(),
					remarks: remarks || '',
				})
				.eq('leave_application_id', leaveApp.id)
				.eq('approver_id', employee.id)
				.eq('status', 'Pending')

			// Check if all levels are done
			const { data: allEntries } = await supabaseAdmin
				.from('ess_leave_approval_entries')
				.select('status')
				.eq('leave_application_id', leaveApp.id)

			if (action === 'reject') {
				await supabaseAdmin
					.from('ess_leave_applications')
					.update({ status: 'Rejected', updated_at: new Date().toISOString() })
					.eq('id', leaveApp.id)
			} else {
				const allApproved = (allEntries || []).every(e => e.status === 'Approved')
				if (allApproved) {
					await supabaseAdmin
						.from('ess_leave_applications')
						.update({ status: 'Approved', updated_at: new Date().toISOString() })
						.eq('id', leaveApp.id)
				}
			}
		}

		return NextResponse.json({
			message: `${type === 'expense' ? 'Expense claim' : type === 'timesheet' ? 'Timesheet' : 'Leave application'} ${action}d successfully`,
			workflow_state: newStatus,
		})
	} catch (error) {
		console.error('Process Approval error:', error)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}
