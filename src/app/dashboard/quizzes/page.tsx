'use client'

// Phase 6 — quiz management (no-code builder home). Lists quizzes for the tenant
// with create / edit / duplicate / delete actions. Staff/Admin only (also gated
// server-side + by nav minRole).

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import type { Quiz } from '@/types/quiz'
import {
  listQuizzes,
  duplicateQuizApi,
  deleteQuiz as deleteQuizApi,
} from '@/services/quiz'

export default function QuizzesPage() {
  const [quizzes, setQuizzes] = useState<Quiz[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setQuizzes(await listQuizzes())
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load quizzes')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function handleDuplicate(id: string) {
    setBusyId(id)
    try {
      await duplicateQuizApi(id)
      toast.success('Quiz duplicated')
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Duplicate failed')
    } finally {
      setBusyId(null)
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm('Delete this quiz? This cannot be undone.')) return
    setBusyId(id)
    try {
      await deleteQuizApi(id)
      toast.success('Quiz deleted')
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Delete failed')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Quizzes</h1>
          <p className="text-sm text-gray-500">Build and manage assessments — no code required.</p>
        </div>
        <Link
          href="/dashboard/quizzes/new"
          className="inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          New Quiz
        </Link>
      </div>

      {loading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : quizzes.length === 0 ? (
        <div className="rounded-md border border-dashed p-8 text-center text-sm text-gray-500">
          No quizzes yet. Create your first assessment.
        </div>
      ) : (
        <div className="overflow-hidden rounded-md border">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-3">Title</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Pass %</th>
                <th className="px-4 py-3">Attempts</th>
                <th className="px-4 py-3">Time</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {quizzes.map((q) => (
                <tr key={q.id}>
                  <td className="px-4 py-3 font-medium">{q.title}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs capitalize">
                      {q.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">{q.passing_score}%</td>
                  <td className="px-4 py-3">{q.attempt_limit ?? '∞'}</td>
                  <td className="px-4 py-3">
                    {q.time_limit_seconds ? `${Math.round(q.time_limit_seconds / 60)}m` : '—'}
                  </td>
                  <td className="px-4 py-3 text-right space-x-3">
                    <Link href={`/dashboard/quizzes/${q.id}`} className="text-blue-600 hover:underline">
                      Edit
                    </Link>
                    <button
                      type="button"
                      disabled={busyId === q.id}
                      onClick={() => handleDuplicate(q.id)}
                      className="text-gray-600 hover:underline disabled:opacity-50"
                    >
                      Duplicate
                    </button>
                    <button
                      type="button"
                      disabled={busyId === q.id}
                      onClick={() => handleDelete(q.id)}
                      className="text-red-600 hover:underline disabled:opacity-50"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
