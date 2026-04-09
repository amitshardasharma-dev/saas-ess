import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { withAuth } from '@/lib/auth-middleware'

export const GET = withAuth(async (_request: NextRequest, { companyId }, params) => {
	const id = params?.id
	if (!id) {
		return NextResponse.json({ error: 'Template ID required' }, { status: 400 })
	}

	const { data: template, error } = await supabaseAdmin
		.from('ess_appraisal_templates')
		.select('*')
		.eq('id', id)
		.eq('company_id', companyId)
		.single()

	if (error || !template) {
		return NextResponse.json({ error: 'Template not found' }, { status: 404 })
	}

	return NextResponse.json({ template })
})

export const PUT = withAuth(async (request: NextRequest, { companyId }, params) => {
	const id = params?.id
	if (!id) {
		return NextResponse.json({ error: 'Template ID required' }, { status: 400 })
	}

	const body = await request.json()
	const { id: _id, company_id: _cid, created_at: _ca, ...updates } = body

	// If setting as default, unset any existing default (other than this one)
	if (updates.is_default) {
		await supabaseAdmin
			.from('ess_appraisal_templates')
			.update({ is_default: false })
			.eq('company_id', companyId)
			.eq('is_default', true)
			.neq('id', id)
	}

	const { data: template, error } = await supabaseAdmin
		.from('ess_appraisal_templates')
		.update({ ...updates, updated_at: new Date().toISOString() })
		.eq('id', id)
		.eq('company_id', companyId)
		.select()
		.single()

	if (error || !template) {
		console.error('Appraisal template update error:', error)
		return NextResponse.json({ error: 'Failed to update template' }, { status: 500 })
	}

	return NextResponse.json({ template })
}, { minRole: 'hr' })

export const DELETE = withAuth(async (_request: NextRequest, { companyId }, params) => {
	const id = params?.id
	if (!id) {
		return NextResponse.json({ error: 'Template ID required' }, { status: 400 })
	}

	const { error } = await supabaseAdmin
		.from('ess_appraisal_templates')
		.delete()
		.eq('id', id)
		.eq('company_id', companyId)

	if (error) {
		console.error('Appraisal template delete error:', error)
		return NextResponse.json({ error: 'Failed to delete template' }, { status: 500 })
	}

	return NextResponse.json({ message: 'Template deleted successfully' })
}, { minRole: 'hr' })
