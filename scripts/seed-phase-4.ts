/**
 * seed-phase-4.ts — Phase 4 (E-Signatures) demo seed.
 *
 * Idempotent. Do NOT run automatically in this worktree (code+typecheck only).
 * Run manually with the service-role key set:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/seed-phase-4.ts
 *
 * Seeds (spec §9): a "Volunteer Code of Conduct" document with a typed-name
 * signature field; one volunteer who has signed and one who hasn't. Reuses the
 * Birch Foundation tenant by slug. Guards every prerequisite and exits cleanly
 * if the upstream data (tenant / employees) is missing.
 */
import { createHash } from 'crypto'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const BIRCH_SLUG = 'birch-foundation'

function getClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to run the seed.')
  }
  return createClient(url, key, { auth: { persistSession: false } })
}

async function main(): Promise<void> {
  const supabase = getClient()

  // 0. Resolve the Birch tenant.
  const { data: company } = await supabase
    .from('ess_companies')
    .select('id, settings')
    .eq('slug', BIRCH_SLUG)
    .maybeSingle()
  if (!company) {
    console.log('[seed-phase-4] Birch tenant not found; run earlier seeds first. Skipping.')
    return
  }
  const companyId = company.id as string

  // 1. Ensure documents_esign is enabled in settings.modules_enabled.
  const settings = (company.settings as Record<string, unknown> | null) ?? {}
  const enabled = Array.isArray(settings.modules_enabled)
    ? (settings.modules_enabled as string[])
    : []
  if (!enabled.includes('documents_esign')) {
    await supabase
      .from('ess_companies')
      .update({ settings: { ...settings, modules_enabled: [...enabled, 'documents', 'documents_esign'] } })
      .eq('id', companyId)
  }

  // 2. Need at least one employee to be `created_by` + a couple of signers.
  const { data: employees } = await supabase
    .from('ess_employees')
    .select('id, full_name')
    .eq('company_id', companyId)
    .limit(3)
  if (!employees || employees.length === 0) {
    console.log('[seed-phase-4] No employees for tenant; run earlier seeds first. Skipping.')
    return
  }
  const creator = employees[0]
  const signer = employees[1] ?? employees[0]

  // 3. Upsert the "Volunteer Code of Conduct" document + a version (idempotent).
  let documentId: string
  const { data: existingDoc } = await supabase
    .from('ess_documents')
    .select('id')
    .eq('company_id', companyId)
    .eq('title', 'Volunteer Code of Conduct')
    .maybeSingle()
  if (existingDoc) {
    documentId = existingDoc.id as string
  } else {
    const { data: doc } = await supabase
      .from('ess_documents')
      .insert({
        company_id: companyId,
        title: 'Volunteer Code of Conduct',
        description: 'Please read and sign.',
        is_published: true,
        requires_acknowledgment: false,
        created_by: creator.id,
      })
      .select('id')
      .single()
    documentId = doc!.id as string
  }

  let versionId: string
  const { data: existingVersion } = await supabase
    .from('ess_document_versions')
    .select('id')
    .eq('document_id', documentId)
    .order('version_number', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (existingVersion) {
    versionId = existingVersion.id as string
  } else {
    const versionPath = `${companyId}/documents/${documentId}/v1/code-of-conduct.pdf`
    const stub = Buffer.from('%PDF-1.4\n% Volunteer Code of Conduct (seed)\n')
    await supabase.storage.from('ess-documents').upload(versionPath, stub, {
      contentType: 'application/pdf',
      upsert: true,
    })
    const { data: pub } = supabase.storage.from('ess-documents').getPublicUrl(versionPath)
    const { data: version } = await supabase
      .from('ess_document_versions')
      .insert({
        document_id: documentId,
        version_number: 1,
        file_url: pub.publicUrl || versionPath,
        file_name: 'code-of-conduct.pdf',
        file_size: stub.length,
        uploaded_by: creator.id,
      })
      .select('id')
      .single()
    versionId = version!.id as string
  }

  // 4. Define a typed-name signature field (idempotent replace).
  await supabase.from('ess_document_fields').delete().eq('version_id', versionId)
  await supabase.from('ess_document_fields').insert([
    {
      company_id: companyId,
      document_id: documentId,
      version_id: versionId,
      field_key: 'signature',
      label: 'Signature',
      type: 'signature',
      required: true,
      page: 1,
      x_ratio: 0.1,
      y_ratio: 0.8,
      width_ratio: 0.3,
      height_ratio: 0.08,
      sort_order: 0,
    },
  ])

  // 5. One volunteer who HAS signed (the other employee remains "pending").
  const { data: alreadySigned } = await supabase
    .from('ess_signed_documents')
    .select('id')
    .eq('company_id', companyId)
    .eq('version_id', versionId)
    .eq('employee_id', signer.id)
    .maybeSingle()

  if (!alreadySigned) {
    const signedPath = `${companyId}/${documentId}/${versionId}/${signer.id}-seed.pdf`
    const signedBytes = Buffer.from('%PDF-1.4\n% Signed Volunteer Code of Conduct (seed)\n')
    const contentHash = createHash('sha256').update(signedBytes).digest('hex')
    await supabase.storage.from('signed-documents').upload(signedPath, signedBytes, {
      contentType: 'application/pdf',
      upsert: true,
    })
    const { data: signed } = await supabase
      .from('ess_signed_documents')
      .insert({
        company_id: companyId,
        document_id: documentId,
        version_id: versionId,
        employee_id: signer.id,
        signer_name: signer.full_name ?? 'Demo Volunteer',
        signature_type: 'typed',
        signature_data: signer.full_name ?? 'Demo Volunteer',
        field_values: { signature: signer.full_name ?? 'Demo Volunteer' },
        signed_pdf_url: signedPath,
        content_hash: contentHash,
        ip_address: '127.0.0.1',
        user_agent: 'seed-script',
      })
      .select('id')
      .single()
    if (signed) {
      await supabase.from('ess_esign_events').insert({
        company_id: companyId,
        signed_document_id: signed.id,
        document_id: documentId,
        version_id: versionId,
        event: 'signed',
        actor: signer.id,
        meta: { seeded: true, content_hash: contentHash },
      })
    }
  }

  console.log('[seed-phase-4] Done. Document:', documentId, 'version:', versionId)
}

main().catch((err) => {
  console.error('[seed-phase-4] Failed:', err)
  process.exitCode = 1
})
