import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'

export async function POST(request: NextRequest) {
	try {
		const authHeader = request.headers.get('authorization')
		const token = authHeader?.replace('Bearer ', '')

		if (!token) {
			return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
		}

		const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
		if (authError || !user) {
			return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
		}

		// Find the employee record
		const { data: appUser } = await supabaseAdmin
			.from('ess_app_users')
			.select('id')
			.eq('auth_user_id', user.id)
			.eq('is_active', true)
			.single()

		if (!appUser) {
			return NextResponse.json({ error: 'Not registered for ESS' }, { status: 403 })
		}

		const { data: employee } = await supabaseAdmin
			.from('ess_employees')
			.select('id')
			.eq('app_user_id', appUser.id)
			.single()

		if (!employee) {
			return NextResponse.json({ error: 'Employee not found' }, { status: 404 })
		}

		const formData = await request.formData()
		const file = formData.get('file') as File

		if (!file) {
			return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })
		}

		// Validate file type
		if (!file.type.startsWith('image/')) {
			return NextResponse.json({ error: 'Only image files are allowed' }, { status: 400 })
		}

		// Max 5MB
		if (file.size > 5 * 1024 * 1024) {
			return NextResponse.json({ error: 'File size must be under 5MB' }, { status: 400 })
		}

		const ext = file.name.split('.').pop() || 'jpg'
		const filePath = `photos/${employee.id}.${ext}`

		const buffer = Buffer.from(await file.arrayBuffer())

		const { error: uploadError } = await supabaseAdmin
			.storage
			.from('ess-photos')
			.upload(filePath, buffer, {
				contentType: file.type,
				upsert: true,
			})

		if (uploadError) {
			// Try creating bucket if it doesn't exist
			if (uploadError.message?.includes('not found')) {
				await supabaseAdmin.storage.createBucket('ess-photos', {
					public: true,
					fileSizeLimit: 5 * 1024 * 1024,
				})

				const { error: retryError } = await supabaseAdmin
					.storage
					.from('ess-photos')
					.upload(filePath, buffer, {
						contentType: file.type,
						upsert: true,
					})

				if (retryError) throw retryError
			} else {
				throw uploadError
			}
		}

		// Get public URL
		const { data: urlData } = supabaseAdmin
			.storage
			.from('ess-photos')
			.getPublicUrl(filePath)

		const photoUrl = urlData.publicUrl

		// Update employee record
		await supabaseAdmin
			.from('ess_employees')
			.update({ photo_url: photoUrl, updated_at: new Date().toISOString() })
			.eq('id', employee.id)

		return NextResponse.json({
			message: 'Photo uploaded',
			photo_url: photoUrl,
		})
	} catch (error) {
		console.error('Photo upload error:', error)
		return NextResponse.json(
			{ error: 'Failed to upload photo' },
			{ status: 500 }
		)
	}
}
