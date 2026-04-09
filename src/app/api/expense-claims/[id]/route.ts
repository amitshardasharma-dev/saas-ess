import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'

export async function GET(
	request: NextRequest,
	{ params }: { params: Promise<{ id: string }> }
) {
	try {
		const { id } = await params

		const { data: claim, error } = await supabaseAdmin
			.from('ess_expense_claims')
			.select(`
				*,
				ess_employees!ess_expense_claims_employee_id_fkey (
					employee_no, full_name, department
				)
			`)
			.eq('display_id', id)
			.single()

		if (error || !claim) {
			return NextResponse.json({ error: 'Claim not found' }, { status: 404 })
		}

		// Get items
		const { data: items } = await supabaseAdmin
			.from('ess_expense_items')
			.select(`
				*,
				ess_expense_categories (code, name)
			`)
			.eq('expense_claim_id', claim.id)
			.order('expense_date')

		// Get approval chain
		const { data: approvalEntries } = await supabaseAdmin
			.from('ess_expense_approval_entries')
			.select(`
				*,
				ess_employees!ess_expense_approval_entries_approver_id_fkey (
					full_name, employee_no
				)
			`)
			.eq('expense_claim_id', claim.id)
			.order('level_no')

		return NextResponse.json({
			claim,
			items: items || [],
			approval_chain: approvalEntries || [],
		})
	} catch (error) {
		console.error('Expense claim detail error:', error)
		return NextResponse.json({ error: 'Failed to fetch claim' }, { status: 500 })
	}
}

export async function PUT(
	request: NextRequest,
	{ params }: { params: Promise<{ id: string }> }
) {
	try {
		const { id } = await params
		const body = await request.json()

		// Only allow editing drafts
		const { data: claim } = await supabaseAdmin
			.from('ess_expense_claims')
			.select('id, status')
			.eq('display_id', id)
			.single()

		if (!claim) {
			return NextResponse.json({ error: 'Claim not found' }, { status: 404 })
		}

		if (claim.status !== 'Draft') {
			return NextResponse.json({ error: 'Can only edit draft claims' }, { status: 400 })
		}

		const { error } = await supabaseAdmin
			.from('ess_expense_claims')
			.update({
				title: body.title,
				description: body.description,
				currency: body.currency,
				updated_at: new Date().toISOString(),
			})
			.eq('id', claim.id)

		if (error) throw error

		return NextResponse.json({ message: 'Claim updated' })
	} catch (error) {
		console.error('Update expense claim error:', error)
		return NextResponse.json({ error: 'Failed to update claim' }, { status: 500 })
	}
}

// Submit claim for approval
export async function POST(
	request: NextRequest,
	{ params }: { params: Promise<{ id: string }> }
) {
	try {
		const { id } = await params

		const { data: claim } = await supabaseAdmin
			.from('ess_expense_claims')
			.select('id, status, employee_id, total_amount')
			.eq('display_id', id)
			.single()

		if (!claim) {
			return NextResponse.json({ error: 'Claim not found' }, { status: 404 })
		}

		if (claim.status !== 'Draft') {
			return NextResponse.json({ error: 'Can only submit draft claims' }, { status: 400 })
		}

		if (Number(claim.total_amount) <= 0) {
			return NextResponse.json({ error: 'Add at least one expense item before submitting' }, { status: 400 })
		}

		// Get company for approval rules
		const { data: employee } = await supabaseAdmin
			.from('ess_employees')
			.select('company_id, reports_to')
			.eq('id', claim.employee_id)
			.single()

		if (!employee) {
			return NextResponse.json({ error: 'Employee not found' }, { status: 404 })
		}

		// Create approval entries from rules
		const { data: rules } = await supabaseAdmin
			.from('ess_approval_rules')
			.select('*')
			.eq('company_id', employee.company_id)
			.eq('rule_type', 'expense')
			.eq('is_active', true)
			.order('level_no')

		if (rules && rules.length > 0) {
			for (const rule of rules) {
				let approverId = rule.specific_approver_id
				if (rule.approver_type === 'reporting_manager') {
					approverId = employee.reports_to
				}

				if (approverId) {
					await supabaseAdmin.from('ess_expense_approval_entries').insert({
						expense_claim_id: claim.id,
						level_no: rule.level_no,
						approver_id: approverId,
						status: 'Pending',
					})
				}
			}
		}

		// Update claim status
		await supabaseAdmin
			.from('ess_expense_claims')
			.update({
				status: 'Pending Approval',
				submitted_at: new Date().toISOString(),
				updated_at: new Date().toISOString(),
			})
			.eq('id', claim.id)

		return NextResponse.json({ message: 'Claim submitted for approval' })
	} catch (error) {
		console.error('Submit expense claim error:', error)
		return NextResponse.json({ error: 'Failed to submit claim' }, { status: 500 })
	}
}
