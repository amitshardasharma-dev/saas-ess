/**
 * @jest-environment node
 *
 * Regression tests for buildTrainingReport (spec feature #8 reporting dashboard).
 *
 * Proves the two schema fixes:
 *   1. Rows come from ess_training_progress (migration 037) — NOT the non-existent
 *      ess_training_tracking — and map percent_complete/status/completed_at.
 *   2. quiz_score is populated by resolving each ess_quiz_attempts.training_item_id
 *      (migration 046) -> ess_training_items.module_id (migration 035), then keying
 *      best-score per (employee, module).
 *
 * Uses the repo's table-aware chainable supabaseAdmin mock pattern
 * (see training-assignments.test.ts) — canned data keyed by table + applied filters.
 */
jest.mock('@/lib/supabase-admin', () => {
  const db: Record<string, Record<string, unknown>[]> = {
    ess_employees: [],
    ess_training_progress: [],
    ess_training_tracking: [], // legacy/non-existent table — must stay UNUSED
    ess_training_modules: [],
    ess_training_items: [],
    ess_quiz_attempts: [],
  }

  function makeBuilder(table: string) {
    const eqs: { col: string; val: unknown }[] = []
    const ins: { col: string; vals: unknown[] }[] = []
    const chain: Record<string, unknown> = {}
    const passthrough = ['select', 'order', 'limit']
    passthrough.forEach((m) => {
      chain[m] = () => chain
    })
    chain.eq = (col: string, val: unknown) => {
      eqs.push({ col, val })
      return chain
    }
    chain.in = (col: string, vals: unknown[]) => {
      ins.push({ col, vals })
      return chain
    }
    const rows = () => {
      let data = db[table] ?? []
      for (const f of eqs) data = data.filter((r) => r[f.col] === f.val)
      for (const f of ins) data = data.filter((r) => (f.vals as unknown[]).includes(r[f.col]))
      return data
    }
    chain.single = () => Promise.resolve({ data: rows()[0] ?? null, error: null })
    chain.maybeSingle = () => Promise.resolve({ data: rows()[0] ?? null, error: null })
    ;(chain as { then: unknown }).then = (resolve: (v: unknown) => unknown) =>
      resolve({ data: rows(), error: null })
    return chain
  }

  return {
    supabaseAdmin: { from: (table: string) => makeBuilder(table) },
    __db: db,
  }
})

import { buildTrainingReport } from '@/lib/reports/training'
import * as supa from '@/lib/supabase-admin'

const db = (supa as unknown as { __db: Record<string, Record<string, unknown>[]> }).__db

const COMPANY_A = 'company-a'
const COMPANY_B = 'company-b'

function reset() {
  for (const k of Object.keys(db)) db[k] = []
}

beforeEach(reset)

describe('buildTrainingReport — reads ess_training_progress', () => {
  it('returns a row per ess_training_progress record, mapping its columns', async () => {
    db.ess_employees.push({ id: 'e1', company_id: COMPANY_A, full_name: 'Vol One', department: 'Outreach' })
    db.ess_training_modules.push({ id: 'mod-1', company_id: COMPANY_A, title: 'Safety 101' })
    db.ess_training_progress.push({
      id: 'p1',
      company_id: COMPANY_A,
      employee_id: 'e1',
      module_id: 'mod-1',
      percent_complete: 75,
      status: 'in_progress',
      started_at: '2026-01-01T00:00:00Z',
      completed_at: null,
    })

    const rows = await buildTrainingReport(COMPANY_A)

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      employee_id: 'e1',
      employee_name: 'Vol One',
      department: 'Outreach',
      module_id: 'mod-1',
      module_title: 'Safety 101',
      status: 'in_progress',
      progress_pct: 75,
      completed_at: null,
    })
  })

  it('returns ZERO rows when only the legacy ess_training_tracking table is populated', async () => {
    // The old (broken) code queried ess_training_tracking. If the fix is correct,
    // data in that table must be ignored entirely.
    db.ess_employees.push({ id: 'e1', company_id: COMPANY_A, full_name: 'Vol One', department: null })
    db.ess_training_tracking.push({
      id: 'legacy',
      company_id: COMPANY_A,
      employee_id: 'e1',
      module_id: 'mod-1',
      progress_pct: 50,
      status: 'in_progress',
    })

    const rows = await buildTrainingReport(COMPANY_A)
    expect(rows).toHaveLength(0)
  })

  it('does not leak rows across tenants', async () => {
    db.ess_employees.push({ id: 'e1', company_id: COMPANY_A, full_name: 'A', department: null })
    db.ess_training_progress.push(
      { id: 'p1', company_id: COMPANY_A, employee_id: 'e1', module_id: 'mod-1', percent_complete: 10, status: 'in_progress' },
      { id: 'p2', company_id: COMPANY_B, employee_id: 'eb', module_id: 'mod-b', percent_complete: 90, status: 'complete' },
    )
    const rows = await buildTrainingReport(COMPANY_A)
    expect(rows.map((r) => r.employee_id)).toEqual(['e1'])
  })
})

