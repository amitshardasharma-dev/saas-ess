/**
 * @jest-environment jsdom
 */
import { saveBlob, filenameFromDisposition } from '@/lib/save-blob'

describe('saveBlob', () => {
  const createObjectURL = jest.fn(() => 'blob:mock-url')
  const revokeObjectURL = jest.fn()

  beforeEach(() => {
    jest.useFakeTimers()
    Object.assign(URL, { createObjectURL, revokeObjectURL })
    createObjectURL.mockClear()
    revokeObjectURL.mockClear()
  })
  afterEach(() => jest.useRealTimers())

  it('clicks a download link with the given filename', () => {
    const click = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    saveBlob(new Blob(['%PDF']), 'certificate-WHS.pdf')

    expect(click).toHaveBeenCalledTimes(1)
    const link = click.mock.contexts[0] as HTMLAnchorElement
    expect(link.download).toBe('certificate-WHS.pdf')
    expect(link.href).toBe('blob:mock-url')
    // The link is removed from the page after the click.
    expect(document.querySelector('a[download]')).toBeNull()
    click.mockRestore()
  })

  it('keeps the object URL alive after the click (iPhone Safari downloads asynchronously)', () => {
    jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    saveBlob(new Blob(['%PDF']), 'certificate.pdf')

    expect(revokeObjectURL).not.toHaveBeenCalled()
    jest.advanceTimersByTime(59_000)
    expect(revokeObjectURL).not.toHaveBeenCalled()
    jest.advanceTimersByTime(1_000)
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url')
  })
})

describe('filenameFromDisposition', () => {
  it('reads the quoted filename', () => {
    expect(filenameFromDisposition('attachment; filename="certificate-04-WHS.pdf"', 'x.pdf')).toBe('certificate-04-WHS.pdf')
  })
  it('falls back when the header is missing or has no filename', () => {
    expect(filenameFromDisposition(null, 'certificate.pdf')).toBe('certificate.pdf')
    expect(filenameFromDisposition('inline', 'certificate.pdf')).toBe('certificate.pdf')
  })
})
