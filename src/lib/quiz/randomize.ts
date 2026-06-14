// src/lib/quiz/randomize.ts
//
// Pure deterministic question ordering for Phase 6. Randomization is purely a
// PRESENTATION concern — grading always matches answers to questions by id, so a
// shuffled order can never change the score. We seed the shuffle with the attempt
// id so a given attempt sees a STABLE order across reloads.

/** Mulberry32 PRNG — small, fast, deterministic from a 32-bit seed. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Hash an arbitrary string to a 32-bit seed (FNV-1a). */
export function seedFromString(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** Return a new array shuffled deterministically by `seed` (Fisher-Yates). */
export function seededShuffle<T>(items: readonly T[], seed: number): T[] {
  const arr = items.slice()
  const rand = mulberry32(seed)
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

/**
 * Order questions for presentation. When `randomize` is false the original
 * order is preserved; otherwise a stable per-attempt shuffle (seeded by the
 * attempt id) is applied.
 */
export function orderQuestions<T>(questions: readonly T[], randomize: boolean, attemptId: string): T[] {
  if (!randomize) return questions.slice()
  return seededShuffle(questions, seedFromString(attemptId))
}
