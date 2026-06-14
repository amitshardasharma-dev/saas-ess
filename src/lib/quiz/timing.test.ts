// Phase 6 — server-authoritative time + attempt-limit unit tests (pure).

import {
  TIME_LIMIT_GRACE_SECONDS,
  canStartAttempt,
  deadlineMs,
  elapsedSeconds,
  isExpired,
  nextAttemptNo,
} from './timing'

const START = '2026-01-01T00:00:00.000Z'
const startMs = new Date(START).getTime()

describe('deadlineMs', () => {
  it('is null when there is no time limit', () => {
    expect(deadlineMs(START, null)).toBeNull()
  })
  it('adds the limit in milliseconds', () => {
    expect(deadlineMs(START, 600)).toBe(startMs + 600_000)
  })
})

describe('isExpired', () => {
  it('never expires without a limit', () => {
    expect(isExpired(START, null, startMs + 10_000_000)).toBe(false)
  })
  it('is not expired before the deadline', () => {
    expect(isExpired(START, 600, startMs + 599_000)).toBe(false)
  })
  it('allows the grace buffer right at the deadline', () => {
    expect(isExpired(START, 600, startMs + 600_000 + TIME_LIMIT_GRACE_SECONDS * 1000)).toBe(false)
  })
  it('is expired past the deadline + grace', () => {
    expect(isExpired(START, 600, startMs + 600_000 + (TIME_LIMIT_GRACE_SECONDS + 1) * 1000)).toBe(true)
  })
})

describe('elapsedSeconds', () => {
  it('floors to whole seconds and never goes negative', () => {
    expect(elapsedSeconds(START, startMs + 5_900)).toBe(5)
    expect(elapsedSeconds(START, startMs - 1000)).toBe(0)
  })
})

describe('canStartAttempt / nextAttemptNo', () => {
  it('allows unlimited attempts when limit is null', () => {
    expect(canStartAttempt(null, 999)).toBe(true)
  })
  it('blocks the (limit+1)th attempt', () => {
    expect(canStartAttempt(2, 0)).toBe(true)
    expect(canStartAttempt(2, 1)).toBe(true)
    expect(canStartAttempt(2, 2)).toBe(false)
  })
  it('computes the next 1-based attempt number', () => {
    expect(nextAttemptNo(0)).toBe(1)
    expect(nextAttemptNo(2)).toBe(3)
  })
})
