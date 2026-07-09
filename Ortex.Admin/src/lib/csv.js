// CSV helpers — export, raw download (templates) and a small RFC-4180 parser
// for the bulk-import flow. CSV opens natively in Excel/Sheets, so the
// "download template → fill in Excel → upload" loop needs no spreadsheet lib.

function cell(value) {
  let s = value == null ? "" : String(value)
  // Neutralize spreadsheet formula injection: Excel/Sheets evaluate any cell
  // that begins with = + - @ (or a leading tab/CR) as a formula, so a customer
  // name like `=HYPERLINK(...)` could exfiltrate data or run a command on the
  // staff machine that opens the export. Prefix such values with an apostrophe
  // so they are always treated as literal text.
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function triggerDownload(filename, text, mime = "text/csv;charset=utf-8;") {
  const blob = new Blob([text], { type: mime })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

// Columns: [{ header, value: (row) => cell }].
export function exportCsv(filename, columns, rows) {
  const header = columns.map((c) => cell(c.header)).join(",")
  const body = rows.map((row) => columns.map((c) => cell(c.value(row))).join(",")).join("\n")
  triggerDownload(filename, `${header}\n${body}`)
}

// Write a 2-D array of rows verbatim (used for import templates with sample rows).
export function downloadCsvRaw(filename, rows2d) {
  triggerDownload(filename, rows2d.map((r) => r.map(cell).join(",")).join("\n"))
}

// Parse CSV text into { headers, rows } where each row is an object keyed by
// header. Handles quoted fields, escaped quotes, embedded commas/newlines.
export function parseCsv(text) {
  const src = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n")
  const records = []
  let field = ""
  let row = []
  let inQuotes = false

  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"'
          i++
        } else inQuotes = false
      } else field += ch
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === ",") {
      row.push(field)
      field = ""
    } else if (ch === "\n") {
      row.push(field)
      records.push(row)
      row = []
      field = ""
    } else field += ch
  }
  if (field.length || row.length) {
    row.push(field)
    records.push(row)
  }

  const nonEmpty = records.filter((r) => r.some((c) => c.trim() !== ""))
  if (!nonEmpty.length) return { headers: [], rows: [] }
  const headers = nonEmpty[0].map((h) => h.trim())
  const rows = nonEmpty.slice(1).map((r) => {
    const obj = {}
    headers.forEach((h, idx) => (obj[h] = (r[idx] ?? "").trim()))
    return obj
  })
  return { headers, rows }
}
