// Volunteer types (Op shop, Events, ...) and who has them.
//
// Each type owns one onboarding template (audience 'type'). A person can have
// several types; their checklist = base flow + each type's flow (see
// syncOnboardingForPeople). Every change to a type, its flow or a person's
// types re-syncs the affected checklists: completed steps always stay.

import { supabaseAdmin } from '@/lib/supabase-admin'
import { syncOnboardingForPeople, type SyncStats } from '@/lib/onboarding'
import type { VolunteerType } from '@/types/onboarding'

type Fail = { ok: false; status: number; error: string }

export interface VolunteerTypeWithCount extends VolunteerType {
  templateId: string
  memberCount: number
}

const EMPTY_SYNC: SyncStats = { people: 0, added: 0, removed: 0, autoCompleted: 0 }

// Long `in (...)` lists make long request URLs. Keep each list short.
function chunk<T>(arr: T[], size = 100): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

/** Get (or lazily create) the template a type owns. */
export async function ensureTypeTemplate(companyId: string, typeId: string, name: string): Promise<string> {
  const { data: existing } = await supabaseAdmin
    .from('ess_onboarding_templates')
    .select('id')
    .eq('company_id', companyId)
    .eq('volunteer_type_id', typeId)
    .maybeSingle()
  if (existing) return existing.id as string
  const { data, error } = await supabaseAdmin
    .from('ess_onboarding_templates')
    .insert({ company_id: companyId, name: `${name} onboarding`, description: `Onboarding for ${name}`, audience: 'type', is_default: false, volunteer_type_id: typeId })
    .select('id')
    .single()
  if (error || !data) throw new Error(`ensureTypeTemplate: ${error?.message ?? 'no row'}`)
  return data.id as string
}

export async function listVolunteerTypes(companyId: string): Promise<VolunteerTypeWithCount[]> {
  const [{ data: types }, { data: templates }, { data: members }] = await Promise.all([
    supabaseAdmin.from('ess_volunteer_types').select('id, name, description, sort_order').eq('company_id', companyId),
    supabaseAdmin.from('ess_onboarding_templates').select('id, volunteer_type_id').eq('company_id', companyId).not('volunteer_type_id', 'is', null),
    supabaseAdmin.from('ess_employee_volunteer_types').select('volunteer_type_id').eq('company_id', companyId).limit(100000),
  ])
  const templateByType = new Map((templates ?? []).map((t) => [t.volunteer_type_id as string, t.id as string]))
  const counts = new Map<string, number>()
  for (const m of members ?? []) counts.set(m.volunteer_type_id as string, (counts.get(m.volunteer_type_id as string) ?? 0) + 1)

  const out: VolunteerTypeWithCount[] = []
  for (const t of (types ?? []) as VolunteerType[]) {
    const templateId = templateByType.get(t.id) ?? (await ensureTypeTemplate(companyId, t.id, t.name))
    out.push({ ...t, description: t.description ?? null, templateId, memberCount: counts.get(t.id) ?? 0 })
  }
  return out.sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
}

export async function createVolunteerType(
  companyId: string,
  input: { name: string; description?: string | null },
): Promise<{ ok: true; type: VolunteerTypeWithCount } | Fail> {
  const name = input.name.trim()
  if (!name || name.length > 80) return { ok: false, status: 400, error: 'A name of 1 to 80 characters is required' }

  const { data: existing } = await supabaseAdmin.from('ess_volunteer_types').select('id, name, sort_order').eq('company_id', companyId)
  if ((existing ?? []).some((t) => (t.name as string).trim().toLowerCase() === name.toLowerCase())) {
    return { ok: false, status: 409, error: `A volunteer type called "${name}" already exists` }
  }
  const nextOrder = Math.max(-1, ...(existing ?? []).map((t) => Number(t.sort_order) || 0)) + 1

  const { data, error } = await supabaseAdmin
    .from('ess_volunteer_types')
    .insert({ company_id: companyId, name, description: input.description?.trim() || null, sort_order: nextOrder })
    .select('id, name, description, sort_order')
    .single()
  if (error || !data) return { ok: false, status: 500, error: error?.message ?? 'Could not create the type' }
  const templateId = await ensureTypeTemplate(companyId, data.id as string, name)
  return { ok: true, type: { ...(data as VolunteerType), templateId, memberCount: 0 } }
}