describe('buildTrainingReport — quiz_score via training_item_id -> module join', () => {
  it('populates quiz_score by resolving training_item_id to its module', async () => {
    db.ess_employees.push({ id: 'e1', company_id: COMPANY_A, full_name: 'Vol One', department: 'Outreach' })
    db.ess_training_modules.push({ id: 'mod-1', company_id: COMPANY_A, title: 'Safety 101' })
    db.ess_training_progress.push({
      id: 'p1',
      company_id: COMPANY_A,
      employee_id: 'e1',
      module_id: 'mod-1',
      percent_complete: 100,
      status: 'complete',
      completed_at: '2026-02-01T00:00:00Z',
    })
    // Quiz item belongs to mod-1 (this is the join the old code got wrong).
    db.ess_training_items.push({ id: 'item-1', company_id: COMPANY_A, module_id: 'mod-1', quiz_id: 'quiz-1' })
    db.ess_quiz_attempts.push({
      id: 'att-1',
      company_id: COMPANY_A,
      quiz_id: 'quiz-1',
      employee_id: 'e1',
      training_item_id: 'item-1',
      score: 88,
    })

    const rows = await buildTrainingReport(COMPANY_A)

    expect(rows).toHaveLength(1)
    expect(rows[0].quiz_score).toBe(88)
  })

  it('keeps only the best score per (employee, module) across multiple attempts', async () => {
    db.ess_employees.push({ id: 'e1', company_id: COMPANY_A, full_name: 'Vol One', department: null })
    db.ess_training_modules.push({ id: 'mod-1', company_id: COMPANY_A, title: 'Safety 101' })
    db.ess_training_progress.push({
      id: 'p1', company_id: COMPANY_A, employee_id: 'e1', module_id: 'mod-1', percent_complete: 100, status: 'complete',
    })
    db.ess_training_items.push({ id: 'item-1', company_id: COMPANY_A, module_id: 'mod-1', quiz_id: 'quiz-1' })
    db.ess_quiz_attempts.push(
      { id: 'att-1', company_id: COMPANY_A, quiz_id: 'quiz-1', employee_id: 'e1', training_item_id: 'item-1', score: 60 },
      { id: 'att-2', company_id: COMPANY_A, quiz_id: 'quiz-1', employee_id: 'e1', training_item_id: 'item-1', score: 92 },
      { id: 'att-3', company_id: COMPANY_A, quiz_id: 'quiz-1', employee_id: 'e1', training_item_id: 'item-1', score: 71 },
    )

    const rows = await buildTrainingReport(COMPANY_A)
    expect(rows[0].quiz_score).toBe(92)
  })

  it('leaves quiz_score null when no attempt links to the module', async () => {
    db.ess_employees.push({ id: 'e1', company_id: COMPANY_A, full_name: 'Vol One', department: null })
    db.ess_training_modules.push({ id: 'mod-1', company_id: COMPANY_A, title: 'Safety 101' })
    db.ess_training_progress.push({
      id: 'p1', company_id: COMPANY_A, employee_id: 'e1', module_id: 'mod-1', percent_complete: 40, status: 'in_progress',
    })
    // An item + attempt that belong to a DIFFERENT module — must not attach.
    db.ess_training_items.push({ id: 'item-2', company_id: COMPANY_A, module_id: 'mod-2', quiz_id: 'quiz-2' })
    db.ess_quiz_attempts.push({
      id: 'att-x', company_id: COMPANY_A, quiz_id: 'quiz-2', employee_id: 'e1', training_item_id: 'item-2', score: 99,
    })

    const rows = await buildTrainingReport(COMPANY_A)
    expect(rows).toHaveLength(1)
    expect(rows[0].quiz_score).toBeNull()
  })
})
