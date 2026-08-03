// F4 CP3 (#61): the expense-report export — a download button, not an
// endpoint. RFC 4180 quoting: fields containing commas, quotes, or
// newlines are wrapped, embedded quotes doubled. CRLF row endings so
// spreadsheet apps agree on the shape.
export function toCsv(header: string[], rows: string[][]): string {
  const escapeField = (field: string) =>
    /[",\r\n]/.test(field) ? `"${field.replaceAll('"', '""')}"` : field
  return [header, ...rows]
    .map((row) => row.map(escapeField).join(','))
    .join('\r\n')
}

/** Trigger a client-side download of `content` as `filename`. */
export function downloadFile(
  filename: string,
  content: string,
  type = 'text/csv',
): void {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}
