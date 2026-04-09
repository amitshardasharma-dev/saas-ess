import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'

export async function GET(request: NextRequest) {
	try {
		const { searchParams } = new URL(request.url)
		const employee = searchParams.get('employee')
		const leaveType = searchParams.get('leave_type')
		const totalDays = searchParams.get('total_days')

		if (!employee || !leaveType || !totalDays) {
			return NextResponse.json(
				{ error: 'Missing required parameters' },
				{ status: 400 }
			)
		}

		// Get the employee record to find company_id
		const { data: emp } = await supabaseAdmin
			.from('ess_employees')
			.select('id, company_id')
			.or(`id.eq.${employee},employee_no.eq.${employee}`)
			.single()

		if (!emp) {
			return NextResponse.json({ error: 'Employee not found' }, { status: 404 })
		}

		// Find matching approval rules
		const { data: rules } = await supabaseAdmin
			.from('ess_approval_rules')
			.select(`
				*,
				specific_approver:ess_employees!ess_approval_rules_specific_approver_id_fkey(id, full_name, employee_no)
			`)
			.eq('company_id', emp.company_id)
			.eq('rule_type', 'leave')
			.eq('is_active', true)
			.order('level_no')

		if (!rules || rules.length === 0) {
			// Default: reporting manager
			const { data: manager } = await supabaseAdmin
				.from('ess_employees')
				.select('id, full_name, employee_no')
				.eq('id', emp.id)
				.single()

			if (manager) {
				const { data: reportsTo } = await supabaseAdmin
					.from('ess_employees')
					.select('id, full_name, employee_no')
					.eq('id', manager.id)
					.single()

				return NextResponse.json({
					approval_chain: [{
						level: 1,
						approver_type: 'reporting_manager',
						approver_name: reportsTo?.full_name || 'Reporting Manager',
						approver_id: reportsTo?.employee_no || '',
					}]
				})
			}
		}

		const chain = await Promise.all(
			(rules || []).map(async (rule) => {
				let approverName = 'Unknown'
				let approverId = ''

				if (rule.approver_type === 'specific' && rule.specific_approver) {
					approverName = (rule.specific_approver as any).full_name
					approverId = (rule.specific_approver as any).employee_no
				} else if (rule.approver_type === 'reporting_manager') {
					const { data: empData } = await supabaseAdmin
						.from('ess_employees')
						.select('reports_to')
						.eq('id', emp.id)
						.single()

					if (empData?.reports_to) {
						const { data: mgr } = await supabaseAdmin
							.from('ess_employees')
							.select('full_name, employee_no')
							.eq('id', empData.reports_to)
							.single()

						if (mgr) {
							approverName = mgr.full_name
							approverId = mgr.employee_no
						}
					}
				}

				return {
					level: rule.level_no,
					approver_type: rule.approver_type,
					approver_name: approverName,
					approver_id: approverId,
				}
			})
		)

		return NextResponse.json({ approval_chain: chain })
	} catch (error) {
		console.error('Error previewing approval chain:', error)
		return NextResponse.json(
			{ error: 'Internal server error' },
			{ status: 500 }
		)
	}
}
