import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { withAuth } from '@/lib/auth-middleware'

/**
 * Expense claim detail/edit/submit. [id] is the claim UUID (PK).
 *
 * ess_expense_claims has no company_id column, so tenant scoping is enforced via
 * the owning employee (inner join on company_id). uuid PK + company filter is a
 * hard cross-tenant guarantee: a claim outside the caller's company resolves to
 * 404 (no existence leak, no cross-tenant read/write). display_id is NOT used as
 * a key (it is per-employee sequential, not unique even within a company).
 */
async function findClaimInCompany(id: string, companyId: string) {
  const { data } = await supabaseAdmin
    .from('ess_expense_claims')
    .select('*, ess_employees!ess_expense_claims_employee_id_fkey!inner(company_id, employee_no, full_name, department)')
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

  const { data: items } = await supabaseAdmin
    .from('ess_expense_items')
    .select('*, ess_expense_categories (code, name)')
    .eq('expense_claim_id', claim.id)
    .order('expense_date')

  const { data: approvalEntries } = await supabaseAdmin
    .from('ess_expense_approval_entries')
    .select('*, ess_employees!ess_expense_approval_entries_approver_id_fkey (full_name, employee_no)')
    .eq('expense_claim_id', claim.id)
    .order('level_no')

  return NextResponse.json({ claim, items: items || [], approval_chain: approvalEntries || [] })
})

export const PUT = withAuth(async (request: NextRequest, { companyId }, params) => {
  const id = params?.id
  if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 })
  const body = await request.json()

  const claim = await findClaimInCompany(id, companyId)
  if (!claim) return NextResponse.json({ error: 'Claim not found' }, { status: 404 })
  if (claim.status !== 'Draft') return NextResponse.json({ error: 'Can only edit draft claims' }, { status: 400 })

  const { error } = await supabaseAdmin
    .from('ess_expense_claims')
    .update({ title: body.title, description: body.description, currency: body.currency, updated_at: new Date().toISOString() })
    .eq('id', claim.id)
  if (error) throw error
  return NextResponse.json({ message: 'Claim updated' })
})

// Submit claim for approval
export const POST = withAuth(async (_request, { companyId }, params) => {
  const id = params?.id
  if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 })

  const claim = await findClaimInCompany(id, companyId)
  if (!claim) return NextResponse.json({ error: 'Claim not found' }, { status: 404 })
  if (claim.status !== 'Draft') return NextResponse.json({ error: 'Can only submit draft claims' }, { status: 400 })
  if (Number(claim.total_amount) <= 0) {
    return NextResponse.json({ error: 'Add at least one expense item before submitting' }, { status: 400 })
  }

  const { data: employee } = await supabaseAdmin
    .from('ess_employees')
    .select('company_id, reports_to')
    .eq('id', claim.employee_id)
    .single()
  if (!employee) return NextResponse.json({ error: 'Employee not found' }, { status: 404 })

  const { data: rules } = await supabaseAdmin
    .from('ess_approval_rules')
    .select('*')
    .eq('company_id', employee.company_id)
    .eq('rule_type', 'expense')
    .eq('is_active', true)
    .order('level_no')

  for (const rule of rules || []) {
    const approverId = rule.approver_type === 'reporting_manager' ? employee.reports_to : rule.specific_approver_id
    if (approverId) {
      await supabaseAdmin.from('ess_expense_approval_entries').insert({
        expense_claim_id: claim.id, level_no: rule.level_no, approver_id: approverId, status: 'Pending',
      })
    }
  }

  await supabaseAdmin
    .from('ess_expense_claims')
    .update({ status: 'Pending Approval', submitted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', claim.id)

  return NextResponse.json({ message: 'Claim submitted for approval' })
})
