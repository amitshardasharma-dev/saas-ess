'use client'

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-4xl font-bold mb-2">Something went wrong</h1>
        <p className="text-muted-foreground mb-4">An unexpected error occurred</p>
        <button onClick={reset} className="text-primary hover:underline">
          Try again
        </button>
      </div>
    </div>
  )
}
