import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'

export async function POST(
	request: NextRequest,
	{ params }: { params: Promise<{ id: string }> }
) {
	try {
		const { id } = await params
		const formData = await request.formData()
		const file = formData.get('receipt') as File
		const itemId = formData.get('itemId') as string

		if (!file) {
			return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })
		}

		// Validate file type
		const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
		if (!allowedTypes.includes(file.type)) {
			return NextResponse.json({ error: 'Only JPEG, PNG, WebP, and PDF files are allowed' }, { status: 400 })
		}

		// Max 10MB
		if (file.size > 10 * 1024 * 1024) {
			return NextResponse.json({ error: 'File size must be under 10MB' }, { status: 400 })
		}

		const ext = file.name.split('.').pop() || 'jpg'
		const filePath = `${id}/${itemId || Date.now()}.${ext}`

		const buffer = Buffer.from(await file.arrayBuffer())

		const { data: uploadData, error: uploadError } = await supabaseAdmin
			.storage
			.from('ess-receipts')
			.upload(filePath, buffer, {
				contentType: file.type,
				upsert: true,
			})

		if (uploadError) {
			// Try creating the bucket if it doesn't exist
			if (uploadError.message?.includes('not found')) {
				await supabaseAdmin.storage.createBucket('ess-receipts', {
					public: false,
					fileSizeLimit: 10 * 1024 * 1024,
				})

				const { error: retryError } = await supabaseAdmin
					.storage
					.from('ess-receipts')
					.upload(filePath, buffer, {
						contentType: file.type,
						upsert: true,
					})

				if (retryError) throw retryError
			} else {
				throw uploadError
			}
		}

		// Get the URL
		const { data: urlData } = supabaseAdmin
			.storage
			.from('ess-receipts')
			.getPublicUrl(filePath)

		const receiptUrl = urlData.publicUrl

		// Update the expense item if itemId provided
		if (itemId) {
			await supabaseAdmin
				.from('ess_expense_items')
				.update({
					receipt_url: receiptUrl,
					receipt_filename: file.name,
					has_receipt: true,
				})
				.eq('id', itemId)
		}

		return NextResponse.json({
			message: 'Receipt uploaded',
			url: receiptUrl,
			filename: file.name,
		})
	} catch (error) {
		console.error('Receipt upload error:', error)
		return NextResponse.json({ error: 'Failed to upload receipt' }, { status: 500 })
	}
}
