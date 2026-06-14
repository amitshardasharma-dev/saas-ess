import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { withAuth } from '@/lib/auth-middleware'
import { completeLinkedOnboardingStep } from '@/lib/onboarding'

export const POST = withAuth(async (_request, { employee, companyId }, params) => {
  const id = params?.id
  if (!id || !employee) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })

  // IDOR fix: verify the document belongs to the caller's company BEFORE writing
  // an acknowledgment, so a forged id can't create acknowledgments against another
  // tenant's documents. Cross-tenant -> 404.
  const { data: document } = await supabaseAdmin
    .from('ess_documents')
    .select('id')
    .eq('id', id)
    .eq('company_id', companyId)
    .single()

  if (!document) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

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

  // Auto-complete the linked onboarding step (doc_ack -> this document).
  try {
    await completeLinkedOnboardingStep(employee.id, { stepType: 'doc_ack', refId: id })
  } catch (hookErr) {
    console.error('[documents] ack onboarding hook failed (non-fatal):', (hookErr as Error)?.message)
  }

  return NextResponse.json({ message: 'Document acknowledged' })
})
