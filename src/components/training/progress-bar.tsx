// src/components/training/progress-bar.tsx
//
// Small reusable percent-complete bar for module/learning views.

interface ProgressBarProps {
  percent: number
  className?: string
}

export function ProgressBar({ percent, className }: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(100, Math.round(percent)))
  return (
    <div className={`w-full ${className ?? ''}`}>
      <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200">
        <div
          className="h-full rounded-full bg-green-600 transition-all"
          style={{ width: `${clamped}%` }}
        />
      </div>
      <span className="mt-1 block text-xs text-gray-500">{clamped}% complete</span>
    </div>
  )
}
