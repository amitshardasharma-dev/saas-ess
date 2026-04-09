import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { withAuth } from '@/lib/auth-middleware'

export const GET = withAuth(async (_request, { companyId }) => {
  const { data, error } = await supabaseAdmin
    .from('ess_document_categories')
    .select('*')
    .eq('company_id', companyId)
    .order('sort_order')

  if (error) throw error
  return NextResponse.json({ categories: data || [] })
})

export const POST = withAuth(async (request, { companyId }) => {
  const body = await request.json()

  const { data, error } = await supabaseAdmin
    .from('ess_document_categories')
    .insert({
      company_id: companyId,
      name: body.name,
      sort_order: body.sort_order ?? 0,
    })
    .select()
    .single()

  if (error) throw error
  return NextResponse.json({ category: data, message: 'Category created' })
}, { minRole: 'hr' })
