import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { withAuth } from '@/lib/auth-middleware'

export const GET = withAuth(async (_request: NextRequest, { companyId }) => {
	const { data: templates, error } = await supabaseAdmin
		.from('ess_appraisal_templates')
		.select('*')
		.eq('company_id', companyId)
		.order('created_at', { ascending: false })

	if (error) {
		console.error('Appraisal templates fetch error:', error)
		return NextResponse.json({ error: 'Failed to fetch templates' }, { status: 500 })
	}

	return NextResponse.json({ templates: templates || [] })
})

export const POST = withAuth(async (request: NextRequest, { companyId }) => {
	const body = await request.json()
	const { name, description = null, sections = [], is_default = false } = body

	if (!name) {
		return NextResponse.json({ error: 'name is required' }, { status: 400 })
	}

	// If setting as default, unset any existing default
	if (is_default) {
		await supabaseAdmin
			.from('ess_appraisal_templates')
			.update({ is_default: false })
			.eq('company_id', companyId)
			.eq('is_default', true)
	}

	const { data: template, error } = await supabaseAdmin
		.from('ess_appraisal_templates')
		.insert({ company_id: companyId, name, description, sections, is_default })
		.select()
		.single()

	if (error) {
		console.error('Appraisal template create error:', error)
		return NextResponse.json({ error: 'Failed to create template' }, { status: 500 })
	}

	return NextResponse.json({ template }, { status: 201 })
}, { minRole: 'hr' })
