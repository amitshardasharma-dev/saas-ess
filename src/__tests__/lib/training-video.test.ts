/**
 * @jest-environment node
 */
// Pure video URL parsing — provider detection + embed URL building.
import {
  detectVideoProvider,
  videoEmbedUrl,
  youtubeId,
  vimeoId,
} from '@/lib/training/video'

describe('detectVideoProvider', () => {
  it('detects YouTube in all common forms', () => {
    expect(detectVideoProvider('https://www.youtube.com/watch?v=abc123')).toBe('youtube')
    expect(detectVideoProvider('https://youtu.be/abc123')).toBe('youtube')
  })
  it('detects Vimeo', () => {
    expect(detectVideoProvider('https://vimeo.com/123456789')).toBe('vimeo')
  })
  it('falls back to other for unknown hosts', () => {
    expect(detectVideoProvider('https://example.com/clip.mp4')).toBe('other')
  })
})

describe('id extraction', () => {
  it('extracts YouTube ids', () => {
    expect(youtubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
    expect(youtubeId('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
    expect(youtubeId('https://www.youtube.com/embed/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
  })
  it('extracts Vimeo ids', () => {
    expect(vimeoId('https://vimeo.com/123456789')).toBe('123456789')
    expect(vimeoId('https://vimeo.com/video/123456789')).toBe('123456789')
  })
})

describe('videoEmbedUrl', () => {
  it('builds embed urls for YouTube and Vimeo', () => {
    expect(videoEmbedUrl('https://youtu.be/dQw4w9WgXcQ')).toBe(
      'https://www.youtube.com/embed/dQw4w9WgXcQ'
    )
    expect(videoEmbedUrl('https://vimeo.com/123456789')).toBe(
      'https://player.vimeo.com/video/123456789'
    )
  })
  it('returns null for non-embeddable urls', () => {
    expect(videoEmbedUrl('https://example.com/clip.mp4')).toBeNull()
  })
})
