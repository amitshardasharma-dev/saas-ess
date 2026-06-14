// src/components/training/video-embed.tsx
//
// Renders an embeddable player for a YouTube/Vimeo URL, or a plain link
// fallback for other providers. Pure presentational (no tracking here).

'use client'

// Import the pure video helper directly (NOT the @/lib/training barrel, which
// re-exports server-only modules that value-import supabaseAdmin and crash the
// client bundle with "supabaseKey is required").
import { videoEmbedUrl } from '@/lib/training/video'

interface VideoEmbedProps {
  url: string
  title?: string
}

export function VideoEmbed({ url, title }: VideoEmbedProps) {
  const embed = videoEmbedUrl(url)

  if (!embed) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-sm text-blue-600 underline"
      >
        Open video in a new tab
      </a>
    )
  }

  return (
    <div className="relative w-full overflow-hidden rounded-lg" style={{ paddingTop: '56.25%' }}>
      <iframe
        className="absolute inset-0 h-full w-full"
        src={embed}
        title={title ?? 'Training video'}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
      />
    </div>
  )
}
