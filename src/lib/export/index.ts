// src/lib/export/index.ts
//
// Phase 7 export helpers. We REUSE the Phase 3 CSV serializer (src/lib/export/csv.ts,
// `toCsv`) rather than duplicating it (see MERGE_NOTES.md — dedupe decision). This
// module adds a thin, dependency-free spreadsheet export (SpreadsheetML 2003 XML,
// which Excel opens natively as .xls) plus a typed row->matrix mapper so report
// endpoints stay declarative. No new npm dependency is required.

import { toCsv, type CsvCell } from './csv'

export { toCsv }
export type { CsvCell }

/** A column definition: a label-resolved header + how to read it from a row. */
export interface ExportColumn<T> {
  header: string
  value: (row: T) => CsvCell
}

/** Resolve headers + value-matrix from typed rows via column defs. */
export function buildMatrix<T>(columns: ExportColumn<T>[], rows: T[]): { headers: CsvCell[]; matrix: CsvCell[][] } {
  const headers = columns.map((c) => c.header)
  const matrix = rows.map((row) => columns.map((c) => c.value(row)))
  return { headers, matrix }
}

/** Serialize typed rows directly to CSV using column defs. */
export function rowsToCsv<T>(columns: ExportColumn<T>[], rows: T[]): string {
  const { headers, matrix } = buildMatrix(columns, rows)
  return toCsv(headers, matrix)
}

function escapeXml(value: CsvCell): string {
  if (value === null || value === undefined) return ''
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function cellXml(value: CsvCell): string {
  const isNumber = typeof value === 'number' && Number.isFinite(value)
  const type = isNumber ? 'Number' : 'String'
  return `<Cell><Data ss:Type="${type}">${escapeXml(value)}</Data></Cell>`
}

/**
 * Serialize to SpreadsheetML 2003 (.xls XML). Excel/Sheets open it natively and it
 * needs no third-party library. `headers` should already be label-resolved.
 */
export function toXlsx(headers: CsvCell[], rows: CsvCell[][], sheetName = 'Report'): string {
  const headerRow = `<Row>${headers.map((h) => `<Cell><Data ss:Type="String">${escapeXml(h)}</Data></Cell>`).join('')}</Row>`
  const bodyRows = rows.map((r) => `<Row>${r.map(cellXml).join('')}</Row>`).join('')
  return [
    '<?xml version="1.0"?>',
    '<?mso-application progid="Excel.Sheet"?>',
    '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">',
    `<Worksheet ss:Name="${escapeXml(sheetName)}">`,
    '<Table>',
    headerRow,
    bodyRows,
    '</Table>',
    '</Worksheet>',
    '</Workbook>',
  ].join('')
}

/** Serialize typed rows directly to SpreadsheetML using column defs. */
export function rowsToXlsx<T>(columns: ExportColumn<T>[], rows: T[], sheetName = 'Report'): string {
  const { headers, matrix } = buildMatrix(columns, rows)
  return toXlsx(headers, matrix, sheetName)
}

export type ExportFormat = 'csv' | 'xlsx'

export interface ExportResponseInit {
  body: string
  contentType: string
  filename: string
}

/** Build the HTTP body + headers for a file download in the requested format. */
export function buildExport<T>(
  columns: ExportColumn<T>[],
  rows: T[],
  format: ExportFormat,
  baseName: string,
): ExportResponseInit {
  if (format === 'xlsx') {
    return {
      body: rowsToXlsx(columns, rows, baseName),
      contentType: 'application/vnd.ms-excel; charset=utf-8',
      filename: `${baseName}.xls`,
    }
  }
  return {
    body: rowsToCsv(columns, rows),
    contentType: 'text/csv; charset=utf-8',
    filename: `${baseName}.csv`,
  }
}
