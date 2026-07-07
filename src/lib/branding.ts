import { supabaseAdmin } from '@/lib/supabase-admin'

/**
 * The tenant's display name for anything customer-facing (certificates, emails,
 * portal chrome): the admin-set `settings.brand_name` if present, otherwise the
 * raw company name.
 */
export async function resolveOrgName(companyId: string, fallback = 'Our Organisation'): Promise<string> {
  try {
    const { data } = await supabaseAdmin.from('ess_companies').select('name, settings').eq('id', companyId).single()
    const brand = (data?.settings as { brand_name?: string } | null)?.brand_name
    return (brand && String(brand).trim()) || data?.name || fallback
  } catch {
    return fallback
  }
}
