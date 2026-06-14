/**
 * @jest-environment node
 */
// Pure progress math (no Supabase) — fast unit tests for the completion rule:
// required-complete / required-total, optional items ignored.
import {
  computePercentComplete,
  statusForPercent,
  completedItemIds,
} from '@/lib/training/progress'

describe('computePercentComplete', () => {
  const items = [
    { id: 'a', required: true },
    { id: 'b', required: true },
    { id: 'c', required: false }, // optional — ignored
    { id: 'd', required: true },
  ]

  it('is the ratio of completed required items to total required', () => {
    expect(computePercentComplete(items, [])).toBe(0)
    expect(computePercentComplete(items, ['a'])).toBe(33) // 1/3 required
    expect(computePercentComplete(items, ['a', 'b'])).toBe(67) // 2/3
    expect(computePercentComplete(items, ['a', 'b', 'd'])).toBe(100)
  })

  it('ignores optional items entirely', () => {
    // Completing only the optional item leaves 0% (no required done).
    expect(computePercentComplete(items, ['c'])).toBe(0)
    // Completing all required is 100% even if the optional is not done.
    expect(computePercentComplete(items, ['a', 'b', 'd'])).toBe(100)
  })

  it('treats a module with zero required items as complete', () => {
    expect(computePercentComplete([{ id: 'x', required: false }], [])).toBe(100)
    expect(computePercentComplete([], [])).toBe(100)
  })

  it('accepts a Set as well as an array', () => {
    expect(computePercentComplete(items, new Set(['a', 'b']))).toBe(67)
  })
})

describe('statusForPercent', () => {
  it('maps percent to status', () => {
    expect(statusForPercent(0)).toBe('not_started')
    expect(statusForPercent(50)).toBe('in_progress')
    expect(statusForPercent(100)).toBe('complete')
  })
})

describe('completedItemIds', () => {
  it('collects only items whose progress status is complete', () => {
    const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
    const progress = new Map<string, { status: 'not_started' | 'in_progress' | 'complete' }>([
      ['a', { status: 'complete' }],
      ['b', { status: 'in_progress' }],
    ])
    const done = completedItemIds(items, progress)
    expect(done.has('a')).toBe(true)
    expect(done.has('b')).toBe(false)
    expect(done.has('c')).toBe(false)
  })
})
