/**
 * Save a Blob as a file download in the browser.
 *
 * The object URL is revoked after a delay, not straight after `click()`.
 * Safari on iPhone starts the download asynchronously, so revoking the URL at
 * once cancels it and nothing is saved (volunteers could not download their
 * training certificates). Desktop browsers do not need the delay, but it does
 * no harm there.
 */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

/** The filename from a `Content-Disposition` header, or `fallback`. */
export function filenameFromDisposition(header: string | null, fallback: string): string {
  const match = /filename="([^"]+)"/.exec(header ?? '')
  return match ? match[1] : fallback
}
