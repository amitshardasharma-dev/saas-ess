import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { withAuth } from '@/lib/auth-middleware'

// IDOR fix: this route authenticated the user but resolved the target
// claim/application WITHOUT a company check, disclosing another tenant's approval
// chain (and, transitively, org structure). It is now wrapped in withAuth and
// every parent lookup is scoped to the caller's company_id; cross-tenant -> 404.
export const GET = withAuth(async (request: NextRequest, { companyId }, params) => {
	const id = params?.id
	if (!id) {
		return NextResponse.json({ error: 'ID required' }, { status: 400 })
	}

	const { searchParams } = new URL(request.url)
	const type = searchParams.get('type') || 'leave'

	if (type === 'expense') {
		const { data: claim } = await supabaseAdmin
			.from('ess_expense_claims')
			.select('id')
			.eq('display_id', id)
			.eq('company_id', companyId)
			.single()

		if (!claim) {
			return NextResponse.json({ error: 'Expense claim not found' }, { status: 404 })
		}

		const { data: entries } = await supabaseAdmin
			.from('ess_expense_approval_entries')
			.select(`
				*,
				ess_employees!ess_expense_approval_entries_approver_id_fkey (
					full_name, employee_no, email
				)
			`)
			.eq('expense_claim_id', claim.id)
			.order('level_no')

		const chain = (entries || []).map((entry) => {
			const approver = entry.ess_employees as { email?: string; full_name?: string; employee_no?: string } | null
			return {
				level_no: entry.level_no,
				approver: approver?.email || '',
				approver_name: approver?.full_name || '',
				approver_employee_id: approver?.employee_no || '',
				status: entry.status,
				action_time: entry.action_time,
				remarks: entry.remarks || '',
			}
		})

		return NextResponse.json({ approval_chain: chain })
	}

	// Leave approval chain
	let leaveQuery = supabaseAdmin
		.from('ess_leave_applications')
		.select('id')
		.eq('company_id', companyId)

	const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
	if (uuidRegex.test(id)) {
		leaveQuery = leaveQuery.eq('id', id)
	} else {
		leaveQuery = leaveQuery.eq('display_id', id)
	}

	const { data: leaveApp } = await leaveQuery.single()

	if (!leaveApp) {
		return NextResponse.json({ error: 'Leave application not found' }, { status: 404 })
	}

	const { data: entries } = await supabaseAdmin
		.from('ess_leave_approval_entries')
		.select(`
			*,
			ess_employees!ess_leave_approval_entries_approver_id_fkey (
				full_name, employee_no, email
			)
		`)
		.eq('leave_application_id', leaveApp.id)
		.order('level_no')

	const chain = (entries || []).map((entry) => {
		const approver = entry.ess_employees as { email?: string; full_name?: string; employee_no?: string } | null
		return {
			level_no: entry.level_no,
			approver: approver?.email || '',
			approver_name: approver?.full_name || '',
			approver_employee_id: approver?.employee_no || '',
			status: entry.status,
			action_time: entry.action_time,
			remarks: entry.remarks || '',
		}
	})

	return NextResponse.json({ approval_chain: chain })
})
