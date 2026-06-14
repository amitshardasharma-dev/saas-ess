// Reusable CSV serializer. RFC-4180-ish: quotes a field containing a comma,
// quote, CR or LF; doubles embedded quotes; joins rows with CRLF.
//
// MERGE NOTE: Phase 7 may also introduce src/lib/export/csv.ts. First-merged
// wins; the second phase deletes its dup (see MERGE_NOTES.md). Keep this generic
// so either copy is interchangeable.

export type CsvCell = string | number | boolean | null | undefined

function escapeCell(value: CsvCell): string {
  if (value === null || value === undefined) return ''
  const str = String(value)
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

/**
 * Serialize rows to CSV.
 * @param headers column headers (already label-resolved by the caller).
 * @param rows    array of cell arrays, aligned to `headers`.
 */
export function toCsv(headers: CsvCell[], rows: CsvCell[][]): string {
  const lines = [headers, ...rows].map((row) => row.map(escapeCell).join(','))
  return lines.join('\r\n')
}
