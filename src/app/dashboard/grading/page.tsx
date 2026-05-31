'use client'

// Phase 6 — manual-grade queue. Staff/Admin only. Lists submitted attempts with
// answers awaiting manual grading and links to each grading view.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { listGradingQueue } from '@/services/quiz'
import type { QuizAttempt } from '@/types/quiz'

type QueueItem = { attempt: QuizAttempt; quiz_title: string; pending: number }

export default function GradingQueuePage() {
  const [items, setItems] = useState<QueueItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    listGradingQueue()
      .then(setItems)
      .catch((e) => toast.error(e instanceof Error ? e.message : 'Failed to load queue'))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Grading Queue</h1>
        <p className="text-sm text-gray-500">Essays and short answers awaiting manual grading.</p>
      </div>

      {loading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : items.length === 0 ? (
        <div className="rounded-md border border-dashed p-8 text-center text-sm text-gray-500">
          Nothing to grade. 🎉
        </div>
      ) : (
        <div className="overflow-hidden rounded-md border">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-3">Quiz</th>
                <th className="px-4 py-3">Submitted</th>
                <th className="px-4 py-3">Pending</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {items.map(({ attempt, quiz_title, pending }) => (
                <tr key={attempt.id}>
                  <td className="px-4 py-3 font-medium">{quiz_title}</td>
                  <td className="px-4 py-3">
                    {attempt.submitted_at ? new Date(attempt.submitted_at).toLocaleString() : '—'}
                  </td>
                  <td className="px-4 py-3">{pending}</td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/dashboard/grading/${attempt.id}`} className="text-blue-600 hover:underline">
                      Grade
                    </Link>
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
