/**
 * @jest-environment node
 */
import { toCsv } from '@/lib/export/csv'

describe('toCsv', () => {
  it('joins headers + rows with CRLF', () => {
    const csv = toCsv(['A', 'B'], [['1', '2'], ['3', '4']])
    expect(csv).toBe('A,B\r\n1,2\r\n3,4')
  })

  it('quotes fields containing comma, quote, or newline and doubles quotes', () => {
    const csv = toCsv(['name'], [['a,b'], ['he said "hi"'], ['line1\nline2']])
    expect(csv).toBe('name\r\n"a,b"\r\n"he said ""hi"""\r\n"line1\nline2"')
  })

  it('renders null/undefined as empty cells and stringifies numbers/booleans', () => {
    const csv = toCsv(['x', 'y', 'z'], [[null, undefined, 0], [true, false, 42]])
    expect(csv).toBe('x,y,z\r\n,,0\r\ntrue,false,42')
  })
})
