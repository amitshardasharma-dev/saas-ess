import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { withAuth } from '@/lib/auth-middleware'

export const GET = withAuth(async (_request, { employee }) => {
	// withAuth already returns 401 for a missing/invalid token — no more fail-open
	// 200-empty. An authenticated user with no employee record gets an empty set.
	if (!employee) {
		return NextResponse.json({ leave_applications: [], leave_summary: {}, pending_count: 0 })
	}

	try {
		const currentYear = new Date().getFullYear()
		const yearStart = `${currentYear}-01-01`
		const yearEnd = `${currentYear}-12-31`

		// Get leave applications for current year
		const { data: applications, error } = await supabaseAdmin
			.from('ess_leave_applications')
			.select(`
				id,
				display_id,
				leave_type_id,
				from_date,
				till_date,
				total_days,
				reason,
				half_day,
				status,
				created_at,
				updated_at,
				ess_leave_types (
					code,
					name
				)
			`)
			.eq('employee_id', employee.id)
			.gte('from_date', yearStart)
			.lte('from_date', yearEnd)
			.order('updated_at', { ascending: false })

		if (error) {
			throw error
		}

		// Calculate summary
		const leaveSummary: Record<string, number> = {}
		let pendingCount = 0

		for (const app of applications || []) {
			if (app.status === 'Pending Approval') {
				pendingCount++
			}
			if (app.status === 'Approved') {
				const leaveType = (app.ess_leave_types as any)?.name || 'Unknown'
				leaveSummary[leaveType] = (leaveSummary[leaveType] || 0) + Number(app.total_days)
			}
		}

		const processedApplications = (applications || []).map(app => {
			const leaveType = app.ess_leave_types as any
			return {
				name: app.display_id,
				employee: employee.employee_no || employee.id,
				employee_name: employee.full_name,
				leave_type: leaveType?.name || '',
				from_date: app.from_date,
				to_date: app.till_date,
				total_leave_days: Number(app.total_days),
				leave_status: app.status,
				posting_date: app.from_date,
				description: app.reason || '',
				leave_approver: '',
				modified: app.updated_at,
			}
		})

		return NextResponse.json({
			leave_applications: processedApplications,
			leave_summary: leaveSummary,
			pending_count: pendingCount,
			user_context: employee.employee_no || employee.id,
		})
	} catch (error) {
		console.error('Leave Applications fetch error:', error)
		return NextResponse.json({ leave_applications: [], leave_summary: {}, pending_count: 0 })
	}
})

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
			.select('id, employee_no')
			.eq('app_user_id', appUser.id)
			.single()

		if (!employee) {
			return NextResponse.json({ error: 'No employee record' }, { status: 404 })
		}

		const leaveData = await request.json()

		// Resolve leave type by name
		const { data: leaveType } = await supabaseAdmin
			.from('ess_leave_types')
			.select('id, code')
			.eq('company_id', appUser.company_id)
			.eq('name', leaveData.leave_type)
			.single()

		if (!leaveType) {
			return NextResponse.json({ error: 'Invalid leave type' }, { status: 400 })
		}

		// Generate display ID
		const { count } = await supabaseAdmin
			.from('ess_leave_applications')
			.select('*', { count: 'exact', head: true })
			.eq('employee_id', employee.id)

		const displayId = `LA-${new Date().getFullYear()}-${String((count || 0) + 1).padStart(3, '0')}`

		// Calculate total days
		const fromDate = new Date(leaveData.from_date)
		const tillDate = new Date(leaveData.till_date || leaveData.to_date)
		let totalDays = 0
		const current = new Date(fromDate)
		while (current <= tillDate) {
			totalDays++
			current.setDate(current.getDate() + 1)
		}
		if (leaveData.half_day) totalDays = 0.5

		// Insert leave application
		const { data: newApp, error: insertError } = await supabaseAdmin
			.from('ess_leave_applications')
			.insert({
				display_id: displayId,
				employee_id: employee.id,
				leave_type_id: leaveType.id,
				from_date: leaveData.from_date,
				till_date: leaveData.till_date || leaveData.to_date,
				total_days: totalDays,
				reason: leaveData.leave_reason || leaveData.reason || '',
				half_day: leaveData.half_day === 1 || leaveData.half_day === true,
				status: 'Pending Approval',
			})
			.select()
			.single()

		if (insertError) {
			throw insertError
		}

		// Create approval entries from rules
		const { data: rules } = await supabaseAdmin
			.from('ess_approval_rules')
			.select('*')
			.eq('company_id', appUser.company_id)
			.eq('rule_type', 'leave')
			.eq('is_active', true)
			.order('level_no')

		if (rules && rules.length > 0) {
			for (const rule of rules) {
				let approverId = rule.specific_approver_id

				// If approver type is reporting_manager, use employee's reports_to
				if (rule.approver_type === 'reporting_manager') {
					const { data: emp } = await supabaseAdmin
						.from('ess_employees')
						.select('reports_to')
						.eq('id', employee.id)
						.single()
					approverId = emp?.reports_to
				}

				if (approverId) {
					await supabaseAdmin.from('ess_leave_approval_entries').insert({
						leave_application_id: newApp.id,
						level_no: rule.level_no,
						approver_id: approverId,
						status: 'Pending',
					})
				}
			}
		}

		return NextResponse.json({
			name: displayId,
			message: 'Leave application created successfully',
			data: { name: displayId, id: newApp.id },
		})
	} catch (error) {
		console.error('Error creating leave application:', error)
		return NextResponse.json(
			{ error: 'Internal server error' },
			{ status: 500 }
		)
	}
}
