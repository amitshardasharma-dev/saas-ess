import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { withAuth } from '@/lib/auth-middleware'

function calcDaysUntilExpiry(endDate: string | null): number | null {
	if (!endDate) return null
	const now = new Date()
	const end = new Date(endDate)
	const diffMs = end.getTime() - now.getTime()
	return Math.ceil(diffMs / (1000 * 60 * 60 * 24))
}

export const GET = withAuth(async (_request: NextRequest, { companyId }, params) => {
	const id = params?.id
	if (!id) {
		return NextResponse.json({ error: 'Contract ID required' }, { status: 400 })
	}

	const { data: contract, error } = await supabaseAdmin
		.from('ess_contracts')
		.select(`
			*,
			ess_employees!ess_contracts_employee_id_fkey (
				full_name,
				employee_no
			),
			ess_contract_types (
				name,
				requires_end_date,
				default_duration_months
			)
		`)
		.eq('id', id)
		.eq('company_id', companyId)
		.single()

	if (error || !contract) {
		return NextResponse.json({ error: 'Contract not found' }, { status: 404 })
	}

	const emp = contract.ess_employees as any
	const ctype = contract.ess_contract_types as any

	return NextResponse.json({
		contract: {
			...contract,
			employee_name: emp?.full_name ?? null,
			employee_no: emp?.employee_no ?? null,
			contract_type_name: ctype?.name ?? null,
			days_until_expiry: calcDaysUntilExpiry(contract.end_date),
			ess_employees: undefined,
			ess_contract_types: undefined,
		},
	})
})

export const PUT = withAuth(async (request: NextRequest, { companyId }, params) => {
	const id = params?.id
	if (!id) {
		return NextResponse.json({ error: 'Contract ID required' }, { status: 400 })
	}

	const body = await request.json()
	// Strip non-updatable fields
	const { id: _id, company_id: _cid, created_by: _cb, created_at: _ca, ...updates } = body

	const { data: contract, error } = await supabaseAdmin
		.from('ess_contracts')
		.update({ ...updates, updated_at: new Date().toISOString() })
		.eq('id', id)
		.eq('company_id', companyId)
		.select()
		.single()

	if (error || !contract) {
		console.error('Contract update error:', error)
		return NextResponse.json({ error: 'Failed to update contract' }, { status: 500 })
	}

	return NextResponse.json({ contract })
}, { minRole: 'hr' })

export const POST = withAuth(async (request: NextRequest, { companyId }, params) => {
	// File upload
	const id = params?.id
	if (!id) {
		return NextResponse.json({ error: 'Contract ID required' }, { status: 400 })
	}

	// Verify contract belongs to this company and get employee_id
	const { data: existing, error: fetchError } = await supabaseAdmin
		.from('ess_contracts')
		.select('id, employee_id')
		.eq('id', id)
		.eq('company_id', companyId)
		.single()

	if (fetchError || !existing) {
		return NextResponse.json({ error: 'Contract not found' }, { status: 404 })
	}

	const formData = await request.formData()
	const file = formData.get('file') as File | null

	if (!file) {
		return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })
	}

	// Max 20MB for contract documents
	if (file.size > 20 * 1024 * 1024) {
		return NextResponse.json({ error: 'File size must be under 20MB' }, { status: 400 })
	}

	const filename = file.name
	const filePath = `${companyId}/contracts/${existing.employee_id}/${filename}`

	const buffer = Buffer.from(await file.arrayBuffer())

	const { error: uploadError } = await supabaseAdmin
		.storage
		.from('ess-contracts')
		.upload(filePath, buffer, {
			contentType: file.type,
			upsert: true,
		})

	if (uploadError) {
		if (uploadError.message?.includes('not found')) {
			await supabaseAdmin.storage.createBucket('ess-contracts', {
				public: false,
				fileSizeLimit: 20 * 1024 * 1024,
			})

			const { error: retryError } = await supabaseAdmin
				.storage
				.from('ess-contracts')
				.upload(filePath, buffer, {
					contentType: file.type,
					upsert: true,
				})

			if (retryError) {
				console.error('Contract file upload retry error:', retryError)
				return NextResponse.json({ error: 'Failed to upload file' }, { status: 500 })
			}
		} else {
			console.error('Contract file upload error:', uploadError)
			return NextResponse.json({ error: 'Failed to upload file' }, { status: 500 })
		}
	}

	const { data: urlData } = supabaseAdmin
		.storage
		.from('ess-contracts')
		.getPublicUrl(filePath)

	const fileUrl = urlData.publicUrl

	const { data: contract, error: updateError } = await supabaseAdmin
		.from('ess_contracts')
		.update({ file_url: fileUrl, file_name: filename, updated_at: new Date().toISOString() })
		.eq('id', id)
		.select()
		.single()

	if (updateError) {
		console.error('Contract file_url update error:', updateError)
		return NextResponse.json({ error: 'File uploaded but record update failed' }, { status: 500 })
	}

	return NextResponse.json({ contract, file_url: fileUrl, file_name: filename })
}, { minRole: 'hr' })

export const DELETE = withAuth(async (_request: NextRequest, { companyId }, params) => {
	const id = params?.id
	if (!id) {
		return NextResponse.json({ error: 'Contract ID required' }, { status: 400 })
	}

	const { error } = await supabaseAdmin
		.from('ess_contracts')
		.delete()
		.eq('id', id)
		.eq('company_id', companyId)

	if (error) {
		console.error('Contract delete error:', error)
		return NextResponse.json({ error: 'Failed to delete contract' }, { status: 500 })
	}

	return NextResponse.json({ message: 'Contract deleted successfully' })
}, { minRole: 'hr' })
