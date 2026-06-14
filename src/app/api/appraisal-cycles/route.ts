import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { withAuth } from '@/lib/auth-middleware'

export const GET = withAuth(async (_request: NextRequest, { companyId }) => {
	const { data: cycles, error } = await supabaseAdmin
		.from('ess_appraisal_cycles')
		.select(`
			*,
			ess_appraisal_templates (
				name
			)
		`)
		.eq('company_id', companyId)
		.order('created_at', { ascending: false })

	if (error) {
		console.error('Appraisal cycles fetch error:', error)
		return NextResponse.json({ error: 'Failed to fetch cycles' }, { status: 500 })
	}

	// Fetch completion counts for each cycle
	const cycleIds = (cycles || []).map((c) => c.id)
	const countsBycycle: Record<string, { total: number; completed: number }> = {}

	if (cycleIds.length > 0) {
		const { data: appraisals } = await supabaseAdmin
			.from('ess_appraisals')
			.select('cycle_id, status')
			.in('cycle_id', cycleIds)

		for (const a of appraisals || []) {
			if (!countsBycycle[a.cycle_id]) {
				countsBycycle[a.cycle_id] = { total: 0, completed: 0 }
			}
			countsBycycle[a.cycle_id].total++
			if (a.status === 'Completed') {
				countsBycycle[a.cycle_id].completed++
			}
		}
	}

	const processed = (cycles || []).map((c) => {
		const tmpl = c.ess_appraisal_templates as { name?: string } | null
		const counts = countsBycycle[c.id] || { total: 0, completed: 0 }
		return {
			...c,
			template_name: tmpl?.name ?? null,
			total_appraisals: counts.total,
			completed_count: counts.completed,
			ess_appraisal_templates: undefined,
		}
	})

	return NextResponse.json({ cycles: processed })
})

export const POST = withAuth(async (request: NextRequest, { companyId }) => {
	const body = await request.json()
	const {
		template_id,
		name,
		start_date,
		end_date,
		self_assessment_deadline,
		manager_review_deadline,
		status = 'Draft',
	} = body

	if (!template_id || !name || !start_date || !end_date || !self_assessment_deadline || !manager_review_deadline) {
		return NextResponse.json(
			{ error: 'template_id, name, start_date, end_date, self_assessment_deadline, and manager_review_deadline are required' },
			{ status: 400 }
		)
	}

	// Verify template belongs to company
	const { data: template } = await supabaseAdmin
		.from('ess_appraisal_templates')
		.select('id')
		.eq('id', template_id)
		.eq('company_id', companyId)
		.single()

	if (!template) {
		return NextResponse.json({ error: 'Template not found' }, { status: 404 })
	}

	const { data: cycle, error } = await supabaseAdmin
		.from('ess_appraisal_cycles')
		.insert({
			company_id: companyId,
			template_id,
			name,
			start_date,
			end_date,
			self_assessment_deadline,
			manager_review_deadline,
			status,
		})
		.select()
		.single()

	if (error) {
		console.error('Appraisal cycle create error:', error)
		return NextResponse.json({ error: 'Failed to create cycle' }, { status: 500 })
	}

	return NextResponse.json({ cycle }, { status: 201 })
}, { minRole: 'hr' })
