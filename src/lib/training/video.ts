// src/lib/training/video.ts
//
// Pure (no I/O) video URL parsing: provider detection + embed URL building.
// Client- and test-safe (no Supabase import). Used by the module builder UI,
// the video embed component, and the items API.

import type { VideoProvider } from '@/types/training'

/** Detect the provider for a video URL. Returns 'other' for unknown hosts. */
export function detectVideoProvider(url: string): VideoProvider {
  const u = url.trim().toLowerCase()
  if (/(?:youtube\.com|youtu\.be)/.test(u)) return 'youtube'
  if (/vimeo\.com/.test(u)) return 'vimeo'
  return 'other'
}

/** Extract the YouTube video id from any common YouTube URL form. */
export function youtubeId(url: string): string | null {
  // https://www.youtube.com/watch?v=ID, youtu.be/ID, /embed/ID, /shorts/ID
  const patterns = [
    /[?&]v=([a-zA-Z0-9_-]{6,})/,
    /youtu\.be\/([a-zA-Z0-9_-]{6,})/,
    /youtube\.com\/embed\/([a-zA-Z0-9_-]{6,})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{6,})/,
  ]
  for (const p of patterns) {
    const m = url.match(p)
    if (m) return m[1]
  }
  return null
}

/** Extract the numeric Vimeo id from a Vimeo URL. */
export function vimeoId(url: string): string | null {
  const m = url.match(/vimeo\.com\/(?:video\/)?(\d{6,})/)
  return m ? m[1] : null
}

/**
 * Build an embeddable iframe src for a video URL. Returns null when the URL
 * cannot be turned into a known embed (caller can fall back to a plain link).
 */
export function videoEmbedUrl(url: string): string | null {
  const provider = detectVideoProvider(url)
  if (provider === 'youtube') {
    const id = youtubeId(url)
    return id ? `https://www.youtube.com/embed/${id}` : null
  }
  if (provider === 'vimeo') {
    const id = vimeoId(url)
    return id ? `https://player.vimeo.com/video/${id}` : null
  }
  return null
}
