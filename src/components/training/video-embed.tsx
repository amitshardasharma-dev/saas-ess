// src/components/training/video-embed.tsx
//
// Renders an embeddable player for a YouTube/Vimeo URL, or a graceful link
// fallback for other providers. Pure presentational (no tracking here). Shows a
// lightweight loading shimmer until the iframe reports loaded so the 16:9 frame
// never flashes empty.

'use client'

import { useState } from 'react'
// Import the pure video helper directly (NOT the @/lib/training barrel, which
// re-exports server-only modules that value-import supabaseAdmin and crash the
// client bundle with "supabaseKey is required").
import { videoEmbedUrl } from '@/lib/training/video'
import { Button } from '@/components/ui/button'
import { ExternalLink, Loader2, Video } from 'lucide-react'

interface VideoEmbedProps {
  url: string
  title?: string
}

export function VideoEmbed({ url, title }: VideoEmbedProps) {
  const embed = videoEmbedUrl(url)
  const [loaded, setLoaded] = useState(false)

  if (!embed) {
    return (
      <div className="flex flex-col items-start gap-3 rounded-lg border bg-muted/40 p-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Video className="h-4 w-4 shrink-0" />
          This video opens with its original provider.
        </div>
        <Button asChild variant="outline" size="sm">
          <a href={url} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="h-4 w-4" /> Open video in a new tab
          </a>
        </Button>
      </div>
    )
  }

  return (
    <div
      className="relative w-full overflow-hidden rounded-lg border bg-muted"
      style={{ paddingTop: '56.25%' }}
    >
      {!loaded ? (
        <div
          className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-muted-foreground"
          aria-hidden
        >
          <Loader2 className="h-4 w-4 animate-spin" /> Loading video…
        </div>
      ) : null}
      <iframe
        className={`absolute inset-0 h-full w-full transition-opacity duration-300 ${
          loaded ? 'opacity-100' : 'opacity-0'
        }`}
        src={embed}
        title={title ?? 'Training video'}
        loading="lazy"
        onLoad={() => setLoaded(true)}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
      />
    </div>
  )
}
