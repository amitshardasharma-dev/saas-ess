'use client'

import { useEffect, useState } from 'react'
import { X, Info, AlertTriangle, AlertOctagon } from 'lucide-react'
import { announcementService } from '@/services/announcement'
import { Announcement } from '@/types/platform'

const TYPE_CONFIG = {
  info: {
    bg: 'bg-blue-50 border-blue-200',
    text: 'text-blue-900',
    icon: Info,
    iconColor: 'text-blue-500',
    dismissBtn: 'text-blue-400 hover:text-blue-600 hover:bg-blue-100',
  },
  warning: {
    bg: 'bg-amber-50 border-amber-200',
    text: 'text-amber-900',
    icon: AlertTriangle,
    iconColor: 'text-amber-500',
    dismissBtn: 'text-amber-400 hover:text-amber-600 hover:bg-amber-100',
  },
  critical: {
    bg: 'bg-red-50 border-red-200',
    text: 'text-red-900',
    icon: AlertOctagon,
    iconColor: 'text-red-500',
    dismissBtn: 'text-red-400 hover:text-red-600 hover:bg-red-100',
  },
}

export function AnnouncementBanner() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [dismissing, setDismissing] = useState<Set<string>>(new Set())

  useEffect(() => {
    announcementService.getActive().then(setAnnouncements).catch(() => {})
  }, [])

  async function handleDismiss(id: string) {
    setDismissing(prev => new Set(prev).add(id))
    try {
      await announcementService.dismiss(id)
      setAnnouncements(prev => prev.filter(a => a.id !== id))
    } catch {
      // Optimistically hide anyway — user intent was to dismiss
      setAnnouncements(prev => prev.filter(a => a.id !== id))
    } finally {
      setDismissing(prev => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    }
  }

  if (announcements.length === 0) return null

  return (
    <div className="flex flex-col gap-0">
      {announcements.map(a => {
        const cfg = TYPE_CONFIG[a.type]
        const Icon = cfg.icon
        const canDismiss = a.type !== 'critical'

        return (
          <div
            key={a.id}
            className={`flex items-start gap-3 px-4 py-3 border-b ${cfg.bg} ${cfg.text}`}
          >
            {/* Icon */}
            <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${cfg.iconColor}`} />

            {/* Content */}
            <div className="flex-1 min-w-0 text-sm">
              <span className="font-semibold">{a.title}</span>
              {a.message && (
                <span className="ml-2 font-normal opacity-90">{a.message}</span>
              )}
              {a.link_url && (
                <a
                  href={a.link_url}
                  target="_blank"
                  rel="noreferrer"
                  className="ml-3 underline underline-offset-2 font-medium opacity-90 hover:opacity-100"
                >
                  {a.link_text || 'Learn more'}
                </a>
              )}
            </div>

            {/* Dismiss button — not shown for critical */}
            {canDismiss && (
              <button
                onClick={() => handleDismiss(a.id)}
                disabled={dismissing.has(a.id)}
                aria-label="Dismiss announcement"
                className={`shrink-0 p-1 rounded-md transition-colors ${cfg.dismissBtn} disabled:opacity-40`}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}
