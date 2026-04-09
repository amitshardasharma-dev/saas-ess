import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { withAuth } from '@/lib/auth-middleware'

export const POST = withAuth(async (_request, { employee }, params) => {
  const id = params?.id
  if (!id || !employee) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })

  // Get latest version
  const { data: latestVersion } = await supabaseAdmin
    .from('ess_document_versions')
    .select('id')
    .eq('document_id', id)
    .order('version_number', { ascending: false })
    .limit(1)
    .single()

  if (!latestVersion) {
    return NextResponse.json({ error: 'No version to acknowledge' }, { status: 400 })
  }

  // Upsert acknowledgment
  const { error } = await supabaseAdmin
    .from('ess_document_acknowledgments')
    .upsert({
      document_id: id,
      version_id: latestVersion.id,
      employee_id: employee.id,
      acknowledged_at: new Date().toISOString(),
    }, { onConflict: 'document_id,version_id,employee_id' })

  if (error) throw error
  return NextResponse.json({ message: 'Document acknowledged' })
})
