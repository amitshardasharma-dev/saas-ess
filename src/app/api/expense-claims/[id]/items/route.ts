import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { withAuth } from '@/lib/auth-middleware'

/**
 * Expense claim items. [id] is the claim UUID (PK). Tenant scoping via the owning
 * employee inner join — a foreign-tenant claim resolves to 404 (no cross-tenant
 * read or write). display_id is not used as a key (not unique within a company).
 */
async function findClaimInCompany(id: string, companyId: string) {
  const { data } = await supabaseAdmin
    .from('ess_expense_claims')
    .select('id, status, ess_employees!ess_expense_claims_employee_id_fkey!inner(company_id)')
    .eq('id', id)
    .eq('ess_employees.company_id', companyId)
    .maybeSingle()
  return data
}

export const GET = withAuth(async (_request, { companyId }, params) => {
  const id = params?.id
  if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 })

  const claim = await findClaimInCompany(id, companyId)
  if (!claim) return NextResponse.json({ error: 'Claim not found' }, { status: 404 })

  const { data: items, error } = await supabaseAdmin
    .from('ess_expense_items')
    .select('*, ess_expense_categories (code, name)')
    .eq('expense_claim_id', claim.id)
    .order('expense_date')
  if (error) throw error
  return NextResponse.json({ items: items || [] })
})

export const POST = withAuth(async (request: NextRequest, { companyId }, params) => {
  const id = params?.id
  if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 })
  const body = await request.json()

  const claim = await findClaimInCompany(id, companyId)
  if (!claim) return NextResponse.json({ error: 'Claim not found' }, { status: 404 })
  if (claim.status !== 'Draft') return NextResponse.json({ error: 'Can only add items to draft claims' }, { status: 400 })

  const { data: newItem, error: insertError } = await supabaseAdmin
    .from('ess_expense_items')
    .insert({
      expense_claim_id: claim.id,
      category_id: body.category_id,
      description: body.description,
      amount: body.amount,
      expense_date: body.expense_date,
      receipt_url: body.receipt_url || null,
      receipt_filename: body.receipt_filename || null,
      has_receipt: !!body.receipt_url,
    })
    .select()
    .single()
  if (insertError) throw insertError

  const { data: allItems } = await supabaseAdmin
    .from('ess_expense_items').select('amount').eq('expense_claim_id', claim.id)
  const total = (allItems || []).reduce((sum, item) => sum + Number(item.amount), 0)
  await supabaseAdmin
    .from('ess_expense_claims')
    .update({ total_amount: total, updated_at: new Date().toISOString() })
    .eq('id', claim.id)

  return NextResponse.json({ item: newItem, new_total: total })
})

export const DELETE = withAuth(async (request: NextRequest, { companyId }, params) => {
  const id = params?.id
  if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 })
  const { searchParams } = new URL(request.url)
  const itemId = searchParams.get('itemId')
  if (!itemId) return NextResponse.json({ error: 'Item ID required' }, { status: 400 })

  const claim = await findClaimInCompany(id, companyId)
  // Separate the cross-tenant/not-found case (404) from the wrong-state case (400)
  // so a foreign-tenant DELETE returns 404, matching GET/POST (no existence leak).
  if (!claim) return NextResponse.json({ error: 'Claim not found' }, { status: 404 })
  if (claim.status !== 'Draft') return NextResponse.json({ error: 'Can only delete items from draft claims' }, { status: 400 })

  // Constrain the delete to this claim's items (can't delete another claim's item by id).
  await supabaseAdmin.from('ess_expense_items').delete().eq('id', itemId).eq('expense_claim_id', claim.id)

  const { data: allItems } = await supabaseAdmin
    .from('ess_expense_items').select('amount').eq('expense_claim_id', claim.id)
  const total = (allItems || []).reduce((sum, item) => sum + Number(item.amount), 0)
  await supabaseAdmin
    .from('ess_expense_claims')
    .update({ total_amount: total, updated_at: new Date().toISOString() })
    .eq('id', claim.id)

  return NextResponse.json({ message: 'Item deleted', new_total: total })
})
