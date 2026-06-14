import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { withAuth } from '@/lib/auth-middleware'

/**
 * Upload a receipt for an expense item. [id] is the claim UUID (PK). Requires auth
 * and verifies the claim is in the caller's company (owning-employee inner join)
 * before accepting the upload — a foreign-tenant claim resolves to 404.
 */
export const POST = withAuth(async (request: NextRequest, { companyId }, params) => {
  const id = params?.id
  if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 })

  const { data: claim } = await supabaseAdmin
    .from('ess_expense_claims')
    .select('id, ess_employees!ess_expense_claims_employee_id_fkey!inner(company_id)')
    .eq('id', id)
    .eq('ess_employees.company_id', companyId)
    .maybeSingle()
  if (!claim) return NextResponse.json({ error: 'Claim not found' }, { status: 404 })

  // An empty/malformed multipart body makes formData() throw — return a clean 400.
  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })
  }

  const file = formData.get('receipt') as File
  const itemId = formData.get('itemId') as string

  if (!file) {
    return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })
  }

  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
  if (!allowedTypes.includes(file.type)) {
    return NextResponse.json({ error: 'Only JPEG, PNG, WebP, and PDF files are allowed' }, { status: 400 })
  }
  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: 'File size must be under 10MB' }, { status: 400 })
  }

  const ext = file.name.split('.').pop() || 'jpg'
  const filePath = `${claim.id}/${itemId || Date.now()}.${ext}`
  const buffer = Buffer.from(await file.arrayBuffer())

  const { error: uploadError } = await supabaseAdmin
    .storage.from('ess-receipts')
    .upload(filePath, buffer, { contentType: file.type, upsert: true })

  if (uploadError) {
    if (uploadError.message?.includes('not found')) {
      await supabaseAdmin.storage.createBucket('ess-receipts', { public: false, fileSizeLimit: 10 * 1024 * 1024 })
      const { error: retryError } = await supabaseAdmin
        .storage.from('ess-receipts')
        .upload(filePath, buffer, { contentType: file.type, upsert: true })
      if (retryError) throw retryError
    } else {
      throw uploadError
    }
  }

  const { data: urlData } = supabaseAdmin.storage.from('ess-receipts').getPublicUrl(filePath)
  const receiptUrl = urlData.publicUrl

  // Update the expense item if itemId provided — constrained to this claim's items.
  if (itemId) {
    await supabaseAdmin
      .from('ess_expense_items')
      .update({ receipt_url: receiptUrl, receipt_filename: file.name, has_receipt: true })
      .eq('id', itemId)
      .eq('expense_claim_id', claim.id)
  }

  return NextResponse.json({ message: 'Receipt uploaded', url: receiptUrl, filename: file.name })
})
