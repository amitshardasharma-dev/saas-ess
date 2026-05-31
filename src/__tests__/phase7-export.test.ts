// Phase 7 — export utility tests. Pure functions; no env/network.

import { toCsv } from '@/lib/export/csv'
import { rowsToCsv, toXlsx, buildExport, type ExportColumn } from '@/lib/export'

interface Row {
  name: string
  score: number | null
}

const columns: ExportColumn<Row>[] = [
  { header: 'Volunteer', value: (r) => r.name },
  { header: 'Score', value: (r) => r.score },
]

const rows: Row[] = [
  { name: 'Ada Lovelace', score: 95 },
  { name: 'Grace, Hopper', score: null },
]

describe('phase7 export', () => {
  it('reuses Phase 3 toCsv and resolves headers from column defs', () => {
    const csv = rowsToCsv(columns, rows)
    const lines = csv.split('\r\n')
    expect(lines[0]).toBe('Volunteer,Score')
    expect(lines[1]).toBe('Ada Lovelace,95')
    // A comma in a value must be quoted; null becomes empty.
    expect(lines[2]).toBe('"Grace, Hopper",')
  })

  it('toCsv is the shared serializer', () => {
    expect(toCsv(['A', 'B'], [[1, 2]])).toBe('A,B\r\n1,2')
  })

  it('toXlsx emits SpreadsheetML with header + body rows', () => {
    const xml = toXlsx(['Volunteer', 'Score'], [['Ada', 95]])
    expect(xml).toContain('<?mso-application progid="Excel.Sheet"?>')
    expect(xml).toContain('ss:Type="String"')
    expect(xml).toContain('ss:Type="Number"')
    expect(xml).toContain('Ada')
  })

  it('buildExport returns csv vs xls with correct content types', () => {
    const csv = buildExport(columns, rows, 'csv', 'training-report')
    expect(csv.filename).toBe('training-report.csv')
    expect(csv.contentType).toContain('text/csv')

    const xls = buildExport(columns, rows, 'xlsx', 'training-report')
    expect(xls.filename).toBe('training-report.xls')
    expect(xls.contentType).toContain('vnd.ms-excel')
  })
})
