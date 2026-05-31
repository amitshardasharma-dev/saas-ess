// src/app/api/training/groups/route.ts
//
// Custom training groups. GET lists groups (with member counts); POST creates a
// group + optional explicit members. Staff/Admin only.

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { withAuth } from '@/lib/auth-middleware'
import { createGroupSchema } from '@/types/training'

export const GET = withAuth(
  async (_request: NextRequest, { companyId }) => {
    const { data: groups, error } = await supabaseAdmin
      .from('ess_training_groups')
      .select('*')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })

    if (error) {
      return NextResponse.json({ error: 'Failed to fetch groups' }, { status: 500 })
    }
    return NextResponse.json({ groups: groups ?? [] })
  },
  { minRole: 'hr' }
)

export const POST = withAuth(
  async (request: NextRequest, { companyId }) => {
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }
    const parsed = createGroupSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
    }

    const { data: group, error } = await supabaseAdmin
      .from('ess_training_groups')
      .insert({
        company_id: companyId,
        name: parsed.data.name,
        criteria: parsed.data.criteria ?? null,
      })
      .select()
      .single()

    if (error) {
      console.error('[training] group create error:', error.message)
      return NextResponse.json({ error: 'Failed to create group' }, { status: 500 })
    }

    // Optional explicit members — verify each belongs to this tenant.
    const memberIds = parsed.data.member_ids ?? []
    if (memberIds.length > 0) {
      const { data: emps } = await supabaseAdmin
        .from('ess_employees')
        .select('id')
        .eq('company_id', companyId)
        .in('id', memberIds)
      const validIds = new Set((emps ?? []).map((e) => e.id as string))
      const rows = memberIds
        .filter((id) => validIds.has(id))
        .map((employee_id) => ({ company_id: companyId, group_id: group.id, employee_id }))
      if (rows.length > 0) {
        await supabaseAdmin.from('ess_training_group_members').insert(rows)
      }
    }

    return NextResponse.json({ group }, { status: 201 })
  },
  { minRole: 'hr' }
)
