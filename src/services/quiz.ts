// src/services/quiz.ts
//
// Client-side fetch wrappers for the Phase 6 quiz APIs. Bearer token comes from
// the auth store (same pattern as services/training.ts).

import type {
  Quiz,
  QuizAttempt,
  QuizWithQuestions,
} from '@/types/quiz'
import type {
  GradeAttemptInput,
  QuizUpsertInput,
  StartAttemptInput,
  SubmitAttemptInput,
} from '@/lib/quiz/schemas'

// Bearer token comes from localStorage ('ess_access_token') — the canonical
// source the app's auth-proxy writes and every other service reads. (The auth
// store does not expose a hydrated `token` field, so reading it returned
// undefined and produced spurious 401s.)
function authHeaders(): Record<string, string> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('ess_access_token') : null
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error((body as { error?: string })?.error || `Request failed (${res.status})`)
  }
  return res.json() as Promise<T>
}

// --- Builder / management ---

export async function listQuizzes(): Promise<Quiz[]> {
  const res = await fetch('/api/quizzes', { headers: authHeaders() })
  const { quizzes } = await handle<{ quizzes: Quiz[] }>(res)
  return quizzes
}

export async function getQuiz(id: string): Promise<QuizWithQuestions> {
  const res = await fetch(`/api/quizzes/${id}`, { headers: authHeaders() })
  const { quiz } = await handle<{ quiz: QuizWithQuestions }>(res)
  return quiz
}

export async function createQuiz(input: QuizUpsertInput): Promise<{ id: string }> {
  const res = await fetch('/api/quizzes', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(input),
  })
  return handle<{ id: string }>(res)
}

export async function updateQuiz(id: string, input: QuizUpsertInput): Promise<{ id: string }> {
  const res = await fetch(`/api/quizzes/${id}`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify(input),
  })
  return handle<{ id: string }>(res)
}

export async function duplicateQuizApi(id: string): Promise<{ id: string }> {
  const res = await fetch(`/api/quizzes/${id}/duplicate`, {
    method: 'POST',
    headers: authHeaders(),
  })
  return handle<{ id: string }>(res)
}

export async function deleteQuiz(id: string): Promise<void> {
  const res = await fetch(`/api/quizzes/${id}`, {
    method: 'DELETE',
    headers: authHeaders(),
  })
  await handle<{ ok: boolean }>(res)
}

// --- Runtime ---

export async function startAttempt(input: StartAttemptInput): Promise<{
  attempt: QuizAttempt
  quiz: QuizWithQuestions
}> {
  const res = await fetch('/api/quiz-attempts', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(input),
  })
  return handle<{ attempt: QuizAttempt; quiz: QuizWithQuestions }>(res)
}

export async function submitAttempt(
  attemptId: string,
  input: SubmitAttemptInput
): Promise<{ attempt: QuizAttempt }> {
  const res = await fetch(`/api/quiz-attempts/${attemptId}/submit`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(input),
  })
  return handle<{ attempt: QuizAttempt }>(res)
}

export async function listAttempts(params: {
  employee_id?: string
  quiz_id?: string
}): Promise<QuizAttempt[]> {
  const qs = new URLSearchParams()
  if (params.employee_id) qs.set('employee_id', params.employee_id)
  if (params.quiz_id) qs.set('quiz_id', params.quiz_id)
  const res = await fetch(`/api/quiz-attempts?${qs.toString()}`, { headers: authHeaders() })
  const { attempts } = await handle<{ attempts: QuizAttempt[] }>(res)
  return attempts
}

// --- Grading queue ---

export interface GradingQueueItem {
  attempt: QuizAttempt
  quiz_title: string
  pending: number
}

export async function listGradingQueue(): Promise<GradingQueueItem[]> {
  const res = await fetch('/api/grading', { headers: authHeaders() })
  const { items } = await handle<{ items: GradingQueueItem[] }>(res)
  return items
}

export async function getGradingAttempt(attemptId: string): Promise<{
  attempt: QuizAttempt
  quiz: QuizWithQuestions | null
  answers: import('@/types/quiz').QuizAnswer[]
}> {
  const res = await fetch(`/api/grading/${attemptId}`, { headers: authHeaders() })
  return handle(res)
}

export async function gradeAttempt(
  attemptId: string,
  input: GradeAttemptInput
): Promise<{ attempt: QuizAttempt }> {
  const res = await fetch(`/api/grading/${attemptId}`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(input),
  })
  return handle<{ attempt: QuizAttempt }>(res)
}
