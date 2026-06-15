// Training expiry scan: when a completed training passes its expiry, reset the
// person's progress so the SAME module becomes due again (it then shows RED on
// the Compliance Register and re-appears in their learning view), and notify
// them in their inbox. Idempotent — only acts on completed+expired rows.
import { supabaseAdmin } from '@/lib/supabase-admin'
import { notifyEmployeeInbox, escapeHtml } from '@/lib/communications/notify'

export async function scanExpiredTrainings(companyId: string): Promise<{ reset: number }> {
  const nowIso = new Date().toISOString()

  const { data: expired } = await supabaseAdmin
    .from('ess_training_progress')
    .select('id, employee_id, module_id')
    .eq('company_id', companyId)
    .eq('status', 'complete')
    .not('expires_at', 'is', null)
    .lte('expires_at', nowIso)
  const rows = expired ?? []
  if (rows.length === 0) return { reset: 0 }

  // Module titles (for the notification) + item ids (to clear item progress).
  const moduleIds = [...new Set(rows.map((r) => r.module_id as string))]
  const titleById = new Map<string, string>()
  {
    const { data } = await supabaseAdmin.from('ess_training_modules').select('id, title').in('id', moduleIds)
    for (const m of data ?? []) titleById.set(m.id as string, (m as { title?: string }).title ?? 'Training')
  }
  const itemsByModule = new Map<string, string[]>()
  {
    const { data } = await supabaseAdmin.from('ess_training_items').select('id, module_id').in('module_id', moduleIds).eq('company_id', companyId)
    for (const it of data ?? []) {
      const arr = itemsByModule.get(it.module_id as string) ?? []
      arr.push(it.id as string)
      itemsByModule.set(it.module_id as string, arr)
    }
  }

  let reset = 0
  for (const r of rows) {
    const employeeId = r.employee_id as string
    const moduleId = r.module_id as string

    // Clear item progress so the module is genuinely re-done from scratch.
    const itemIds = itemsByModule.get(moduleId) ?? []
    if (itemIds.length) {
      await supabaseAdmin
        .from('ess_training_item_progress')
        .delete()
        .eq('company_id', companyId)
        .eq('employee_id', employeeId)
        .in('item_id', itemIds)
    }

    // Reset module progress -> due again.
    await supabaseAdmin
      .from('ess_training_progress')
      .update({ status: 'not_started', percent_complete: 0, started_at: null, completed_at: null, expires_at: null, updated_at: nowIso })
      .eq('id', r.id as string)
      .eq('company_id', companyId)

    const title = titleById.get(moduleId) ?? 'Training'
    try {
      await notifyEmployeeInbox({
        companyId,
        employeeId,
        senderAppUserId: null,
        subject: `Training due again: "${title}"`,
        bodyHtml: `<p>Your training <strong>${escapeHtml(title)}</strong> has expired and needs to be completed again.</p><p style="margin:8px 0 0;color:#555">Open <strong>Training Modules</strong> (or your Compliance Register) to redo it.</p>`,
      })
    } catch {
      /* notification is best-effort */
    }
    reset += 1
  }

  return { reset }
}
