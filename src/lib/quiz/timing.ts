// src/lib/quiz/timing.ts
//
// Pure server-authoritative time + attempt-limit helpers for Phase 6. No I/O.

/**
 * Given an attempt's started_at and the quiz time limit, determine whether the
 * submission time is past the allowed window. A small grace buffer absorbs
 * network/clock skew so a borderline-on-time client is not unfairly rejected.
 */
export const TIME_LIMIT_GRACE_SECONDS = 5

export function deadlineMs(startedAtIso: string, timeLimitSeconds: number | null): number | null {
  if (timeLimitSeconds == null) return null
  return new Date(startedAtIso).getTime() + timeLimitSeconds * 1000
}

/** Has the attempt exceeded its time limit at `nowMs`? Always false if no limit. */
export function isExpired(
  startedAtIso: string,
  timeLimitSeconds: number | null,
  nowMs: number = Date.now()
): boolean {
  const dl = deadlineMs(startedAtIso, timeLimitSeconds)
  if (dl == null) return false
  return nowMs > dl + TIME_LIMIT_GRACE_SECONDS * 1000
}

/** Whole seconds elapsed between started_at and `nowMs` (clamped >= 0). */
export function elapsedSeconds(startedAtIso: string, nowMs: number = Date.now()): number {
  const ms = nowMs - new Date(startedAtIso).getTime()
  return Math.max(0, Math.floor(ms / 1000))
}

/**
 * Can a new attempt be started? `attemptLimit` null means unlimited.
 * `priorAttempts` is the count of existing attempts for (employee, quiz).
 */
export function canStartAttempt(attemptLimit: number | null, priorAttempts: number): boolean {
  if (attemptLimit == null) return true
  return priorAttempts < attemptLimit
}

/** The attempt_no for the next attempt (1-based). */
export function nextAttemptNo(priorAttempts: number): number {
  return priorAttempts + 1
}
