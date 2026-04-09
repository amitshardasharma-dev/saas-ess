import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'

export async function GET(
	request: NextRequest,
	{ params }: { params: Promise<{ id: string }> }
) {
	try {
		const { id } = await params
		const authHeader = request.headers.get('Authorization')
		const token = authHeader?.replace('Bearer ', '')

		if (!token) {
			return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
		}

		const { data: { user: authUser }, error: authError } = await supabaseAdmin.auth.getUser(token)
		if (authError || !authUser) {
			return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
		}

		// Check query param for type
		const { searchParams } = new URL(request.url)
		const type = searchParams.get('type') || 'leave'

		if (type === 'expense') {
			// Find expense claim
			const { data: claim } = await supabaseAdmin
				.from('ess_expense_claims')
				.select('id')
				.eq('display_id', id)
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

			const chain = (entries || []).map(entry => {
				const approver = entry.ess_employees as any
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

		const chain = (entries || []).map(entry => {
			const approver = entry.ess_employees as any
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
	} catch (error) {
		console.error('Approval Chain fetch error:', error)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}
