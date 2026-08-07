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

// --- parsing (F10 CP6, #92): the import wizard's file preview ------------
// The backend does the authoritative parse (imports/parsing.py) once a
// mapping is confirmed; this is only for showing the user their own file's
// columns before that round trip. `toCsv`'s inverse.

const DELIMITER_CANDIDATES = [',', ';', '\t', '|']

/** A light client-side echo of the backend's `csv.Sniffer` (sniff_delimiter
 * in imports/inference.py): whichever candidate splits the first line into
 * the most fields wins, comma on a tie or no signal. Only seeds the mapping
 * form's initial delimiter choice — never the parse the commit relies on. */
export function sniffDelimiter(sample: string): string {
  const firstLine = sample.split(/\r\n|\n|\r/, 1)[0] ?? ''
  let best = ','
  let bestCount = 0
  for (const candidate of DELIMITER_CANDIDATES) {
    const count = firstLine.split(candidate).length - 1
    if (count > bestCount) {
      bestCount = count
      best = candidate
    }
  }
  return best
}

/** Parse delimited text into records of raw string fields — RFC 4180
 * quoting honored (embedded delimiters/newlines inside a quoted field,
 * doubled quotes as an escaped quote), CRLF and bare LF both accepted. A
 * trailing blank line produces no phantom empty record. */
export function parseCsvRecords(text: string, delimiter = ','): string[][] {
  const records: string[][] = []
  let field = ''
  let record: string[] = []
  let inQuotes = false
  let i = 0
  const len = text.length
  const pushField = () => {
    record.push(field)
    field = ''
  }
  const pushRecord = () => {
    pushField()
    records.push(record)
    record = []
  }
  while (i < len) {
    const char = text[i]
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i += 2
          continue
        }
        inQuotes = false
        i += 1
        continue
      }
      field += char
      i += 1
      continue
    }
    if (char === '"' && field === '') {
      inQuotes = true
      i += 1
      continue
    }
    if (char === delimiter) {
      pushField()
      i += 1
      continue
    }
    if (char === '\r' && text[i + 1] === '\n') {
      pushRecord()
      i += 2
      continue
    }
    if (char === '\n' || char === '\r') {
      pushRecord()
      i += 1
      continue
    }
    field += char
    i += 1
  }
  // A trailing field/record only when the file didn't end on a line break.
  if (field !== '' || record.length > 0) pushRecord()
  return records
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