export async function updateVolunteerType(
  companyId: string,
  typeId: string,
  patch: { name?: string; description?: string | null; sort_order?: number },
): Promise<{ ok: true; type: VolunteerType } | Fail> {
  const { data: type } = await supabaseAdmin.from('ess_volunteer_types').select('id').eq('company_id', companyId).eq('id', typeId).maybeSingle()
  if (!type) return { ok: false, status: 404, error: 'Volunteer type not found' }

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (patch.name !== undefined) {
    const name = patch.name.trim()
    if (!name || name.length > 80) return { ok: false, status: 400, error: 'A name of 1 to 80 characters is required' }
    const { data: clash } = await supabaseAdmin.from('ess_volunteer_types').select('id, name').eq('company_id', companyId).neq('id', typeId)
    if ((clash ?? []).some((t) => (t.name as string).trim().toLowerCase() === name.toLowerCase())) {
      return { ok: false, status: 409, error: `A volunteer type called "${name}" already exists` }
    }
    update.name = name
  }
  if (patch.description !== undefined) update.description = patch.description?.trim() || null
  if (patch.sort_order !== undefined) update.sort_order = patch.sort_order

  const { data, error } = await supabaseAdmin
    .from('ess_volunteer_types')
    .update(update)
    .eq('company_id', companyId)
    .eq('id', typeId)
    .select('id, name, description, sort_order')
    .single()
  if (error || !data) return { ok: false, status: 500, error: error?.message ?? 'Could not update the type' }
  if (update.name) {
    await supabaseAdmin.from('ess_onboarding_templates').update({ name: `${update.name} onboarding` }).eq('company_id', companyId).eq('volunteer_type_id', typeId)
  }
  return { ok: true, type: data as VolunteerType }
}

/**
 * Delete a type. Its flow and the memberships go with it (FK cascade). The
 * people who had it are re-synced: their open steps from this type go away,
 * completed ones stay.
 */
export async function deleteVolunteerType(
  companyId: string,
  typeId: string,
): Promise<{ ok: true; sync: SyncStats; members: number } | Fail> {
  const { data: type } = await supabaseAdmin.from('ess_volunteer_types').select('id').eq('company_id', companyId).eq('id', typeId).maybeSingle()
  if (!type) return { ok: false, status: 404, error: 'Volunteer type not found' }

  const { data: members } = await supabaseAdmin
    .from('ess_employee_volunteer_types')
    .select('employee_id')
    .eq('company_id', companyId)
    .eq('volunteer_type_id', typeId)
    .limit(100000)
  const memberIds = (members ?? []).map((m) => m.employee_id as string)

  const { error } = await supabaseAdmin.from('ess_volunteer_types').delete().eq('company_id', companyId).eq('id', typeId)
  if (error) return { ok: false, status: 500, error: error.message }

  const sync = memberIds.length ? await syncOnboardingForPeople(companyId, { employeeIds: memberIds }) : EMPTY_SYNC
  return { ok: true, sync, members: memberIds.length }
}

/** The types each of these people has (company-scoped). */
export async function typesForPeople(companyId: string, employeeIds?: string[]): Promise<Map<string, string[]>> {
  const rows: Array<{ employee_id: string; volunteer_type_id: string }> = []
  const base = () => supabaseAdmin.from('ess_employee_volunteer_types').select('employee_id, volunteer_type_id').eq('company_id', companyId).limit(100000)
  if (employeeIds) {
    for (const ids of chunk(employeeIds)) {
      const { data } = await base().in('employee_id', ids)
      rows.push(...((data ?? []) as typeof rows))
    }
  } else {
    const { data } = await base()
    rows.push(...((data ?? []) as typeof rows))
  }
  const out = new Map<string, string[]>()
  for (const r of rows) {
    if (!out.has(r.employee_id)) out.set(r.employee_id, [])
    out.get(r.employee_id)!.push(r.volunteer_type_id)
  }
  return out
}

async function validTypeIds(companyId: string, typeIds: string[]): Promise<boolean> {
  if (typeIds.length === 0) return true
  const { data } = await supabaseAdmin.from('ess_volunteer_types').select('id').eq('company_id', companyId).in('id', typeIds)
  return (data ?? []).length === new Set(typeIds).size
}

/**
 * Write a person's type memberships without syncing (used while creating a
 * person, before their first checklist exists).
 */
export async function writePersonTypes(
  companyId: string,
  employeeId: string,
  typeIds: string[],
  actorAppUserId: string | null,
): Promise<{ ok: true; added: string[]; removed: string[] } | Fail> {
  const wanted = [...new Set(typeIds)]
  if (!(await validTypeIds(companyId, wanted))) return { ok: false, status: 400, error: 'A volunteer type is invalid for this company' }

  const current = (await typesForPeople(companyId, [employeeId])).get(employeeId) ?? []
  const removed = current.filter((t) => !wanted.includes(t))
  const added = wanted.filter((t) => !current.includes(t))
  if (removed.length) {
    const { error } = await supabaseAdmin
      .from('ess_employee_volunteer_types')
      .delete()
      .eq('company_id', companyId)
      .eq('employee_id', employeeId)
      .in('volunteer_type_id', removed)
    if (error) return { ok: false, status: 500, error: error.message }
  }
  if (added.length) {
    const { error } = await supabaseAdmin.from('ess_employee_volunteer_types').insert(
      added.map((t) => ({ company_id: companyId, employee_id: employeeId, volunteer_type_id: t, assigned_by: actorAppUserId })),
    )
    if (error) return { ok: false, status: 500, error: error.message }
  }
  return { ok: true, added, removed }
}

/** Replace one person's types, then re-sync their checklist. */
export async function setPersonVolunteerTypes(
  companyId: string,
  employeeId: string,
  typeIds: string[],
  actorAppUserId: string,
): Promise<{ ok: true; added: string[]; removed: string[]; sync: SyncStats } | Fail> {
  const { data: emp } = await supabaseAdmin.from('ess_employees').select('id').eq('company_id', companyId).eq('id', employeeId).maybeSingle()
  if (!emp) return { ok: false, status: 404, error: 'Person not found' }
  const res = await writePersonTypes(companyId, employeeId, typeIds, actorAppUserId)
  if (!res.ok) return res
  const sync = res.added.length || res.removed.length ? await syncOnboardingForPeople(companyId, { employeeIds: [employeeId] }) : EMPTY_SYNC
  return { ...res, sync }
}

/** Add one type to (or remove it from) many people at once, then re-sync them. */
export async function bulkSetVolunteerType(
  companyId: string,
  employeeIds: string[],
  typeId: string,
  action: 'add' | 'remove',
  actorAppUserId: string,
): Promise<{ ok: true; changed: number; sync: SyncStats } | Fail> {
  const ids = [...new Set(employeeIds)]
  if (!(await validTypeIds(companyId, [typeId]))) return { ok: false, status: 400, error: 'The volunteer type is invalid for this company' }
  let found = 0
  for (const part of chunk(ids)) {
    const { data: emps } = await supabaseAdmin.from('ess_employees').select('id').eq('company_id', companyId).in('id', part)
    found += (emps ?? []).length
  }
  if (found !== ids.length) return { ok: false, status: 400, error: 'A person is invalid for this company' }

  const current = await typesForPeople(companyId, ids)
  let changedIds: string[]
  if (action === 'add') {
    changedIds = ids.filter((id) => !(current.get(id) ?? []).includes(typeId))
    for (const part of chunk(changedIds, 500)) {
      const { error } = await supabaseAdmin.from('ess_employee_volunteer_types').insert(
        part.map((id) => ({ company_id: companyId, employee_id: id, volunteer_type_id: typeId, assigned_by: actorAppUserId })),
      )
      if (error) return { ok: false, status: 500, error: error.message }
    }
  } else {
    changedIds = ids.filter((id) => (current.get(id) ?? []).includes(typeId))
    for (const part of chunk(changedIds)) {
      const { error } = await supabaseAdmin
        .from('ess_employee_volunteer_types')
        .delete()
        .eq('company_id', companyId)
        .eq('volunteer_type_id', typeId)
        .in('employee_id', part)
      if (error) return { ok: false, status: 500, error: error.message }
    }
  }
  const sync = changedIds.length ? await syncOnboardingForPeople(companyId, { employeeIds: changedIds }) : EMPTY_SYNC
  return { ok: true, changed: changedIds.length, sync }
}
